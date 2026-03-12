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
    const reservedLoginIds = new Set<string>();

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
    const addImportedStudent = async (studentPayload: any) => {
      const {
        library_id,
        full_name,
        father_name,
        phone,
        gender,
        address,
        shift_ids,
        seat_number,
        assign_locker,
        locker_number,
        plan_duration,
        amount_paid,
        payment_mode,
        payment_status,
        start_date,
        end_date,
      } = studentPayload;

      if (!seat_number || String(seat_number).trim() === "") {
        throw new Error("Seat number is mandatory");
      }

      const shiftsToAssign = (Array.isArray(shift_ids) ? shift_ids : [shift_ids]).filter(Boolean);
      if (shiftsToAssign.length === 0) {
        throw new Error("At least one shift is required");
      }

      const { data: student, error: studentError } = await supabase
        .from("students")
        .insert({
          library_id,
          full_name,
          father_name: father_name || "",
          phone,
          gender,
          address: address || "",
          status: "active",
        })
        .select("id")
        .single();

      if (studentError) {
        throw new Error(`Failed to insert student: ${studentError.message}`);
      }

      const student_id = student.id;
      const numericAmount = Number(amount_paid || 0);
      const normalizedPaymentStatus = String(payment_status || "paid").toLowerCase();

      const membershipRows = shiftsToAssign.map((shiftId: string) => ({
        student_id,
        library_id,
        shift_id: shiftId,
        seat_number,
        locker_number: assign_locker && locker_number ? locker_number : "",
        start_date,
        end_date,
        amount_paid: Number.isFinite(numericAmount) ? numericAmount : 0,
        payment_mode: payment_mode || "cash",
        payment_status: normalizedPaymentStatus,
        plan_duration: String(plan_duration || "1"),
        status: "active",
      }));

      const { data: memberships, error: membershipError } = await supabase
        .from("memberships")
        .insert(membershipRows)
        .select("id, shift_id");

      if (membershipError) {
        await supabase.from("students").delete().eq("id", student_id);
        throw new Error(`Failed to create membership: ${membershipError.message}`);
      }

      if (seat_number) {
        const occupancyRows = (memberships || []).map((membership: any) => ({
          library_id,
          seat_number,
          membership_id: membership.id,
          shift_id: membership.shift_id,
          gender,
          start_date,
          end_date,
        }));

        if (occupancyRows.length > 0) {
          const { error: occupancyError } = await supabase
            .from("seat_occupancy")
            .insert(occupancyRows);

          if (occupancyError) {
            console.error("Failed to insert seat occupancy:", occupancyError);
          }
        }
      }

      if (assign_locker && locker_number) {
        const primaryMembershipId = memberships?.[0]?.id;
        const { error: lockerUpdateError } = await supabase
          .from("lockers")
          .update({ is_occupied: true, membership_id: primaryMembershipId || null })
          .eq("library_id", library_id)
          .eq("locker_number", locker_number);

        if (lockerUpdateError) {
          console.error("Locker update error:", lockerUpdateError);
        }
      }
    };

    const buildLoginIdVariant = (baseLoginId: string, attempt: number) => {
      const base = String(baseLoginId || "").trim();
      if (!base) return generateLoginId();
      if (attempt === 0) return base;

      if (base.includes("@")) {
        const [localPart, domainPart] = base.split("@");
        const safeLocal = localPart || "owner";
        const safeDomain = domainPart || "libraryos.in";
        return `${safeLocal}+lib${attempt}@${safeDomain}`;
      }

      return `${base}_lib${attempt}`;
    };

    const resolveUniqueLoginId = async (baseLoginId: string, currentLibraryId: string) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = buildLoginIdVariant(baseLoginId, attempt);
        if (!candidate || reservedLoginIds.has(candidate)) continue;

        const { data, error } = await supabase
          .from("libraries")
          .select("id")
          .eq("login_id", candidate)
          .neq("id", currentLibraryId)
          .limit(1);

        if (error) {
          throw new Error(`Failed to verify login ID uniqueness: ${error.message}`);
        }

        if (!data || data.length === 0) {
          reservedLoginIds.add(candidate);
          return candidate;
        }
      }

      throw new Error("Unable to generate unique login ID for library activation");
    };

    // Process each library to activate it and generate credentials
    for (const [libIndex, libraryId] of library_ids.entries()) {
      const matchingLibPayload = (body.libraries_payload || [])[libIndex] || null;
      const requestedAdminEmail = String(matchingLibPayload?.admin_account?.email || "").trim();
      const requestedAdminPassword = String(matchingLibPayload?.admin_account?.password || "").trim();

      const requestedBaseLoginId = requestedAdminEmail || generateLoginId();
      const login_id = await resolveUniqueLoginId(requestedBaseLoginId, libraryId);
      const plain_password = requestedAdminPassword || generatePassword();
      const password_hash = await bcrypt.hash(plain_password, 12);

      // Staff Account logic
      const requestedStaffEmail = String(matchingLibPayload?.staff_account?.email || "").trim();
      const requestedStaffPassword = String(matchingLibPayload?.staff_account?.password || "").trim();
      let staff_email = null;
      let staff_password_hash = null;
      let plain_staff_password = null;

      if (matchingLibPayload?.staff_account) {
        staff_email = requestedStaffEmail || `staff_${generateLoginId()}`;
        plain_staff_password = requestedStaffPassword || generatePassword();
        staff_password_hash = await bcrypt.hash(plain_staff_password, 12);
      }

      // We add staff_email and staff_password_hash to the update payload
      // The user must add these columns to their db schema
      const updatePayload: any = {
        status: "active",
        login_id,
        password_hash,
      };

      let updateError = null;

      if (staff_email) {
        updatePayload.staff_email = staff_email;
        updatePayload.staff_password_hash = staff_password_hash;
        
        const res = await supabase.from("libraries").update(updatePayload).eq("id", libraryId);
        updateError = res.error;

        // Fallback if the user hasn't added the staff columns to their database yet
        if (updateError && String(updateError.message).includes("staff_email")) {
          console.warn("Fallback: staff_email column missing in libraries table. Activating without staff credentials.");
          delete updatePayload.staff_email;
          delete updatePayload.staff_password_hash;
          staff_email = null; // Prevent it from being added to the returned credentials array
          plain_staff_password = null;
          
          const fallbackRes = await supabase.from("libraries").update(updatePayload).eq("id", libraryId);
          updateError = fallbackRes.error;
        }
      } else {
        const res = await supabase.from("libraries").update(updatePayload).eq("id", libraryId);
        updateError = res.error;
      }

      if (updateError) {
        console.error(`Failed to activate library ${libraryId}:`, updateError);
        throw new Error(`Database error activating library: ${updateError.message}`);
      }

      const credsObj: any = {
        library_id: libraryId,
        name: matchingLibPayload?.name || `Library ${libIndex + 1}`,
        login_id,
        plain_password,
      };

      if (staff_email) {
        credsObj.staff_email = staff_email;
        credsObj.plain_staff_password = plain_staff_password;
      }

      credentials.push(credsObj);

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

      // Map local shift IDs to DB shift IDs
      const localIdToLabel = new Map<string, string>();
      if (matchingLibPayload && Array.isArray(matchingLibPayload.shifts)) {
        matchingLibPayload.shifts.forEach((s: any) => {
          if (s.id && s.label) {
            localIdToLabel.set(s.id, s.label);
          }
        });
      }

      const { data: dbShifts } = await supabase
        .from("shifts")
        .select("id, label")
        .eq("library_id", libraryId);

      const labelToDbId = new Map<string, string>();
      const dbShiftIdSet = new Set<string>();
      if (dbShifts) {
        dbShifts.forEach((s: any) => {
          labelToDbId.set(s.label, s.id);
          dbShiftIdSet.add(s.id);
        });
      }

      // Insert imported students if any
      if (matchingLibPayload && matchingLibPayload.imported_students) {
        for (const student of matchingLibPayload.imported_students) {
           if (!student.name || !student.phone) continue;

           const durationMonths = Number(student.plan_duration || 1);
           const startDate = student.admission_date || getTodayISO();
           const endDate = student.end_date || addMonthsISO(startDate, durationMonths);
           const rawShiftIds = Array.isArray(student.shift_ids)
             ? student.shift_ids
             : student.shift_id
               ? [student.shift_id]
               : [];

           // Map local frontend shift IDs to DB shift IDs
           const shiftIds = rawShiftIds
             .map((localId: string) => {
             if (!localId) return null;
             const label = localIdToLabel.get(localId);
             if (label && labelToDbId.has(label)) {
               return labelToDbId.get(label)!;
             }
             if (dbShiftIdSet.has(localId)) {
               return localId;
             }
             return null;
           })
             .filter(Boolean) as string[];

           if (shiftIds.length === 0) {
             throw new Error(
               `Unable to map shift_ids for imported student "${student.name || student.phone || "unknown"}"`,
             );
           }

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
             await addImportedStudent(studentPayload);
           } catch (e) {
             console.error(`Failed to add imported student for ${libraryId}:`, e);
             throw e;
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
