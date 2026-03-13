import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { authenticatePortalUser, getAccessibleLibrariesForUser, issueLibraryUserToken } from "../_shared/libraryPortal.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { identifier, password } = await req.json();
    const normalizedIdentifier = String(identifier || "").trim();
    const normalizedPassword = String(password || "");

    if (!normalizedIdentifier || !normalizedPassword) {
      return new Response(JSON.stringify({ error: "Email or phone and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = await authenticatePortalUser(normalizedIdentifier, normalizedPassword);
    const libraries = await getAccessibleLibrariesForUser(user.id);
    if (!libraries.length) {
      return new Response(JSON.stringify({ error: "No active library access found for this account" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    const token = await issueLibraryUserToken(
      {
        userId: user.id,
        userRole: user.role,
        libraryIds: libraries.map((library: any) => library.id),
        email: user.email || null,
      },
      jwtSecret,
    );

    const firstOpenableLibrary = libraries.find((library: any) => {
      if (library.role === "staff") {
        return !library.subscription?.is_locked;
      }
      return true;
    });

    return new Response(JSON.stringify({
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      libraries,
      direct_open_library_id: libraries.length === 1 ? firstOpenableLibrary?.id || libraries[0].id : null,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const status = String(err?.message || "").toLowerCase().includes("invalid credentials") ? 401 : 500;
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
