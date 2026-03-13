import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ensurePortalAccess, todayDate } from "../_shared/libraryPortal.ts";
import { createAuditEvent } from "../_shared/libraryOps.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const libraryId = String(body.library_id || "").trim();
    const pricingPlanId = String(body.pricing_plan_id || "").trim();
    const cashReferenceNote = String(body.cash_reference_note || "").trim();

    if (!libraryId || !pricingPlanId) {
      return new Response(JSON.stringify({ error: "library_id and pricing_plan_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, user } = await ensurePortalAccess(req, libraryId, {
      requireOwner: true,
      allowExpiredOwnerRead: true,
      allowExpiredOwnerWrite: true,
    });

    const { data: pricingPlan, error: pricingError } = await supabase
      .from("pricing_plans")
      .select("id, name, label, base_price, duration_days, is_active")
      .eq("id", pricingPlanId)
      .eq("is_active", true)
      .single();

    if (pricingError || !pricingPlan) {
      throw new Error("Selected subscription plan was not found");
    }

    const { data: existingPending } = await supabase
      .from("subscription_renewal_requests")
      .select("id")
      .eq("library_id", libraryId)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      throw new Error("A renewal request is already pending approval for this library");
    }

    const { data: requestRow, error: insertError } = await supabase
      .from("subscription_renewal_requests")
      .insert({
        library_id: libraryId,
        pricing_plan_id: pricingPlan.id,
        requested_by_user_id: user.id,
        status: "pending",
        amount: Number(pricingPlan.base_price || 0),
        cash_reference_note: cashReferenceNote || null,
        requested_period_days: Number(pricingPlan.duration_days || 0),
        metadata: {
          plan_name: pricingPlan.name,
          plan_label: pricingPlan.label,
        },
      })
      .select("id, amount, requested_period_days, created_at")
      .single();

    if (insertError || !requestRow) {
      throw new Error(`Failed to create renewal request: ${insertError?.message || "Unknown error"}`);
    }

    const { error: subscriptionError } = await supabase
      .from("library_subscriptions")
      .update({
        status: "pending_approval",
        pricing_plan_id: pricingPlan.id,
        plan_key: pricingPlan.name || pricingPlan.label || null,
        renewal_requested_on: todayDate(),
        last_paid_amount: Number(pricingPlan.base_price || 0),
        metadata: {
          last_requested_plan: pricingPlan.name || pricingPlan.label || null,
          pending_request_id: requestRow.id,
        },
      })
      .eq("library_id", libraryId);

    if (subscriptionError) {
      throw new Error(`Failed to update subscription state: ${subscriptionError.message}`);
    }

    await createAuditEvent(supabase, {
      library_id: libraryId,
      actor_user_id: user.id,
      actor_role: "owner",
      event_type: "subscription_renewal_requested",
      entity_type: "subscription_renewal_request",
      entity_id: requestRow.id,
      summary: `Subscription renewal requested`,
      metadata: {
        pricing_plan_id: pricingPlan.id,
        amount: requestRow.amount,
        duration_days: requestRow.requested_period_days,
      },
    });

    return new Response(JSON.stringify({ success: true, request: requestRow }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /required|owner|plan|pending approval/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
