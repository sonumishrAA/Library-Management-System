import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ensurePortalAccess } from "../_shared/libraryPortal.ts";
import { createAuditEvent, ensureLockerSelection, fetchStudentBundles, loadLibraryConfiguration, monthsFromPlanDuration, normalizeShiftIds, notifyOwners, resolveShiftSelectionPricing } from "../_shared/libraryOps.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    const studentId = String(body.student_id || "").trim();
    const requestedLocker = String(body.locker_number || "").trim();
    const assignLocker = body.assign_locker !== false && body.assign_locker !== "false";

    if (!libraryId || !studentId) {
      return new Response(JSON.stringify({ error: "library_id and student_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user, access, subscription } = await ensurePortalAccess(req, libraryId);
    if (subscription.is_locked) {
      throw new Error("Subscription locked: locker changes are disabled");
    }

    const students = await fetchStudentBundles(supabase, libraryId);
    const student = students.find((item: any) => item.id === studentId);
    if (!student || !student.memberships?.length) {
      throw new Error("Student membership not found");
    }

    const currentLocker = String(student.locker_number || "").trim();
    if (!assignLocker) {
      if (currentLocker) {
        await supabase
          .from("lockers")
          .update({ is_occupied: false, membership_id: null })
          .eq("library_id", libraryId)
          .eq("locker_number", currentLocker);
      }

      for (const membership of student.memberships) {
        await supabase.from("memberships").update({ locker_number: "" }).eq("id", membership.id);
      }

      await createAuditEvent(supabase, {
        library_id: libraryId,
        actor_user_id: user.id,
        actor_role: access.role,
        event_type: "locker_unassigned",
        entity_type: "student",
        entity_id: studentId,
        summary: `${student.full_name} locker removed`,
        metadata: { previous_locker_number: currentLocker || null },
      });

      if (access.role === "staff") {
        await notifyOwners(supabase, {
          library_id: libraryId,
          actor_user_id: user.id,
          type: "staff_action",
          title: "Staff removed a locker",
          body: `${student.full_name} locker was removed.`,
          entity_type: "student",
          entity_id: studentId,
          metadata: { previous_locker_number: currentLocker || null },
        });
      }

      return new Response(JSON.stringify({ success: true, locker_number: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (currentLocker && currentLocker === requestedLocker) {
      return new Response(JSON.stringify({ success: true, locker_number: currentLocker }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = await loadLibraryConfiguration(supabase, libraryId);
    const shiftIds = normalizeShiftIds(student.memberships.map((membership: any) => membership.shift_id));
    const pricing = resolveShiftSelectionPricing(config, shiftIds, monthsFromPlanDuration(student.latest_membership?.plan_duration));
    const lockerSelection = await ensureLockerSelection(
      supabase,
      libraryId,
      (config.lockers || []).map((locker: any) => {
        if (locker.locker_number === currentLocker) {
          return { ...locker, is_occupied: false };
        }
        return locker;
      }),
      config.lockerPolicies,
      {
        shiftDurationHours: pricing.duration_hours,
        gender: student.gender,
        durationMonths: monthsFromPlanDuration(student.latest_membership?.plan_duration),
        assignLocker: true,
        requestedLockerNumber: requestedLocker || null,
      },
    );

    if (currentLocker) {
      await supabase
        .from("lockers")
        .update({ is_occupied: false, membership_id: null })
        .eq("library_id", libraryId)
        .eq("locker_number", currentLocker);
    }

    await supabase
      .from("lockers")
      .update({ is_occupied: true, membership_id: student.memberships[0].id })
      .eq("library_id", libraryId)
      .eq("locker_number", lockerSelection.locker_number);

    for (const membership of student.memberships) {
      await supabase
        .from("memberships")
        .update({ locker_number: lockerSelection.locker_number })
        .eq("id", membership.id);
    }

    await createAuditEvent(supabase, {
      library_id: libraryId,
      actor_user_id: user.id,
      actor_role: access.role,
      event_type: "locker_assigned",
      entity_type: "student",
      entity_id: studentId,
      summary: `${student.full_name} locker changed to ${lockerSelection.locker_number}`,
      metadata: {
        previous_locker_number: currentLocker || null,
        next_locker_number: lockerSelection.locker_number,
      },
    });

    if (access.role === "staff") {
      await notifyOwners(supabase, {
        library_id: libraryId,
        actor_user_id: user.id,
        type: "staff_action",
        title: "Staff changed a locker",
        body: `${student.full_name} locker changed to ${lockerSelection.locker_number}.`,
        entity_type: "student",
        entity_id: studentId,
        metadata: {
          previous_locker_number: currentLocker || null,
          next_locker_number: lockerSelection.locker_number,
        },
      });
    }

    return new Response(JSON.stringify({ success: true, locker_number: lockerSelection.locker_number }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /required|locked|unauthorized|not found|available|policy/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
