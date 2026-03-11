import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      library_id,
      full_name,
      father_name,
      phone,
      gender,
      address,
      shift_ids,
      seat_number,
      assign_locker,
      locker_number,
      plan_duration,
      amount_paid,
      payment_mode,
      payment_status,
      start_date,
      end_date,
    } = body;

    if (!library_id || !full_name || !phone || !gender || !shift_ids || !start_date || !end_date) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Ensure array of shift_ids
    const shiftsToAssign = (Array.isArray(shift_ids) ? shift_ids : [shift_ids]).filter(Boolean);
    if (shiftsToAssign.length === 0) {
      return new Response(JSON.stringify({ error: "At least one shift is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. INSERT student
    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        library_id,
        full_name,
        father_name: father_name || "",
        phone,
        gender,
        address: address || "",
        status: "active",
      })
      .select("id")
      .single();

    if (studentError) {
      throw new Error("Failed to insert student: " + studentError.message);
    }

    const student_id = student.id;

    // 2. INSERT membership (one per shift, or one main membership storing shift_ids, based on schema)
    // The previous schema info showed: 
    // memberships: id, student_id, library_id, shift_id, seat_number, locker_number, start_date, end_date
    // Since combo shifts can have multiple base shifts, we might need multiple memberships or just one if shift_id can be an array.
    // Assuming normal schema where one membership per shift_id.
    const numericAmount = Number(amount_paid || 0);
    const normalizedPaymentStatus = String(payment_status || "paid").toLowerCase();

    const membershipRows = shiftsToAssign.map(sId => ({
      student_id,
      library_id,
      shift_id: sId,
      seat_number: seat_number || null,
      locker_number: assign_locker && locker_number ? locker_number : null,
      start_date,
      end_date,
      amount_paid: Number.isFinite(numericAmount) ? numericAmount : 0,
      payment_mode: payment_mode || "cash",
      payment_status: normalizedPaymentStatus,
      plan_duration: String(plan_duration || "1"),
      status: "active",
    }));

    const { data: memberships, error: memError } = await supabase
      .from("memberships")
      .insert(membershipRows)
      .select("id, shift_id");

    if (memError) {
      // rollback could be applied here
      await supabase.from("students").delete().eq("id", student_id);
      throw new Error("Failed to create membership: " + memError.message);
    }

    // 3. INSERT seat_occupancy per shift_id
    if (seat_number) {
      const occupancyRows = (memberships || []).map((membership: any) => ({
        library_id,
        seat_number,
        membership_id: membership.id,
        shift_id: membership.shift_id,
        gender,
        start_date,
        end_date,
      }));

      if (occupancyRows.length > 0) {
        const { error: occError } = await supabase
          .from("seat_occupancy")
          .insert(occupancyRows);

        if (occError) {
          console.error("Failed to insert seat occupancy:", occError);
          // Non-fatal, continuing
        }
      }
    }

    // 4. UPDATE lockers if locker assigned
    if (assign_locker && locker_number) {
      const primaryMembershipId = memberships?.[0]?.id;
      const { error: lockerUpdateError } = await supabase
        .from("lockers")
        .update({ is_occupied: true, membership_id: primaryMembershipId || null })
        .eq("library_id", library_id)
        .eq("locker_number", locker_number);
        
      if (lockerUpdateError) {
        console.error("Locker update error:", lockerUpdateError);
      }
    }

    return new Response(JSON.stringify({ success: true, student_id }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error adding student:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
