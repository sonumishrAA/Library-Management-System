import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ensurePortalAccess } from "../_shared/libraryPortal.ts";
import { buildSeatMap, fetchStudentBundles, loadLibraryConfiguration } from "../_shared/libraryOps.ts";

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

    const { supabase, user, access, library, subscription } = await ensurePortalAccess(req, libraryId, {
      allowExpiredOwnerRead: true,
    });

    const [config, students, seatMap, { data: staffAccessRows }, { data: notifications }] = await Promise.all([
      loadLibraryConfiguration(supabase, libraryId),
      fetchStudentBundles(supabase, libraryId),
      buildSeatMap(supabase, libraryId),
      supabase
        .from("library_user_access")
        .select(`
          id,
          role,
          status,
          user:library_users ( id, email, phone, status, created_at )
        `)
        .eq("library_id", libraryId)
        .eq("role", "staff")
        .order("created_at", { ascending: false }),
      supabase
        .from("owner_notifications")
        .select("id, type, title, body, actor_user_id, entity_type, entity_id, read_at, created_at, metadata")
        .eq("library_id", libraryId)
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const responseBody = {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: access.role,
      },
      library,
      subscription,
      shifts: config.shifts,
      combined_shift_pricing: config.combos,
      locker_policies: config.lockerPolicies,
      seats: config.seats,
      lockers: config.lockers,
      students,
      seat_map: seatMap,
      staff: access.role === "owner"
        ? (staffAccessRows || []).map((row: any) => ({
            access_id: row.id,
            role: row.role,
            status: row.status,
            id: row.user?.id,
            email: row.user?.email,
            phone: row.user?.phone,
            user_status: row.user?.status,
            created_at: row.user?.created_at,
          }))
        : [],
      notifications: access.role === "owner" ? notifications || [] : [],
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const lowerMessage = message.toLowerCase();
    const status = lowerMessage.includes("unauthorized") || lowerMessage.includes("subscription locked") ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
