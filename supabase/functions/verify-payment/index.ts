import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import bcrypt from "npm:bcryptjs@3.0.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { generateLoginId, generatePassword } from "../_shared/utils.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, library_ids } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !library_ids || !Array.isArray(library_ids)) {
      return new Response(JSON.stringify({ error: "Missing required payment fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    // Optional: Verify signature if secret is configured
    if (razorpayKeySecret) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(razorpayKeySecret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const dataToSign = `${razorpay_order_id}|${razorpay_payment_id}`;
      const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        encoder.encode(dataToSign)
      );
      
      const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      if (expectedSignature !== razorpay_signature) {
        return new Response(JSON.stringify({ error: "Invalid payment signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("Skipping Razorpay signature verification because RAZORPAY_KEY_SECRET is missing");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const credentials = [];

    const getTodayISO = () => new Date().toISOString().split("T")[0];
    const addMonthsISO = (dateValue: string, monthsValue: number) => {
      const baseDate = new Date(`${dateValue}T00:00:00`);
      if (Number.isNaN(baseDate.getTime())) {
        return getTodayISO();
      }
      const safeMonths = Math.min(12, Math.max(1, Math.round(monthsValue || 1)));
      baseDate.setMonth(baseDate.getMonth() + safeMonths);
      return baseDate.toISOString().split("T")[0];
    };

    // Process each library to activate it and generate credentials
    for (const [libIndex, libraryId] of library_ids.entries()) {
      const matchingLibPayload = (body.libraries_payload || [])[libIndex] || null;
      const requestedAdminEmail = String(matchingLibPayload?.admin_account?.email || "").trim();
      const requestedAdminPassword = String(matchingLibPayload?.admin_account?.password || "").trim();

      const login_id = requestedAdminEmail || generateLoginId();
      const plain_password = requestedAdminPassword || generatePassword();
      const password_hash = await bcrypt.hash(plain_password, 12);

      const { error: updateError } = await supabase
        .from("libraries")
        .update({
          status: "active",
          login_id,
          password_hash,
        })
        .eq("id", libraryId);

      if (updateError) {
        console.error(`Failed to activate library ${libraryId}:`, updateError);
        continue;
      }

      credentials.push({
        library_id: libraryId,
        name: matchingLibPayload?.name || `Library ${libIndex + 1}`,
        login_id,
        plain_password,
      });

      // Call init-seats for the newly activated library
      try {
        await fetch(`${supabaseUrl}/functions/v1/init-seats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ library_id: libraryId })
        });
      } catch (e) {
        console.error(`Failed to invoke init-seats for ${libraryId}:`, e);
      }

      // Call init-lockers
      try {
        const requestedMaleLockers = Number(matchingLibPayload?.male_lockers || 0);
        const requestedFemaleLockers = Number(matchingLibPayload?.female_lockers || 0);

        await fetch(`${supabaseUrl}/functions/v1/init-lockers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            library_id: libraryId,
            male_lockers: Number.isFinite(requestedMaleLockers) ? requestedMaleLockers : 0,
            female_lockers: Number.isFinite(requestedFemaleLockers) ? requestedFemaleLockers : 0,
          })
        });
      } catch (e) {
        console.error(`Failed to invoke init-lockers for ${libraryId}:`, e);
      }

      // Insert imported students if any
      if (matchingLibPayload && matchingLibPayload.imported_students) {
        for (const student of matchingLibPayload.imported_students) {
           if (!student.name || !student.phone) continue;

           const durationMonths = Number(student.plan_duration || 1);
           const startDate = student.admission_date || getTodayISO();
           const endDate = student.end_date || addMonthsISO(startDate, durationMonths);
           const shiftIds = Array.isArray(student.shift_ids)
             ? student.shift_ids
             : student.shift_id
               ? [student.shift_id]
               : [];
           if (shiftIds.length === 0) continue;

           const studentPayload = {
             library_id: libraryId,
             full_name: student.name,
             father_name: student.father_name || "",
             phone: student.phone,
             gender: student.gender || "male",
             address: student.address || "",
             shift_ids: shiftIds,
             seat_number: student.seat_number || null,
             assign_locker: Boolean(student.has_locker),
             locker_number: student.locker_no || null,
             plan_duration: String(durationMonths || 1),
             amount_paid: Number(student.amount_paid || 0),
             payment_status: (student.payment_status || "paid").toLowerCase(),
             start_date: startDate,
             end_date: endDate,
           };

           try {
             await fetch(`${supabaseUrl}/functions/v1/add-student`, {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${serviceRoleKey}`,
               },
               body: JSON.stringify(studentPayload)
             });
           } catch (e) {
             console.error(`Failed to add student for ${libraryId}:`, e);
           }
        }
      }
    }

    // Optional: Update pending_orders table status to paid
    await supabase.from("pending_orders").update({ status: "paid", payment_id: razorpay_payment_id }).eq("order_id", razorpay_order_id);

    return new Response(JSON.stringify({ success: true, credentials }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error verifying payment:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
