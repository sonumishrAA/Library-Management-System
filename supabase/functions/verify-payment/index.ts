import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import bcrypt from "npm:bcryptjs@3.0.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { generateLoginId, generatePassword } from "../_shared/utils.ts";
import { findAvailableSeats, normalizeShiftIds } from "../_shared/libraryOps.ts";

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
    const ownerUserCache = new Map<string, string>();
    const staffUserCache = new Map<string, string>();

    const { data: pendingOrder } = await supabase
      .from("pending_orders")
      .select("id, plan_selections, amount")
      .eq("order_id", razorpay_order_id)
      .maybeSingle();

    const { data: pricingPlans } = await supabase
      .from("pricing_plans")
      .select("id, name, label, base_price, duration_days, is_active")
      .eq("is_active", true);

    const getTodayISO = () => new Date().toISOString().split("T")[0];
    const addDaysISO = (dateValue: string, daysValue: number) => {
      const baseDate = new Date(`${dateValue}T00:00:00`);
      if (Number.isNaN(baseDate.getTime())) {
        return getTodayISO();
      }
      const safeDays = Math.max(1, Math.round(daysValue || 30));
      baseDate.setDate(baseDate.getDate() + safeDays);
      return baseDate.toISOString().split("T")[0];
    };
    const addMonthsISO = (dateValue: string, monthsValue: number) => {
      const baseDate = new Date(`${dateValue}T00:00:00`);
      if (Number.isNaN(baseDate.getTime())) {
        return getTodayISO();
      }
      const safeMonths = Math.min(12, Math.max(1, Math.round(monthsValue || 1)));
      baseDate.setMonth(baseDate.getMonth() + safeMonths);
      return baseDate.toISOString().split("T")[0];
    };
    const normalizePlanSelection = (selection: any) => {
      if (selection && typeof selection === "object" && !Array.isArray(selection)) {
        const planIdCandidate = selection.plan_id ?? selection.selected_plan_id ?? selection.id;
        const durationCandidate = Number(selection.duration_days);
        return {
          planId: typeof planIdCandidate === "string" ? planIdCandidate.trim() : null,
          durationDays: Number.isFinite(durationCandidate) ? Math.round(durationCandidate) : null,
          name: typeof selection.name === "string" ? selection.name.trim().toLowerCase() : null,
          label: typeof selection.label === "string" ? selection.label.trim().toLowerCase() : null,
        };
      }

      return {
        planId: typeof selection === "string" ? selection.trim() : null,
        durationDays: null,
        name: null,
        label: null,
      };
    };
    const planById = new Map<string, any>();
    const planByDuration = new Map<number, any>();
    const planByName = new Map<string, any>();
    const planByLabel = new Map<string, any>();
    for (const plan of pricingPlans || []) {
      if (plan?.id) planById.set(plan.id, plan);
      const duration = Number(plan?.duration_days);
      if (Number.isFinite(duration) && !planByDuration.has(Math.round(duration))) {
        planByDuration.set(Math.round(duration), plan);
      }
      if (typeof plan?.name === "string" && plan.name.trim()) {
        planByName.set(plan.name.trim().toLowerCase(), plan);
      }
      if (typeof plan?.label === "string" && plan.label.trim()) {
        planByLabel.set(plan.label.trim().toLowerCase(), plan);
      }
    }
    const planSelections = pendingOrder?.plan_selections && typeof pendingOrder.plan_selections === "object"
      ? pendingOrder.plan_selections
      : {};
    const resolveMatchedPlan = (libraryId: string) => {
      const rawSelection = planSelections?.[libraryId];
      if (rawSelection === undefined || rawSelection === null) return null;

      const selection = normalizePlanSelection(rawSelection);
      if (selection.planId && planById.has(selection.planId)) return planById.get(selection.planId);
      if (selection.durationDays && planByDuration.has(selection.durationDays)) return planByDuration.get(selection.durationDays);
      if (selection.name && planByName.has(selection.name)) return planByName.get(selection.name);
      if (selection.label && planByLabel.has(selection.label)) return planByLabel.get(selection.label);
      return null;
    };
    const ensurePortalUser = async ({
      email,
      phone,
      passwordHash,
      role,
      libraryId,
      cache,
    }: {
      email: string | null;
      phone: string | null;
      passwordHash: string;
      role: "owner" | "staff";
      libraryId: string;
      cache: Map<string, string>;
    }) => {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail) return null;

      let userId = cache.get(normalizedEmail) || null;
      if (!userId) {
        const { data: existingUser } = await supabase
          .from("library_users")
          .select("id")
          .ilike("email", normalizedEmail)
          .maybeSingle();

        if (existingUser?.id) {
          userId = existingUser.id;
          await supabase
            .from("library_users")
            .update({
              phone: phone || null,
              password_hash: passwordHash,
              role,
              status: "active",
            })
            .eq("id", userId);
        } else {
          const { data: insertedUser, error: insertUserError } = await supabase
            .from("library_users")
            .insert({
              email: normalizedEmail,
              phone: phone || null,
              password_hash: passwordHash,
              role,
              status: "active",
            })
            .select("id")
            .single();

          if (insertUserError || !insertedUser?.id) {
            throw new Error(`Failed to create portal ${role} user: ${insertUserError?.message || "Unknown error"}`);
          }

          userId = insertedUser.id;
        }

        cache.set(normalizedEmail, userId);
      }

      const { error: accessError } = await supabase
        .from("library_user_access")
        .upsert({
          user_id: userId,
          library_id: libraryId,
          role,
          is_primary_owner: role === "owner",
          status: "active",
        }, { onConflict: "user_id,library_id" });

      if (accessError) {
        throw new Error(`Failed to grant portal ${role} access: ${accessError.message}`);
      }

      return userId;
    };
    const addImportedStudent = async (studentPayload: any): Promise<string | null> => {
      const {
        library_id,
        full_name,
        father_name,
        phone,
        gender,
        address,
        shift_ids,
        assign_locker,
        locker_number,
        plan_duration,
        amount_paid,
        payment_mode,
        payment_status,
        start_date,
        end_date,
      } = studentPayload;

      const shiftsToAssign = (Array.isArray(shift_ids) ? shift_ids : [shift_ids]).filter(Boolean);
      if (shiftsToAssign.length === 0) {
        console.warn(`Skipping "${full_name}": no shift assigned`);
        return null;
      }

      // ── Auto-assign seat ──────────────────────────────────────
      let resolvedSeat = "";
      try {
        const availableSeats = await findAvailableSeats(
          supabase,
          library_id,
          shiftsToAssign,
          gender,
          start_date,
          end_date,
        );
        resolvedSeat = availableSeats[0] || "";
      } catch (seatCheckError) {
        console.error(`Seat check failed for "${full_name}":`, seatCheckError);
      }

      if (!resolvedSeat) {
        console.warn(`Skipping "${full_name}": no seat available (${gender}/${shiftsToAssign.join(",")})`);
        return null; // Skip this student gracefully — don't crash the entire import
      }
      // ──────────────────────────────────────────────────────────

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

      const membershipRows = shiftsToAssign.map((shiftId: string, index: number) => ({
        student_id,
        library_id,
        shift_id: shiftId,
        seat_number: resolvedSeat,
        locker_number: assign_locker && locker_number ? locker_number : "",
        start_date,
        end_date,
        amount_paid: index === 0 && Number.isFinite(numericAmount) ? numericAmount : 0,
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

      if (resolvedSeat) {
        const occupancyRows = (memberships || []).map((membership: any) => ({
          library_id,
          seat_number: resolvedSeat,
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

      return student_id;
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
      const ownerEmail = requestedAdminEmail || String(body.contact_email || "").trim();

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

      await ensurePortalUser({
        email: ownerEmail || null,
        phone: String(body.contact_phone || "").trim() || null,
        passwordHash: password_hash,
        role: "owner",
        libraryId,
        cache: ownerUserCache,
      });

      if (staff_email && staff_password_hash) {
        await ensurePortalUser({
          email: staff_email,
          phone: null,
          passwordHash: staff_password_hash,
          role: "staff",
          libraryId,
          cache: staffUserCache,
        });
      }

      const matchedPlan = resolveMatchedPlan(libraryId);
      // Use actual paid amount from the order, split evenly across libraries
      const orderTotalAmount = Number(pendingOrder?.amount || 0);
      const perLibraryAmount = library_ids.length > 0
        ? Math.round(orderTotalAmount / library_ids.length)
        : orderTotalAmount;
      const savedAmount = perLibraryAmount > 0
        ? perLibraryAmount
        : Number(matchedPlan?.base_price || 0);

      // Fallback: if matchedPlan has no duration_days, default to 30 days
      const planDurationDays = Number(matchedPlan?.duration_days || 30);

      await supabase
        .from("library_subscriptions")
        .upsert({
          library_id: libraryId,
          pricing_plan_id: matchedPlan?.id || null,
          plan_key: matchedPlan?.name || matchedPlan?.label || null,
          status: "active",
          starts_on: getTodayISO(),
          ends_on: addDaysISO(getTodayISO(), planDurationDays),
          paused_on: null,
          renewal_requested_on: null,
          last_paid_amount: savedAmount,
          metadata: {
            source: "registration_payment",
            order_id: razorpay_order_id,
            razorpay_payment_id,
            actual_order_amount: orderTotalAmount,
          },
        }, { onConflict: "library_id" });

      const credsObj: any = {
        library_id: libraryId,
        name: matchingLibPayload?.name || `Library ${libIndex + 1}`,
        login_id,
        plain_password,
        owner_email: ownerEmail || null,
      };

      if (staff_email) {
        credsObj.staff_email = staff_email;
        credsObj.plain_staff_password = plain_staff_password;
      }

      credentials.push(credsObj);

      // ── Inline init-seats (no more fire-and-forget fetch) ────
      {
        const { count: existingSeatCount } = await supabase
          .from("seats")
          .select("*", { count: "exact", head: true })
          .eq("library_id", libraryId);

        if (!existingSeatCount || existingSeatCount === 0) {
          const { data: libRow } = await supabase
            .from("libraries")
            .select("total_seats, male_seats, female_seats")
            .eq("id", libraryId)
            .single();

          if (libRow) {
            const seatRows: any[] = [];
            const maleSeats = Number(libRow.male_seats || 0);
            const femaleSeats = Number(libRow.female_seats || 0);

            if (maleSeats > 0 || femaleSeats > 0) {
              for (let i = 1; i <= maleSeats; i++) {
                seatRows.push({ library_id: libraryId, seat_number: `M${i}`, gender: "male" });
              }
              for (let i = 1; i <= femaleSeats; i++) {
                seatRows.push({ library_id: libraryId, seat_number: `F${i}`, gender: "female" });
              }
            } else {
              const totalSeats = Number(libRow.total_seats || 0);
              for (let i = 1; i <= totalSeats; i++) {
                seatRows.push({ library_id: libraryId, seat_number: `${i}`, gender: "any" });
              }
            }

            if (seatRows.length > 0) {
              const { error: seatInsertError } = await supabase.from("seats").insert(seatRows);
              if (seatInsertError) {
                console.error(`Failed to init seats for ${libraryId}:`, seatInsertError);
              } else {
                console.log(`Initialized ${seatRows.length} seats for ${libraryId}`);
              }
            }
          }
        }
      }

      // ── Inline init-lockers ─────────────────────────────────
      {
        const { count: existingLockerCount } = await supabase
          .from("lockers")
          .select("*", { count: "exact", head: true })
          .eq("library_id", libraryId);

        if (!existingLockerCount || existingLockerCount === 0) {
          const requestedMaleLockers = Number(matchingLibPayload?.male_lockers || 0);
          const requestedFemaleLockers = Number(matchingLibPayload?.female_lockers || 0);
          const lockerRows: any[] = [];

          for (let i = 1; i <= requestedMaleLockers; i++) {
            lockerRows.push({ library_id: libraryId, locker_number: `ML${i}`, gender: "male", is_occupied: false });
          }
          for (let i = 1; i <= requestedFemaleLockers; i++) {
            lockerRows.push({ library_id: libraryId, locker_number: `FL${i}`, gender: "female", is_occupied: false });
          }

          if (lockerRows.length > 0) {
            const { error: lockerInsertError } = await supabase.from("lockers").insert(lockerRows);
            if (lockerInsertError) {
              console.error(`Failed to init lockers for ${libraryId}:`, lockerInsertError);
            } else {
              console.log(`Initialized ${lockerRows.length} lockers for ${libraryId}`);
            }
          }
        }
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
        let importedOk = 0;
        let importedSkipped = 0;
        const skippedNames: string[] = [];

        for (const student of matchingLibPayload.imported_students) {
           if (!student.name || !student.phone) {
             importedSkipped += 1;
             continue;
           }

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
             console.warn(`Skipping student "${student.name}": unable to map shift_ids`);
             importedSkipped += 1;
             skippedNames.push(student.name);
             continue;
           }

           const studentPayload = {
             library_id: libraryId,
             full_name: student.name,
             father_name: student.father_name || "",
             phone: student.phone,
             gender: student.gender || "male",
             address: student.address || "",
             shift_ids: shiftIds,
             seat_number: null, // Always auto-assign — students pick shift only
             assign_locker: Boolean(student.has_locker),
             locker_number: student.locker_no || null,
             plan_duration: String(durationMonths || 1),
             amount_paid: Number(student.amount_paid || 0),
             payment_status: (student.payment_status || "paid").toLowerCase(),
             start_date: startDate,
             end_date: endDate,
           };

           try {
             const result = await addImportedStudent(studentPayload);
             if (result) {
               importedOk += 1;
             } else {
               importedSkipped += 1;
               skippedNames.push(student.name);
             }
           } catch (e: any) {
             console.error(`Failed to import "${student.name}":`, e?.message || e);
             importedSkipped += 1;
             skippedNames.push(student.name);
             // Don't throw — continue with remaining students
           }
        }

        console.log(`Import summary for ${libraryId}: ${importedOk} imported, ${importedSkipped} skipped.`);
        if (skippedNames.length > 0) {
          console.warn(`Skipped students: ${skippedNames.join(", ")}`);
        }
      }
    }

    // Optional: Update pending_orders table status to paid
    await supabase
      .from("pending_orders")
      .update({
        status: "paid",
        payment_id: razorpay_payment_id,
        metadata: {
          verified_at: new Date().toISOString(),
        },
      })
      .eq("order_id", razorpay_order_id);

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
