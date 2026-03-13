import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { addMonthsDate, compareDateOnly, ensurePortalAccess, todayDate } from "../_shared/libraryPortal.ts";
import { createAuditEvent, fetchStudentBundles, findLockerPolicy, loadLibraryConfiguration, monthsFromPlanDuration, notifyOwners, resolveShiftSelectionPricing } from "../_shared/libraryOps.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    const studentId = String(body.student_id || "").trim();
    const durationMonths = monthsFromPlanDuration(body.plan_duration);
    const paymentNote = String(body.payment_note || "").trim();

    if (!libraryId || !studentId) {
      return new Response(JSON.stringify({ error: "library_id and student_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user, access, subscription } = await ensurePortalAccess(req, libraryId);
    if (subscription.is_locked) {
      throw new Error("Subscription locked: renewals are disabled");
    }

    const students = await fetchStudentBundles(supabase, libraryId);
    const student = students.find((item: any) => item.id === studentId);
    if (!student || !student.memberships?.length) {
      throw new Error("Student membership not found");
    }

    const latestMembership = student.latest_membership;
    const latestEndDate = latestMembership?.end_date || todayDate();
    const shiftIds = [...new Set((student.memberships || []).map((membership: any) => membership.shift_id))].filter(Boolean);
    const config = await loadLibraryConfiguration(supabase, libraryId);
    const pricing = resolveShiftSelectionPricing(config, shiftIds, durationMonths);
    const lockerPolicy = student.locker_number
      ? findLockerPolicy(config.lockerPolicies, student.gender, pricing.duration_hours)
      : null;
    const lockerAmount = student.locker_number ? Number(lockerPolicy?.monthly_fee || 0) * durationMonths : 0;
    const totalAmount = Number(pricing.amount || 0) + lockerAmount;

    const anchorDate = compareDateOnly(latestEndDate, todayDate()) >= 0 ? latestEndDate : todayDate();
    const renewedEndDate = addMonthsDate(anchorDate, durationMonths);

    const sortedMemberships = [...student.memberships].sort((left: any, right: any) => String(left.id).localeCompare(String(right.id)));
    for (const [index, membership] of sortedMemberships.entries()) {
      const { error } = await supabase
        .from("memberships")
        .update({
          end_date: renewedEndDate,
          amount_paid: index === 0 ? totalAmount : 0,
          payment_mode: "cash",
          payment_status: "paid",
          plan_duration: String(durationMonths),
          status: "active",
        })
        .eq("id", membership.id);

      if (error) {
        throw new Error(`Failed to renew membership: ${error.message}`);
      }

      await supabase
        .from("seat_occupancy")
        .update({ end_date: renewedEndDate })
        .eq("membership_id", membership.id);
    }

    const { data: cashTransaction, error: cashError } = await supabase
      .from("cash_transactions")
      .insert({
        library_id: libraryId,
        student_id: studentId,
        membership_id: sortedMemberships[0].id,
        collected_by_user_id: user.id,
        transaction_type: "renewal",
        amount: totalAmount,
        payment_mode: "cash",
        note: paymentNote || null,
        metadata: {
          renewed_from: latestEndDate,
          renewed_to: renewedEndDate,
          shift_ids: shiftIds,
          locker_number: student.locker_number || null,
        },
      })
      .select("id")
      .single();

    if (cashError) {
      throw new Error(`Failed to record renewal cash entry: ${cashError.message}`);
    }

    await createAuditEvent(supabase, {
      library_id: libraryId,
      actor_user_id: user.id,
      actor_role: access.role,
      event_type: "membership_renewed",
      entity_type: "student",
      entity_id: studentId,
      summary: `${student.full_name} renewed till ${renewedEndDate}`,
      metadata: {
        amount: totalAmount,
        renewed_from: latestEndDate,
        renewed_to: renewedEndDate,
        cash_transaction_id: cashTransaction?.id || null,
      },
    });

    if (access.role === "staff") {
      await notifyOwners(supabase, {
        library_id: libraryId,
        actor_user_id: user.id,
        type: "staff_action",
        title: "Staff collected a renewal",
        body: `${student.full_name} renewed till ${renewedEndDate} for ₹${totalAmount.toLocaleString("en-IN")}.`,
        entity_type: "student",
        entity_id: studentId,
        metadata: {
          renewed_to: renewedEndDate,
          amount: totalAmount,
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      renewed_to: renewedEndDate,
      amount_collected: totalAmount,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /required|locked|unauthorized|not found/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
