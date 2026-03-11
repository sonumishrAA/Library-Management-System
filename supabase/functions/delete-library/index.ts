import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyAdminToken } from "../_shared/adminAuth.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    await verifyAdminToken(req, jwtSecret);

    const { library_id } = await req.json();

    if (!library_id) {
      return new Response(JSON.stringify({ error: "Missing library_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Delete related data first (cascading should handle most, but be explicit)
    // 1. Delete seat_occupancy
    await supabase.from("seat_occupancy").delete().eq("library_id", library_id);
    // 2. Delete memberships
    await supabase.from("memberships").delete().eq("library_id", library_id);
    // 3. Delete students
    await supabase.from("students").delete().eq("library_id", library_id);
    // 4. Delete seats
    await supabase.from("seats").delete().eq("library_id", library_id);
    // 5. Delete lockers
    await supabase.from("lockers").delete().eq("library_id", library_id);
    // 6. Delete locker_policies
    await supabase.from("locker_policies").delete().eq("library_id", library_id);
    // 7. Delete combined_shift_pricing
    await supabase.from("combined_shift_pricing").delete().eq("library_id", library_id);
    // 8. Delete shifts
    await supabase.from("shifts").delete().eq("library_id", library_id);
    // 9. Finally delete the library itself
    const { error } = await supabase.from("libraries").delete().eq("id", library_id);

    if (error) {
      throw new Error("Failed to delete library: " + error.message);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error deleting library:", err);
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
