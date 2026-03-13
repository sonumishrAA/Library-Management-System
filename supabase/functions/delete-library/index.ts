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

    // Delete related data first — order matters to avoid FK violations
    // 1. Delete cash_transactions
    await supabase.from("cash_transactions").delete().eq("library_id", library_id);
    // 2. Delete audit_events
    await supabase.from("audit_events").delete().eq("library_id", library_id);
    // 3. Delete notifications
    await supabase.from("notifications").delete().eq("library_id", library_id);
    // 4. Delete seat_occupancy
    await supabase.from("seat_occupancy").delete().eq("library_id", library_id);
    // 5. Delete memberships
    await supabase.from("memberships").delete().eq("library_id", library_id);
    // 6. Delete students
    await supabase.from("students").delete().eq("library_id", library_id);
    // 7. Delete seats
    await supabase.from("seats").delete().eq("library_id", library_id);
    // 8. Delete lockers
    await supabase.from("lockers").delete().eq("library_id", library_id);
    // 9. Delete locker_policies
    await supabase.from("locker_policies").delete().eq("library_id", library_id);
    // 10. Delete combined_shift_pricing
    await supabase.from("combined_shift_pricing").delete().eq("library_id", library_id);
    // 11. Delete shifts
    await supabase.from("shifts").delete().eq("library_id", library_id);
    // 12. Delete library_user_access
    await supabase.from("library_user_access").delete().eq("library_id", library_id);
    // 13. Delete library_subscriptions
    await supabase.from("library_subscriptions").delete().eq("library_id", library_id);
    // 14. Finally delete the library itself
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
