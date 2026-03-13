import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { addMonthsDate, ensurePortalAccess, todayDate } from "../_shared/libraryPortal.ts";
import { createAuditEvent, ensureLockerSelection, ensureSeatSelection, loadLibraryConfiguration, notifyOwners, resolveShiftSelectionPricing, normalizeShiftIds, monthsFromPlanDuration } from "../_shared/libraryOps.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    const fullName = String(body.full_name || "").trim();
    const fatherName = String(body.father_name || "").trim();
    const phone = String(body.phone || "").trim();
    const gender = String(body.gender || "").trim().toLowerCase();
    const address = String(body.address || "").trim();
    const shiftIds = normalizeShiftIds(body.shift_ids);
    const durationMonths = monthsFromPlanDuration(body.plan_duration);
    const startDate = String(body.start_date || todayDate()).trim();
    const paymentNote = String(body.payment_note || "").trim();

    if (!libraryId || !fullName || !phone || !gender || shiftIds.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required admission fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user, access, subscription } = await ensurePortalAccess(req, libraryId);
    if (subscription.is_locked) {
      throw new Error("Subscription locked: admissions are disabled");
    }

    const config = await loadLibraryConfiguration(supabase, libraryId);
    const pricing = resolveShiftSelectionPricing(config, shiftIds, durationMonths);
    const endDate = addMonthsDate(startDate, durationMonths);
    const seatSelection = await ensureSeatSelection(
      supabase,
      libraryId,
      shiftIds,
      gender,
      startDate,
      endDate,
      null, // Always auto-assign — students pick shift, seat is assigned automatically
    );
    const lockerSelection = await ensureLockerSelection(
      supabase,
      libraryId,
      config.lockers,
      config.lockerPolicies,
      {
        shiftDurationHours: pricing.duration_hours,
        gender,
        durationMonths,
        assignLocker: Boolean(body.assign_locker),
        requestedLockerNumber: body.locker_number || null,
      },
    );

    const totalAmount = Number(pricing.amount || 0) + Number(lockerSelection.locker_fee_total || 0);

    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        library_id: libraryId,
        full_name: fullName,
        father_name: fatherName || "",
        phone,
        gender,
        address,
        status: "active",
      })
      .select("id")
      .single();

    if (studentError || !student) {
      throw new Error(`Failed to create student: ${studentError?.message || "Unknown error"}`);
    }

    const membershipRows = shiftIds.map((shiftId, index) => ({
      student_id: student.id,
      library_id: libraryId,
      shift_id: shiftId,
      seat_number: seatSelection.seat_number,
      locker_number: lockerSelection.assign_locker ? lockerSelection.locker_number : "",
      start_date: startDate,
      end_date: endDate,
      amount_paid: index === 0 ? totalAmount : 0,
      payment_mode: "cash",
      payment_status: "paid",
      plan_duration: String(durationMonths),
      status: "active",
    }));

    const { data: memberships, error: membershipError } = await supabase
      .from("memberships")
      .insert(membershipRows)
      .select("id, shift_id, seat_number, locker_number");

    if (membershipError || !memberships) {
      await supabase.from("students").delete().eq("id", student.id);
      throw new Error(`Failed to create membership: ${membershipError?.message || "Unknown error"}`);
    }

    const occupancyRows = memberships.map((membership: any) => ({
      library_id: libraryId,
      seat_number: seatSelection.seat_number,
      membership_id: membership.id,
      shift_id: membership.shift_id,
      gender,
      start_date: startDate,
      end_date: endDate,
    }));

    const { error: occupancyError } = await supabase.from("seat_occupancy").insert(occupancyRows);
    if (occupancyError) {
      await supabase.from("memberships").delete().eq("student_id", student.id);
      await supabase.from("students").delete().eq("id", student.id);
      throw new Error(`Failed to allocate seat occupancy: ${occupancyError.message}`);
    }

    if (lockerSelection.assign_locker) {
      const { error: lockerError } = await supabase
        .from("lockers")
        .update({ is_occupied: true, membership_id: memberships[0].id })
        .eq("library_id", libraryId)
        .eq("locker_number", lockerSelection.locker_number);

      if (lockerError) {
        throw new Error(`Failed to assign locker: ${lockerError.message}`);
      }
    }

    const { data: cashTransaction, error: cashError } = await supabase
      .from("cash_transactions")
      .insert({
        library_id: libraryId,
        student_id: student.id,
        membership_id: memberships[0].id,
        collected_by_user_id: user.id,
        transaction_type: "admission",
        amount: totalAmount,
        payment_mode: "cash",
        note: paymentNote || null,
        metadata: {
          shift_ids: shiftIds,
          seat_number: seatSelection.seat_number,
          locker_number: lockerSelection.locker_number || null,
          pricing_label: pricing.label,
          duration_months: durationMonths,
        },
      })
      .select("id")
      .single();

    if (cashError) {
      throw new Error(`Failed to record admission cash entry: ${cashError.message}`);
    }

    await createAuditEvent(supabase, {
      library_id: libraryId,
      actor_user_id: user.id,
      actor_role: access.role,
      event_type: "admission_created",
      entity_type: "student",
      entity_id: student.id,
      summary: `${fullName} admitted on seat ${seatSelection.seat_number}`,
      metadata: {
        shift_ids: shiftIds,
        locker_number: lockerSelection.locker_number || null,
        amount: totalAmount,
        cash_transaction_id: cashTransaction?.id || null,
      },
    });

    if (access.role === "staff") {
      await notifyOwners(supabase, {
        library_id: libraryId,
        actor_user_id: user.id,
        type: "staff_action",
        title: "Staff created an admission",
        body: `${fullName} was admitted by staff for ₹${totalAmount.toLocaleString("en-IN")}.`,
        entity_type: "student",
        entity_id: student.id,
        metadata: {
          shift_ids: shiftIds,
          seat_number: seatSelection.seat_number,
          locker_number: lockerSelection.locker_number || null,
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      student_id: student.id,
      seat_number: seatSelection.seat_number,
      locker_number: lockerSelection.locker_number || null,
      amount_collected: totalAmount,
      end_date: endDate,
    }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /missing required|subscription locked|unauthorized|not available|no seat|locker/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
