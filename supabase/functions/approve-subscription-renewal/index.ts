import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyAdminToken } from "../_shared/adminAuth.ts";
import { addDays, createServiceClient, todayDate } from "../_shared/libraryPortal.ts";
import { createAuditEvent } from "../_shared/libraryOps.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    await verifyAdminToken(req, jwtSecret);

    const body = await req.json();
    const requestId = String(body.request_id || "").trim();
    if (!requestId) {
      return new Response(JSON.stringify({ error: "request_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createServiceClient();
    const { data: renewalRequest, error: requestError } = await supabase
      .from("subscription_renewal_requests")
      .select("id, library_id, pricing_plan_id, requested_period_days, amount, status")
      .eq("id", requestId)
      .single();

    if (requestError || !renewalRequest) {
      throw new Error("Renewal request not found");
    }
    if (renewalRequest.status !== "pending") {
      throw new Error("Only pending renewal requests can be approved");
    }

    const durationDays = Math.max(1, Number(renewalRequest.requested_period_days || 30));
    const startsOn = todayDate();
    const endsOn = addDays(startsOn, durationDays);

    const { error: requestUpdateError } = await supabase
      .from("subscription_renewal_requests")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (requestUpdateError) {
      throw new Error(`Failed to update renewal request: ${requestUpdateError.message}`);
    }

    const { error: subscriptionError } = await supabase
      .from("library_subscriptions")
      .update({
        pricing_plan_id: renewalRequest.pricing_plan_id,
        status: "active",
        starts_on: startsOn,
        ends_on: endsOn,
        paused_on: null,
        renewal_requested_on: null,
        last_paid_amount: Number(renewalRequest.amount || 0),
        metadata: {
          last_approved_request_id: renewalRequest.id,
        },
      })
      .eq("library_id", renewalRequest.library_id);

    if (subscriptionError) {
      throw new Error(`Failed to activate subscription: ${subscriptionError.message}`);
    }

    await createAuditEvent(supabase, {
      library_id: renewalRequest.library_id,
      actor_user_id: null,
      actor_role: "lms_admin",
      event_type: "subscription_renewal_approved",
      entity_type: "subscription_renewal_request",
      entity_id: renewalRequest.id,
      summary: `Subscription renewed till ${endsOn}`,
      metadata: {
        starts_on: startsOn,
        ends_on: endsOn,
        amount: renewalRequest.amount,
      },
    });

    return new Response(JSON.stringify({ success: true, starts_on: startsOn, ends_on: endsOn }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const message = err.message || "Internal server error";
    const status = /required|not found|pending|unauthorized/i.test(message) ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
