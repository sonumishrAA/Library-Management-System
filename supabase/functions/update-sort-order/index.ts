import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Missing or invalid authorization header");
    }
    const token = authHeader.split(" ")[1];
    const secret = new TextEncoder().encode(Deno.env.get("JWT_SECRET"));

    try {
      await jwtVerify(token, secret);
    } catch {
      throw new Error("Invalid admin token");
    }

    const { table, items } = await req.json();

    if (!table || !Array.isArray(items)) {
      throw new Error("Missing table or items array");
    }

    const validTables = ["site_stats", "testimonials", "roadmap_items"];
    if (!validTables.includes(table)) {
      throw new Error("Invalid table provided");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Supabase JS doesn't have native bulk update yet, so we iterate sequentially
    // or use upsert if we know PKs. We'll use multiple updates for simplicity as sort_order batch
    // usually is < 20 items.

    const errors = [];
    for (const item of items) {
      const { error } = await supabaseClient
        .from(table)
        .update({ sort_order: item.sort_order })
        .eq("id", item.id);

      if (error) errors.push(error);
    }

    if (errors.length > 0) {
      throw new Error("Some records failed to update sort order");
    }

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
