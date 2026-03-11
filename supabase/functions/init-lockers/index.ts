import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { library_id, male_lockers, female_lockers } = body;

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
      .select("total_lockers")
      .eq("id", library_id)
      .single();

    if (libError || !library) {
      return new Response(JSON.stringify({ error: "Library not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if lockers already exist
    const { count, error: countError } = await supabase
      .from("lockers")
      .select("*", { count: "exact", head: true })
      .eq("library_id", library_id);

    if (countError) {
      throw new Error("Failed to check existing lockers");
    }

    if (count && count > 0) {
      return new Response(JSON.stringify({ message: "Lockers already initialized" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lockerRows = [];
    const maleLockers = Number.isFinite(Number(male_lockers)) ? Number(male_lockers) : 0;
    const femaleLockers = Number.isFinite(Number(female_lockers)) ? Number(female_lockers) : 0;
    
    if (maleLockers > 0 || femaleLockers > 0) {
      // Gender-specific locker numbering
      for (let i = 1; i <= maleLockers; i++) {
        lockerRows.push({
          library_id,
          locker_number: `ML${i}`,
          gender: "male",
        });
      }
      for (let i = 1; i <= femaleLockers; i++) {
        lockerRows.push({
          library_id,
          locker_number: `FL${i}`,
          gender: "female",
        });
      }
    } else {
      // Generic numbering fallback
      const totalLockers = library.total_lockers || 0;
      for (let i = 1; i <= totalLockers; i++) {
        lockerRows.push({
          library_id,
          locker_number: `L${i}`,
          gender: "any",
        });
      }
    }

    if (lockerRows.length > 0) {
      const { error: insertError } = await supabase
        .from("lockers")
        .insert(lockerRows);

      if (insertError) {
        throw new Error("Failed to initialize lockers: " + insertError.message);
      }
    }

    return new Response(JSON.stringify({ success: true, count: lockerRows.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error initializing lockers:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
