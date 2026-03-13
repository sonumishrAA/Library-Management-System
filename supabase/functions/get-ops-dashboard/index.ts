import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { addDays, compareDateOnly, ensurePortalAccess, todayDate } from "../_shared/libraryPortal.ts";
import { buildSeatMap, fetchStudentBundles, loadLibraryConfiguration, monthsFromPlanDuration, summarizeVacancyByShift } from "../_shared/libraryOps.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const libraryId = url.searchParams.get("library_id") || "";
    if (!libraryId) {
      return new Response(JSON.stringify({ error: "library_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user, access, subscription } = await ensurePortalAccess(req, libraryId, {
      allowExpiredOwnerRead: true,
    });

    const [config, students, seatMap, { data: auditEvents }, { data: notifications }, { data: cashTransactions }] = await Promise.all([
      loadLibraryConfiguration(supabase, libraryId),
      fetchStudentBundles(supabase, libraryId),
      buildSeatMap(supabase, libraryId),
      supabase
        .from("audit_events")
        .select("id, event_type, summary, actor_role, created_at, metadata")
        .eq("library_id", libraryId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("owner_notifications")
        .select("id, read_at")
        .eq("library_id", libraryId)
        .eq("owner_user_id", user.id),
      supabase
        .from("cash_transactions")
        .select("id, amount, collected_at, transaction_type")
        .eq("library_id", libraryId)
        .gte("collected_at", `${todayDate()}T00:00:00`),
    ]);

    const today = todayDate();
    const nextWeek = addDays(today, 7);

    const activeStudents = students.filter((student: any) => !student.is_expired).length;
    const expiredStudents = students.filter((student: any) => student.is_expired);
    const dueSoonStudents = students.filter((student: any) => student.due_soon);
    const vacancyByShift = summarizeVacancyByShift(seatMap, config.shifts);
    const vacantSeats = vacancyByShift.reduce((acc: number, shift: any) => acc + shift.vacant_count, 0);
    const vacantLockers = (config.lockers || []).filter((locker: any) => !locker.is_occupied).length;
    const todayCash = (cashTransactions || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const mrr = students.reduce((sum: number, student: any) => {
      const latestMembership = student.latest_membership;
      if (!latestMembership || latestMembership.status !== "active") return sum;
      const amount = Number(latestMembership.amount_paid || 0);
      const months = monthsFromPlanDuration(latestMembership.plan_duration);
      return sum + Math.round(amount / Math.max(months, 1));
    }, 0);

    const actionRequired = [
      ...expiredStudents.map((student: any) => ({
        type: "expired_membership",
        student_id: student.id,
        title: `${student.full_name} expired`,
        due_on: student.current_end_date,
      })),
    ];

    return new Response(JSON.stringify({
      subscription,
      metrics: {
        active_students: activeStudents,
        expired_students: expiredStudents.length,
        renewals_due_7_days: dueSoonStudents.length,
        vacant_seats: vacantSeats,
        vacant_lockers: vacantLockers,
        mrr,
        today_cash_collected: todayCash,
        unread_notifications: access.role === "owner"
          ? (notifications || []).filter((item: any) => !item.read_at).length
          : 0,
      },
      action_required: actionRequired,
      renewals_due: dueSoonStudents.map((student: any) => ({
        id: student.id,
        full_name: student.full_name,
        phone: student.phone,
        seat_number: student.seat_number,
        shift_labels: student.shift_labels,
        locker_number: student.locker_number || null,
        end_date: student.current_end_date,
      })),
      recently_expired: expiredStudents.map((student: any) => ({
        id: student.id,
        full_name: student.full_name,
        phone: student.phone,
        end_date: student.current_end_date,
        seat_number: student.seat_number,
      })),
      vacancy_by_shift: vacancyByShift,
      recent_activity: auditEvents || [],
      generated_on: today,
      due_window_end: nextWeek,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /unauthorized|subscription locked/i.test(message) ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
