import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ensurePortalAccess } from "../_shared/libraryPortal.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const libraryId = String(url.searchParams.get("library_id") || "").trim();
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)));

    if (!libraryId) {
      return new Response(JSON.stringify({ error: "library_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user } = await ensurePortalAccess(req, libraryId, {
      requireOwner: true,
      allowExpiredOwnerRead: true,
    });

    const { data: notifications, error } = await supabase
      .from("owner_notifications")
      .select("id, type, title, body, actor_user_id, entity_type, entity_id, read_at, metadata, created_at")
      .eq("library_id", libraryId)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to load notifications: ${error.message}`);
    }

    return new Response(JSON.stringify({ notifications: notifications || [] }), {
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
