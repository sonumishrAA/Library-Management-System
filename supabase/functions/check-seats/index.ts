import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { library_id, shift_ids, gender, start_date, end_date } = body;

    if (!library_id || !shift_ids || !start_date || !end_date) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const shiftsToCheck = Array.isArray(shift_ids) ? shift_ids : [shift_ids];

    // 1. Get all seats for the library matching the gender (or 'any')
    let seatQuery = supabase
      .from("seats")
      .select("seat_number")
      .eq("library_id", library_id);
      
    if (gender) {
      // If a seat is 'any', it's available for either. If specific, it must match.
      seatQuery = seatQuery.in("gender", [gender, "any"]);
    }

    const { data: allSeats, error: seatError } = await seatQuery;

    if (seatError) throw new Error("Failed to fetch library seats");

    const allSeatNumbers = allSeats.map((s: any) => s.seat_number);

    if (allSeatNumbers.length === 0) {
      return new Response(JSON.stringify({ available_seats: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Find occupied seats overlapping with the requested dates and shifts
    const { data: occupiedSeats, error: occError } = await supabase
      .from("seat_occupancy")
      .select("seat_number")
      .eq("library_id", library_id)
      .in("shift_id", shiftsToCheck)
      .lte("start_date", end_date)
      .gte("end_date", start_date);

    if (occError) throw new Error("Failed to check seat occupancy");

    const occupiedSeatNumbers = new Set(occupiedSeats.map((o: any) => o.seat_number));

    // 3. Filter available seats
    const available_seats = allSeatNumbers.filter(
      (seatNum: string) => !occupiedSeatNumbers.has(seatNum)
    );

    return new Response(JSON.stringify({ available_seats }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error checking seats:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
