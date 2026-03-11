import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { SignJWT } from "https://esm.sh/jose@5.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { login_id, password } = await req.json();

    if (!login_id || !password) {
      return new Response(
        JSON.stringify({ error: "Login ID and password are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("JWT_SECRET")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch library by login_id
    const { data: library, error: dbError } = await supabase
      .from("libraries")
      .select("id, login_id, password_hash, contact_email, name, city, status")
      .eq("login_id", login_id)
      .eq("status", "active")
      .single();

    if (dbError || !library) {
      return new Response(
        JSON.stringify({
          error: "Invalid credentials or library is not active",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, library.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find all active libraries with same contact_email (multi-library support)
    const { data: allLibraries } = await supabase
      .from("libraries")
      .select("id, name, city")
      .eq("contact_email", library.contact_email)
      .eq("status", "active");

    const libraryIds = (allLibraries || [library]).map((l: any) => l.id);
    const libraryNames = (allLibraries || [library]).map((l: any) => ({
      id: l.id,
      name: l.name,
      city: l.city,
    }));

    // Generate JWT — 7 days expiry
    const secret = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({
      role: "library_owner",
      sub: library.contact_email,
      library_ids: libraryIds,
      current_library_id: library.id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    return new Response(
      JSON.stringify({
        token,
        libraries: libraryNames,
        current_library_id: library.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
