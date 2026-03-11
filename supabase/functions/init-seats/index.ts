import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { library_id } = body;

    if (!library_id) {
      return new Response(JSON.stringify({ error: "Missing library_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch library details
    const { data: library, error: libError } = await supabase
      .from("libraries")
      .select("total_seats, male_seats, female_seats")
      .eq("id", library_id)
      .single();

    if (libError || !library) {
      return new Response(JSON.stringify({ error: "Library not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if seats already exist
    const { count, error: countError } = await supabase
      .from("seats")
      .select("*", { count: "exact", head: true })
      .eq("library_id", library_id);

    if (countError) {
      throw new Error("Failed to check existing seats");
    }

    if (count && count > 0) {
      return new Response(JSON.stringify({ message: "Seats already initialized" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const seatRows = [];
    const maleSeats = library.male_seats || 0;
    const femaleSeats = library.female_seats || 0;
    
    if (maleSeats > 0 || femaleSeats > 0) {
      // Gender-specific numbering
      for (let i = 1; i <= maleSeats; i++) {
        seatRows.push({
          library_id,
          seat_number: `M${i}`,
          gender: "male",
        });
      }
      for (let i = 1; i <= femaleSeats; i++) {
        seatRows.push({
          library_id,
          seat_number: `F${i}`,
          gender: "female",
        });
      }
    } else {
      // Generic numbering fallback
      const totalSeats = library.total_seats || 0;
      for (let i = 1; i <= totalSeats; i++) {
        seatRows.push({
          library_id,
          seat_number: `${i}`,
          gender: "any",
        });
      }
    }

    if (seatRows.length > 0) {
      // Insert in batches if very large, but single batch is fine for < 1000
      const { error: insertError } = await supabase
        .from("seats")
        .insert(seatRows);

      if (insertError) {
        throw new Error("Failed to initialize seats: " + insertError.message);
      }
    }

    return new Response(JSON.stringify({ success: true, count: seatRows.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error initializing seats:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
