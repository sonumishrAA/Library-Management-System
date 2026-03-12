import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PlanSelectionValue =
  | string
  | number
  | {
      plan_id?: unknown;
      selected_plan_id?: unknown;
      id?: unknown;
      duration_days?: unknown;
      name?: unknown;
      label?: unknown;
    };

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_REGEX.test(value.trim());

const toOptionalLower = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : null;
};

const toOptionalDuration = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
};

const normalizePlanSelection = (selection: PlanSelectionValue) => {
  if (selection && typeof selection === "object" && !Array.isArray(selection)) {
    const obj = selection as Record<string, unknown>;
    const planIdCandidate = obj.plan_id ?? obj.selected_plan_id ?? obj.id;
    return {
      planId: isUuid(planIdCandidate) ? planIdCandidate.trim() : null,
      durationDays: toOptionalDuration(obj.duration_days),
      name: toOptionalLower(obj.name),
      label: toOptionalLower(obj.label),
    };
  }

  return {
    planId: isUuid(selection) ? selection.trim() : null,
    durationDays: null,
    name: null,
    label: null,
  };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { library_ids, plan_selections, promo_code_id } = body;

    if (!library_ids || !Array.isArray(library_ids) || library_ids.length === 0) {
      return new Response(JSON.stringify({ error: "Missing library_ids" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!plan_selections || typeof plan_selections !== "object" || Array.isArray(plan_selections)) {
      return new Response(JSON.stringify({ error: "Missing or invalid plan_selections" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error("Razorpay credentials are not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: pricingPlans, error: pricingError } = await supabase
      .from("pricing_plans")
      .select("id, name, label, base_price, duration_days, is_active")
      .eq("is_active", true);

    if (pricingError) {
      throw new Error("Failed to load pricing plans: " + pricingError.message);
    }

    if (!pricingPlans || pricingPlans.length === 0) {
      return new Response(JSON.stringify({ error: "No active pricing plans available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planById = new Map<string, any>();
    const planByDuration = new Map<number, any>();
    const planByName = new Map<string, any>();
    const planByLabel = new Map<string, any>();

    for (const plan of pricingPlans) {
      if (typeof plan.id === "string") {
        planById.set(plan.id, plan);
      }
      const duration = toOptionalDuration(plan.duration_days);
      if (duration && !planByDuration.has(duration)) {
        planByDuration.set(duration, plan);
      }
      const name = toOptionalLower(plan.name);
      if (name && !planByName.has(name)) {
        planByName.set(name, plan);
      }
      const label = toOptionalLower(plan.label);
      if (label && !planByLabel.has(label)) {
        planByLabel.set(label, plan);
      }
    }

    let totalAmount = 0;
    const unresolvedLibraries: Array<{ library_id: string; reason: string }> = [];
    const matchedPlanIds = new Set<string>();
    const normalizedSelections = plan_selections as Record<string, PlanSelectionValue>;

    for (const rawLibraryId of library_ids) {
      const libraryId = String(rawLibraryId || "").trim();
      if (!libraryId) continue;

      const selectionRaw = normalizedSelections[libraryId];
      if (selectionRaw === undefined || selectionRaw === null) {
        unresolvedLibraries.push({ library_id: libraryId, reason: "Plan selection missing" });
        continue;
      }

      const selection = normalizePlanSelection(selectionRaw);
      let matchedPlan = null;

      if (selection.planId) {
        matchedPlan = planById.get(selection.planId) || null;
      }
      if (!matchedPlan && selection.durationDays) {
        matchedPlan = planByDuration.get(selection.durationDays) || null;
      }
      if (!matchedPlan && selection.name) {
        matchedPlan = planByName.get(selection.name) || null;
      }
      if (!matchedPlan && selection.label) {
        matchedPlan = planByLabel.get(selection.label) || null;
      }

      if (!matchedPlan) {
        unresolvedLibraries.push({ library_id: libraryId, reason: "Selected plan not found in active pricing plans" });
        continue;
      }

      const planPrice = Number(matchedPlan.base_price ?? 0);
      if (!Number.isFinite(planPrice) || planPrice < 0) {
        unresolvedLibraries.push({ library_id: libraryId, reason: "Selected plan has invalid price" });
        continue;
      }

      if (typeof matchedPlan.id === "string" && matchedPlan.id.trim()) {
        matchedPlanIds.add(matchedPlan.id.trim());
      }

      totalAmount += planPrice;
    }

    if (unresolvedLibraries.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid plan selections for one or more libraries",
          details: unresolvedLibraries,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (library_ids.length > 1 && matchedPlanIds.size > 1) {
      return new Response(
        JSON.stringify({
          error: "All libraries in a single registration must use the same subscription plan",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Apply promo code (simplified)
    if (promo_code_id) {
      // Mock -500 discount for valid promo code
      totalAmount = Math.max(0, totalAmount - 500);
    }

    if (totalAmount <= 0) {
      return new Response(JSON.stringify({ error: "Total amount must be greater than zero" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Razorpay order
    const rzpUrl = "https://api.razorpay.com/v1/orders";
    const authHeaders = {
      Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      "Content-Type": "application/json",
    };

    const orderPayload = {
      amount: totalAmount * 100, // Amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const rzpRes = await fetch(rzpUrl, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(orderPayload),
    });

    if (!rzpRes.ok) {
      const err = await rzpRes.json();
      console.error("Razorpay order error:", err);
      throw new Error(err?.error?.description || err?.error?.reason || "Failed to create Razorpay order");
    }

    const orderData = await rzpRes.json();

    // Store in pending orders table
    // Creating a record to verify against later
    const { error: insertError } = await supabase
      .from("pending_orders")
      .insert({
         order_id: orderData.id,
         library_ids,
         amount: totalAmount,
         status: "created"
      });

    if (insertError) {
      console.error("Warning: Failed to log pending order", insertError);
    }

    return new Response(JSON.stringify({ 
      order_id: orderData.id, 
      amount: orderData.amount, 
      currency: orderData.currency 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error creating payment order:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
