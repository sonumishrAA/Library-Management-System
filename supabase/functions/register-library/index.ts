import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { contact_phone, contact_email, promo_code, libraries } = body;

    // Validate required fields
    if (!libraries || !Array.isArray(libraries) || libraries.length === 0) {
      return new Response(
        JSON.stringify({ error: "No libraries provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contact_phone || !contact_email) {
      return new Response(
        JSON.stringify({ error: "Contact phone and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const registeredLibraryIds: string[] = [];

    // Process each library
    for (const lib of libraries) {
      const {
        name,
        address,
        city,
        state,
        pincode,
        male_seats,
        female_seats,
        male_lockers,
        female_lockers,
        shifts,
        combined_pricing,
        locker_policies,
      } = lib;

      if (!name || !address || !city || !state || !pincode) {
        throw new Error("Missing required library fields");
      }

      if (!shifts || shifts.length === 0) {
        throw new Error("At least one shift is required per library");
      }

      const total_seats = (male_seats || 0) + (female_seats || 0);
      const total_lockers = (male_lockers || 0) + (female_lockers || 0);

      // Keep library insert compatible with DB schema (libraries table has total_lockers,
      // but not male_lockers/female_lockers in current production schema).
      const libraryPayload: any = {
        name,
        address,
        city,
        state,
        pincode,
        total_seats,
        total_lockers,
        male_seats: male_seats || 0,
        female_seats: female_seats || 0,
        contact_phone,
        contact_email,
        status: "pending_payment",
      };

      // Insert library
      const { data: libraryData, error: libError } = await supabase
        .from("libraries")
        .insert(libraryPayload)
        .select("id")
        .single();

      if (libError) {
        console.error("Failed to register library:", libError);
        throw new Error("Failed to register library: " + libError.message);
      }

      const library_id = libraryData.id;
      registeredLibraryIds.push(library_id);

      // Insert shifts
      const shiftRows = shifts.map((s: any) => {
        const feePlans =
          s.fee_plans && typeof s.fee_plans === "object" ? s.fee_plans : {};
        const oneMonthFromPlan = Number(feePlans["1"]);
        const fallbackMonthly = Number(s.monthly_fee);
        const monthlyFee = Number.isFinite(oneMonthFromPlan)
          ? oneMonthFromPlan
          : Number.isFinite(fallbackMonthly)
            ? fallbackMonthly
            : 0;

        return {
          library_id,
          label: s.label,
          start_time: s.start_time,
          end_time: s.end_time,
          duration_hours: s.duration_hours,
          monthly_fee: monthlyFee,
          fee_plans: feePlans,
          is_active: true,
          is_base: s.is_base ?? true,
        };
      });

      const { error: shiftError } = await supabase.from("shifts").insert(shiftRows);

      if (shiftError) {
        throw new Error("Failed to save shifts: " + shiftError.message);
      }

      // Insert combined pricing (auto-combos)
      if (combined_pricing && combined_pricing.length > 0) {
        const { data: insertedShifts } = await supabase
          .from("shifts")
          .select("id, label")
          .eq("library_id", library_id);

        const shiftLabelToId: Record<string, string> = {};
        (insertedShifts || []).forEach((s: any) => {
          shiftLabelToId[s.label] = s.id;
        });

        const comboRows = combined_pricing.map((c: any) => {
          // Find the IDs for the shifts that make up this combo
          const shiftLabels = c.label.split(" + ").map((l: string) => l.trim());
          const shift_ids = shiftLabels.map((l: string) => shiftLabelToId[l]).filter(Boolean);
          const comboMonthOne =
            c?.custom_fee_plans?.["1"] !== undefined &&
            c?.custom_fee_plans?.["1"] !== null &&
            c?.custom_fee_plans?.["1"] !== ""
              ? Number(c.custom_fee_plans["1"])
              : Number(c.combined_fee ?? c.custom_fee ?? c.default_fee ?? 0);

          return {
            library_id,
            shift_ids,
            label: c.label,
            combined_fee: Number.isNaN(comboMonthOne) ? 0 : comboMonthOne,
          };
        });

        if (comboRows.length > 0) {
          const { error: comboError } = await supabase
            .from("combined_shift_pricing")
            .insert(comboRows);

          if (comboError) {
            console.error("Combined pricing insert error:", comboError);
            // Non-fatal, continue
          }
        }
      }

      // Insert locker policies (gender-wise)
      if (locker_policies && locker_policies.length > 0) {
        const policyRows = locker_policies.map((p: any) => ({
          library_id,
          eligible_shift_type: p.eligible_shift_type,
          monthly_fee: p.monthly_fee || 0,
          description: p.description || "",
          gender: p.gender || "any", // store gender if the table supports it
        }));

        const { error: lockerError } = await supabase
          .from("locker_policies")
          .insert(policyRows);

        if (lockerError) {
          console.error("Locker policy insert error:", lockerError);
          // Non-fatal, continue
        }
      }
    }

    return new Response(JSON.stringify({ success: true, library_ids: registeredLibraryIds }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in register-library:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
