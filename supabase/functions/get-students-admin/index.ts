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

    const url = new URL(req.url);
    const library_id = url.searchParams.get("library_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Join students with libraries and memberships
    // To mimic standard SQL JOIN:
    // SELECT s.*, l.name as library_name, m.shift_id, m.seat_number, m.start_date, m.end_date
    // FROM students s
    // LEFT JOIN libraries l ON s.library_id = l.id
    // LEFT JOIN memberships m ON s.id = m.student_id

    let query = supabase
      .from("students")
      .select(`
        *,
        libraries!inner ( name, city ),
        memberships ( shift_id, seat_number, locker_number, start_date, end_date )
      `);

    if (library_id && library_id !== "all") {
      query = query.eq("library_id", library_id);
    }

    const { data: students, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw new Error("Failed to fetch students: " + error.message);
    }

    return new Response(JSON.stringify({ students }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error fetching students:", err);
    const status = err.message?.includes("Unauthorized") || err.message?.includes("authorization") ? 401 : 500;
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
