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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse query params
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "all";

    // Build query
    let query = supabase
      .from("libraries")
      .select(
        `
        id, name, address, city, state, pincode,
        total_seats, total_lockers, contact_phone, contact_email,
        login_id, status, created_at,
        shifts (id, label, start_time, end_time, duration_hours, monthly_fee, fee_plans, is_active),
        combined_shift_pricing (id, shift_ids, label, combined_fee),
        locker_policies (id, eligible_shift_type, monthly_fee, description)
      `,
      )
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: libraries, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch libraries: " + error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ libraries: libraries || [] }), {
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
