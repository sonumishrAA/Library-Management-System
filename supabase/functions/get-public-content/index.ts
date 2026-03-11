import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdminToken } from "../_shared/adminAuth.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");

    if (
      !type ||
      !["stats", "testimonials", "roadmap", "admin_content"].includes(type)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing type parameter." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    if (type === "admin_content") {
      await verifyAdminToken(req, Deno.env.get("JWT_SECRET") ?? "");

      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const [statsRes, testimonialsRes, pricingRes] = await Promise.all([
        supabaseClient.from("site_stats").select("*").order("sort_order"),
        supabaseClient.from("testimonials").select("*").order("sort_order"),
        supabaseClient
          .from("pricing_plans")
          .select("id, name, label, base_price, cctv_price, duration_days")
          .order("duration_days", { ascending: true }),
      ]);

      if (statsRes.error) throw statsRes.error;
      if (testimonialsRes.error) throw testimonialsRes.error;
      if (pricingRes.error) throw pricingRes.error;

      return new Response(
        JSON.stringify({
          stats: statsRes.data ?? [],
          testimonials: testimonialsRes.data ?? [],
          pricing_plans: pricingRes.data ?? [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    let tableName = "";
    if (type === "stats") tableName = "site_stats";
    else if (type === "testimonials") tableName = "testimonials";
    else if (type === "roadmap") tableName = "roadmap_items";

    const { data, error } = await supabaseClient
      .from(tableName)
      .select("*")
      .eq("is_visible", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return new Response(JSON.stringify({ data }), {
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
