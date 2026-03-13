import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ensurePortalAccess } from "../_shared/libraryPortal.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    const notificationIds = Array.isArray(body.notification_ids)
      ? body.notification_ids.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];

    if (!libraryId || notificationIds.length === 0) {
      return new Response(JSON.stringify({ error: "library_id and notification_ids are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user } = await ensurePortalAccess(req, libraryId, {
      requireOwner: true,
      allowExpiredOwnerRead: true,
      allowExpiredOwnerWrite: true,
    });

    const { error } = await supabase
      .from("owner_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("library_id", libraryId)
      .eq("owner_user_id", user.id)
      .in("id", notificationIds);

    if (error) {
      throw new Error(`Failed to update notifications: ${error.message}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /required|owner|unauthorized/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
