import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ensurePortalAccess } from "../_shared/libraryPortal.ts";
import { createAuditEvent, ensureSeatSelection, fetchStudentBundles, notifyOwners, normalizeShiftIds } from "../_shared/libraryOps.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    const studentId = String(body.student_id || "").trim();
    const nextSeatNumber = String(body.seat_number || "").trim();

    if (!libraryId || !studentId || !nextSeatNumber) {
      return new Response(JSON.stringify({ error: "library_id, student_id and seat_number are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user, access, subscription } = await ensurePortalAccess(req, libraryId);
    if (subscription.is_locked) {
      throw new Error("Subscription locked: seat changes are disabled");
    }

    const students = await fetchStudentBundles(supabase, libraryId);
    const student = students.find((item: any) => item.id === studentId);
    if (!student || !student.memberships?.length) {
      throw new Error("Student membership not found");
    }

    const currentSeat = String(student.seat_number || "").trim();
    if (currentSeat === nextSeatNumber) {
      return new Response(JSON.stringify({ success: true, seat_number: nextSeatNumber }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shiftIds = normalizeShiftIds(student.memberships.map((membership: any) => membership.shift_id));
    const latestStartDate = student.latest_membership?.start_date || new Date().toISOString().split("T")[0];
    const latestEndDate = student.latest_membership?.end_date || new Date().toISOString().split("T")[0];

    await ensureSeatSelection(
      supabase,
      libraryId,
      shiftIds,
      student.gender,
      latestStartDate,
      latestEndDate,
      nextSeatNumber,
    );

    for (const membership of student.memberships) {
      await supabase
        .from("memberships")
        .update({ seat_number: nextSeatNumber })
        .eq("id", membership.id);

      await supabase
        .from("seat_occupancy")
        .update({ seat_number: nextSeatNumber })
        .eq("membership_id", membership.id);
    }

    await createAuditEvent(supabase, {
      library_id: libraryId,
      actor_user_id: user.id,
      actor_role: access.role,
      event_type: "seat_changed",
      entity_type: "student",
      entity_id: studentId,
      summary: `${student.full_name} moved from ${currentSeat} to ${nextSeatNumber}`,
      metadata: {
        previous_seat_number: currentSeat,
        next_seat_number: nextSeatNumber,
      },
    });

    if (access.role === "staff") {
      await notifyOwners(supabase, {
        library_id: libraryId,
        actor_user_id: user.id,
        type: "staff_action",
        title: "Staff changed a seat",
        body: `${student.full_name} moved from ${currentSeat} to ${nextSeatNumber}.`,
        entity_type: "student",
        entity_id: studentId,
        metadata: {
          previous_seat_number: currentSeat,
          next_seat_number: nextSeatNumber,
        },
      });
    }

    return new Response(JSON.stringify({ success: true, seat_number: nextSeatNumber }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /required|locked|unauthorized|not found|available/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
