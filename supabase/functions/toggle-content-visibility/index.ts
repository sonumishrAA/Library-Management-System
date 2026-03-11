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
    const { table, id, is_visible, action } = body;

    if (!table) {
      throw new Error("Missing table");
    }

    const validTables = [
      "site_stats",
      "testimonials",
      "roadmap_items",
      "help_articles",
      "pricing_plans",
    ];
    if (!validTables.includes(table)) {
      throw new Error("Invalid table provided");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    if (table === "site_stats" && action === "update") {
      const { label, value, icon } = body;

      if (!id || label === undefined || value === undefined || icon === undefined) {
        throw new Error("Missing stat fields");
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
    }

    if (table === "testimonials" && action === "create") {
      const { name, library_name, city, rating, review } = body;

      if (!name || !library_name || !city || !review) {
        throw new Error("Missing testimonial fields");
      }

      const { error } = await supabaseClient.from("testimonials").insert({
        name,
        library_name,
        city,
        rating: parseInt(rating, 10) || 5,
        review,
        is_visible: true,
        sort_order: 0,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "delete") {
      if (!id) {
        throw new Error("Missing id");
      }

      if (!["testimonials"].includes(table)) {
        throw new Error("Invalid table provided for deletion");
      }

      const { error } = await supabaseClient.from(table).delete().eq("id", id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (table === "pricing_plans") {
      const { name, label, base_price, cctv_price, duration_days } = body;

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

    if (!id || is_visible === undefined) {
      throw new Error("Missing id or is_visible");
    }

    // Dynamic column mapping based on table
    const column = table === "help_articles" ? "is_published" : "is_visible";

    const { error } = await supabaseClient
      .from(table)
      .update({ [column]: is_visible })
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
