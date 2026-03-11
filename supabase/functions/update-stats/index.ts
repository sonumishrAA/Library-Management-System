import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdminToken } from "../_shared/adminAuth.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await verifyAdminToken(req, Deno.env.get("JWT_SECRET") ?? "");

    const body = await req.json();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (body.table === "pricing_plans") {
      const { id, name, label, base_price, cctv_price, duration_days } = body;

      if (!id && !name) {
        throw new Error("Missing pricing plan identifier");
      }

      if (
        label === undefined ||
        base_price === undefined ||
        cctv_price === undefined ||
        duration_days === undefined
      ) {
        throw new Error("Missing pricing fields");
      }

      const payload = {
        label,
        base_price: Number(base_price),
        cctv_price: Number(cctv_price),
        duration_days: Number(duration_days),
      };

      if (
        Number.isNaN(payload.base_price) ||
        Number.isNaN(payload.cctv_price) ||
        Number.isNaN(payload.duration_days)
      ) {
        throw new Error("Pricing values must be numeric");
      }

      let query = supabaseClient.from("pricing_plans").update(payload);
      query = id ? query.eq("id", id) : query.eq("name", name);

      const { data, error } = await query
        .select("id, name, label, base_price, cctv_price, duration_days")
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, plan: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { id, label, value, icon } = body;
    if (
      !id ||
      label === undefined ||
      value === undefined ||
      icon === undefined
    ) {
      throw new Error("Missing id, label, value, or icon");
    }

    const { error } = await supabaseClient
      .from("site_stats")
      .update({ label, value, icon, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
