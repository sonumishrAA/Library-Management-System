import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ensurePortalAccess } from "../_shared/libraryPortal.ts";
import { createAuditEvent } from "../_shared/libraryOps.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    if (!libraryId) {
      return new Response(JSON.stringify({ error: "library_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user, subscription } = await ensurePortalAccess(req, libraryId, { requireOwner: true });
    if (subscription.is_locked) {
      throw new Error("Subscription locked: pricing changes are disabled");
    }

    const shifts = Array.isArray(body.shifts) ? body.shifts : [];
    const combos = Array.isArray(body.combined_shift_pricing) ? body.combined_shift_pricing : [];
    const lockerPolicies = Array.isArray(body.locker_policies) ? body.locker_policies : [];

    for (const shift of shifts) {
      if (!shift?.id) continue;
      const payload: any = {};
      if (shift.label !== undefined) payload.label = String(shift.label || "").trim();
      if (shift.monthly_fee !== undefined) payload.monthly_fee = Number(shift.monthly_fee || 0);
      if (shift.fee_plans !== undefined) payload.fee_plans = shift.fee_plans && typeof shift.fee_plans === "object" ? shift.fee_plans : {};
      if (shift.start_time !== undefined) payload.start_time = shift.start_time;
      if (shift.end_time !== undefined) payload.end_time = shift.end_time;
      if (shift.duration_hours !== undefined) payload.duration_hours = Number(shift.duration_hours || 0);

      const { error } = await supabase
        .from("shifts")
        .update(payload)
        .eq("library_id", libraryId)
        .eq("id", shift.id);

      if (error) throw new Error(`Failed to update shift pricing: ${error.message}`);
    }

    for (const combo of combos) {
      const payload: any = {
        library_id: libraryId,
        label: String(combo.label || "").trim(),
        shift_ids: Array.isArray(combo.shift_ids) ? combo.shift_ids : [],
        combined_fee: Number(combo.combined_fee || 0),
        fee_plans: combo.fee_plans && typeof combo.fee_plans === "object" ? combo.fee_plans : {},
      };

      if (combo.id) {
        const { error } = await supabase
          .from("combined_shift_pricing")
          .update(payload)
          .eq("library_id", libraryId)
          .eq("id", combo.id);
        if (error) throw new Error(`Failed to update combo pricing: ${error.message}`);
      } else {
        const { error } = await supabase.from("combined_shift_pricing").insert(payload);
        if (error) throw new Error(`Failed to create combo pricing: ${error.message}`);
      }
    }

    for (const policy of lockerPolicies) {
      const payload: any = {
        library_id: libraryId,
        eligible_shift_type: String(policy.eligible_shift_type || "any"),
        monthly_fee: Number(policy.monthly_fee || 0),
        description: String(policy.description || ""),
        gender: String(policy.gender || "any"),
      };

      if (policy.id) {
        const { error } = await supabase
          .from("locker_policies")
          .update(payload)
          .eq("library_id", libraryId)
          .eq("id", policy.id);
        if (error) throw new Error(`Failed to update locker policy: ${error.message}`);
      } else {
        const { error } = await supabase.from("locker_policies").insert(payload);
        if (error) throw new Error(`Failed to create locker policy: ${error.message}`);
      }
    }

    await createAuditEvent(supabase, {
      library_id: libraryId,
      actor_user_id: user.id,
      actor_role: "owner",
      event_type: "pricing_updated",
      entity_type: "library",
      entity_id: libraryId,
      summary: `Library pricing and policies updated`,
      metadata: {
        shifts_updated: shifts.length,
        combos_updated: combos.length,
        locker_policies_updated: lockerPolicies.length,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /required|locked|owner/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
