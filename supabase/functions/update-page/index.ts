import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://esm.sh/jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Basic JWT check for Admin
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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" // Bypass RLS as Admin
    );

    const { slug, title, content } = await req.json();

    if (!slug || !title || content === undefined) {
      throw new Error("Missing slug, title, or content");
    }

    const { data, error } = await supabaseClient
      .from("site_pages")
      .upsert({ slug, title, content, updated_at: new Date().toISOString() }, { onConflict: "slug" })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, page: data }), {
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
