import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      name,
      address,
      city,
      state,
      pincode,
      total_seats,
      total_lockers,
      contact_phone,
      contact_email,
      shifts,
      combined_pricing,
      locker_policy,
    } = body;

    // Validate required fields
    if (
      !name ||
      !address ||
      !city ||
      !state ||
      !pincode ||
      !total_seats ||
      !contact_phone ||
      !contact_email
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!shifts || shifts.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one shift is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Insert library
    const { data: library, error: libError } = await supabase
      .from("libraries")
      .insert({
        name,
        address,
        city,
        state,
        pincode,
        total_seats,
        total_lockers: total_lockers || 0,
        contact_phone,
        contact_email,
        status: "pending",
      })
      .select("id")
      .single();

    if (libError) {
      return new Response(
        JSON.stringify({
          error: "Failed to register library: " + libError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const library_id = library.id;

    // Insert shifts
    const shiftRows = shifts.map((s: any) => ({
      library_id,
      label: s.label,
      start_time: s.start_time,
      end_time: s.end_time,
      duration_hours: s.duration_hours,
      monthly_fee: s.monthly_fee,
      fee_plans: s.fee_plans || {},
      is_active: true,
    }));

    const { error: shiftError } = await supabase
      .from("shifts")
      .insert(shiftRows);

    if (shiftError) {
      // Cleanup: delete library if shift insert fails
      await supabase.from("libraries").delete().eq("id", library_id);
      return new Response(
        JSON.stringify({
          error: "Failed to save shifts: " + shiftError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Insert combined pricing (if any)
    if (combined_pricing && combined_pricing.length > 0) {
      // We need the actual shift UUIDs — re-fetch inserted shifts
      const { data: insertedShifts } = await supabase
        .from("shifts")
        .select("id, label")
        .eq("library_id", library_id);

      const shiftLabelToId: Record<string, string> = {};
      (insertedShifts || []).forEach((s: any) => {
        shiftLabelToId[s.label] = s.id;
      });

      const comboRows = combined_pricing.map((c: any) => {
        // Map shift labels from the combination label to actual UUIDs
        const shiftLabels = c.label.split(" + ").map((l: string) => l.trim());
        const shift_ids = shiftLabels
          .map((label: string) => shiftLabelToId[label])
          .filter(Boolean);

        return {
          library_id,
          shift_ids,
          label: c.label,
          combined_fee: c.combined_fee,
        };
      });

      const { error: comboError } = await supabase
        .from("combined_shift_pricing")
        .insert(comboRows);

      if (comboError) {
        console.error("Combined pricing insert error:", comboError);
        // Non-fatal: library is still registered
      }
    }

    // Insert locker policy (if any)
    if (locker_policy && total_lockers > 0) {
      const { error: lockerError } = await supabase
        .from("locker_policies")
        .insert({
          library_id,
          eligible_shift_type: locker_policy.eligible_shift_type,
          monthly_fee: locker_policy.monthly_fee || 0,
          description: locker_policy.description || "",
        });

      if (lockerError) {
        console.error("Locker policy insert error:", lockerError);
        // Non-fatal: library is still registered
      }
    }

    return new Response(JSON.stringify({ success: true, library_id }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
