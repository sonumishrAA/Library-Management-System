import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import bcrypt from "npm:bcryptjs@3.0.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyAdminToken } from "../_shared/adminAuth.ts";

import { generateLoginId, generatePassword } from "../_shared/utils.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    await verifyAdminToken(req, jwtSecret);

    const { library_id } = await req.json();

    if (!library_id) {
      return new Response(JSON.stringify({ error: "library_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Generate credentials
    const login_id = generateLoginId();
    const plain_password = generatePassword();
    const password_hash = await bcrypt.hash(plain_password, 12);

    // Update library
    const { error: updateError } = await supabase
      .from("libraries")
      .update({
        login_id,
        password_hash,
        status: "active",
      })
      .eq("id", library_id);

    if (updateError) {
      return new Response(
        JSON.stringify({
          error: "Failed to update library: " + updateError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ login_id, plain_password }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const status =
      err.message?.includes("Unauthorized") ||
      err.message?.includes("authorization")
        ? 401
        : 500;
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
