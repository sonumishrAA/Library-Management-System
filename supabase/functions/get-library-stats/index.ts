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

    // 1. Total Libraries
    const { count: totalLibraries, error: err1 } = await supabase
      .from("libraries")
      .select("*", { count: "exact", head: true });

    // 2. Active Libraries
    const { count: activeLibraries, error: err2 } = await supabase
      .from("libraries")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    // 3. Pending Libraries
    const { count: pendingLibraries, error: err3 } = await supabase
      .from("libraries")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "pending_payment"]);

    // 4. Total Students
    const { count: totalStudents, error: err4 } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true });

    // 5. Revenue (From pending_orders that are 'paid', or similar platform table)
    let revenue = 0;
    const { data: paidOrders, error: err5 } = await supabase
      .from("pending_orders")
      .select("amount")
      .eq("status", "paid");

    if (paidOrders) {
      revenue = paidOrders.reduce((sum: number, order: any) => sum + (Number(order.amount) || 0), 0);
    }

    if (err1 || err2 || err3 || err4 || err5) {
      console.warn("One or more stat queries returned an error", { err1, err2, err3, err4, err5 });
    }

    const stats = {
      totalLibraries: totalLibraries || 0,
      activeLibraries: activeLibraries || 0,
      pendingLibraries: pendingLibraries || 0,
      totalStudents: totalStudents || 0,
      revenue,
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error fetching library stats:", err);
    const status = err.message?.includes("Unauthorized") || err.message?.includes("authorization") ? 401 : 500;
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
