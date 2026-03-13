import { addDays, addMonthsDate, asDateOnly, compareDateOnly, todayDate } from "./libraryPortal.ts";

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeShiftIds = (shiftIds: unknown) => {
  const arr = Array.isArray(shiftIds) ? shiftIds : [shiftIds];
  return [...new Set(arr.map((item) => String(item || "").trim()).filter(Boolean))].sort();
};

export const sameShiftSet = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

export const resolveFeePlans = (value: any) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
};

export const feeForDuration = (feePlans: any, durationMonths: number, fallbackMonthly = 0) => {
  const normalized = Math.max(1, Math.round(Number(durationMonths) || 1));
  const plans = resolveFeePlans(feePlans);
  const direct = Number(plans[String(normalized)]);
  if (Number.isFinite(direct)) return direct;
  const monthly = Number(plans["1"]);
  if (Number.isFinite(monthly)) return monthly * normalized;
  const fallback = Number(fallbackMonthly);
  return Number.isFinite(fallback) ? fallback * normalized : 0;
};

export const isLockerRuleEligible = (eligibleShiftType: string | null | undefined, durationHours: number) => {
  const normalized = String(eligibleShiftType || "").toLowerCase();
  if (!normalized || normalized === "any") return true;
  if (normalized === "24h_only") return durationHours >= 24;
  if (normalized === "12h_plus") return durationHours >= 12;
  if (normalized === "single_shift") return durationHours > 0 && durationHours < 12;
  return true;
};

export async function loadLibraryConfiguration(supabase: any, libraryId: string) {
  const [{ data: shifts }, { data: combos }, { data: lockerPolicies }, { data: seats }, { data: lockers }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, library_id, label, start_time, end_time, duration_hours, monthly_fee, fee_plans, is_active, is_base")
      .eq("library_id", libraryId)
      .eq("is_active", true)
      .order("start_time", { ascending: true }),
    supabase
      .from("combined_shift_pricing")
      .select("id, library_id, label, shift_ids, combined_fee, fee_plans")
      .eq("library_id", libraryId),
    supabase
      .from("locker_policies")
      .select("id, library_id, eligible_shift_type, monthly_fee, description, gender")
      .eq("library_id", libraryId),
    supabase
      .from("seats")
      .select("id, library_id, seat_number, gender")
      .eq("library_id", libraryId)
      .order("seat_number", { ascending: true }),
    supabase
      .from("lockers")
      .select("id, library_id, locker_number, gender, is_occupied, membership_id")
      .eq("library_id", libraryId)
      .order("locker_number", { ascending: true }),
  ]);

  const shiftMap = new Map<string, any>();
  for (const shift of shifts || []) {
    shiftMap.set(shift.id, shift);
  }

  return {
    shifts: shifts || [],
    shiftMap,
    combos: (combos || []).map((combo: any) => ({
      ...combo,
      shift_ids: normalizeShiftIds(combo.shift_ids || []),
      fee_plans: resolveFeePlans(combo.fee_plans),
    })),
    lockerPolicies: lockerPolicies || [],
    seats: seats || [],
    lockers: lockers || [],
  };
}

export function resolveShiftSelectionPricing(config: any, shiftIds: string[], durationMonths: number) {
  const normalizedShiftIds = normalizeShiftIds(shiftIds);
  if (normalizedShiftIds.length === 0) {
    throw new Error("At least one shift is required");
  }

  const combo = (config.combos || []).find((item: any) => sameShiftSet(item.shift_ids || [], normalizedShiftIds));
  if (combo) {
    const durationHours = normalizedShiftIds.reduce((sum, shiftId) => {
      const shift = config.shiftMap.get(shiftId);
      return sum + asNumber(shift?.duration_hours, 0);
    }, 0);

    return {
      type: "combo",
      label: combo.label,
      shift_ids: normalizedShiftIds,
      amount: feeForDuration(combo.fee_plans, durationMonths, asNumber(combo.combined_fee, 0)),
      duration_hours: durationHours,
    };
  }

  if (normalizedShiftIds.length === 1) {
    const shift = config.shiftMap.get(normalizedShiftIds[0]);
    if (!shift) {
      throw new Error("Selected shift not found");
    }
    return {
      type: "shift",
      label: shift.label,
      shift_ids: normalizedShiftIds,
      amount: feeForDuration(shift.fee_plans, durationMonths, asNumber(shift.monthly_fee, 0)),
      duration_hours: asNumber(shift.duration_hours, 0),
    };
  }

  throw new Error("Pricing is not configured for the selected shift combination");
}

export function findLockerPolicy(lockerPolicies: any[], gender: string, durationHours: number) {
  const normalizedGender = String(gender || "any").toLowerCase();
  const genderMatch = lockerPolicies.find((policy) => {
    const policyGender = String(policy.gender || "any").toLowerCase();
    return (policyGender === normalizedGender || policyGender === "any")
      && isLockerRuleEligible(policy.eligible_shift_type, durationHours);
  });

  return genderMatch || null;
}

export async function findAvailableSeats(
  supabase: any,
  libraryId: string,
  shiftIds: string[],
  gender: string,
  startDate: string,
  endDate: string,
  candidateSeats?: string[],
) {
  const normalizedGender = String(gender || "").trim().toLowerCase();

  // Build seat query with gender filter
  const fetchSeats = async (genderFilter: boolean) => {
    let seatQuery = supabase
      .from("seats")
      .select("seat_number, gender")
      .eq("library_id", libraryId);

    if (genderFilter && normalizedGender) {
      seatQuery = seatQuery.in("gender", [normalizedGender, "any"]);
    }

    if (candidateSeats && candidateSeats.length > 0) {
      seatQuery = seatQuery.in("seat_number", candidateSeats);
    }

    const { data, error } = await seatQuery;
    if (error) throw new Error(`Failed to fetch seats: ${error.message}`);
    return data || [];
  };

  // Try gender-matched seats first
  let seats = await fetchSeats(true);

  // Gender fallback: if no matching seats (e.g. female in a male-only library), use all seats
  if (seats.length === 0 && normalizedGender) {
    seats = await fetchSeats(false);
  }

  const normalizedShiftIds = normalizeShiftIds(shiftIds);
  const { data: occupied, error: occError } = await supabase
    .from("seat_occupancy")
    .select("seat_number")
    .eq("library_id", libraryId)
    .in("shift_id", normalizedShiftIds)
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  if (occError) {
    throw new Error(`Failed to check seat occupancy: ${occError.message}`);
  }

  const occupiedSet = new Set((occupied || []).map((item: any) => item.seat_number));
  return (seats || [])
    .map((seat: any) => String(seat.seat_number || "").trim())
    .filter(Boolean)
    .filter((seatNumber: string) => !occupiedSet.has(seatNumber))
    .sort((left: string, right: string) => left.localeCompare(right, undefined, { numeric: true }));
}

export async function ensureSeatSelection(
  supabase: any,
  libraryId: string,
  shiftIds: string[],
  gender: string,
  startDate: string,
  endDate: string,
  _requestedSeatNumber?: string | null,
) {
  // Always auto-assign: students pick shift, seat is assigned automatically
  const availableSeats = await findAvailableSeats(supabase, libraryId, shiftIds, gender, startDate, endDate);

  const firstAvailableSeat = availableSeats[0] || null;
  if (!firstAvailableSeat) {
    throw new Error("No seat available for the selected shifts");
  }

  return { seat_number: firstAvailableSeat, available_seats: availableSeats };
}

export async function ensureLockerSelection(
  supabase: any,
  libraryId: string,
  lockers: any[],
  lockerPolicies: any[],
  params: {
    shiftDurationHours: number;
    gender: string;
    durationMonths: number;
    assignLocker?: boolean;
    requestedLockerNumber?: string | null;
  },
) {
  const requested = Boolean(params.assignLocker);
  if (!requested) {
    return {
      assign_locker: false,
      locker_number: null,
      locker_fee_total: 0,
      locker_policy: null,
      available_lockers: [],
    };
  }

  const lockerPolicy = findLockerPolicy(lockerPolicies, params.gender, params.shiftDurationHours);
  if (!lockerPolicy) {
    throw new Error("No locker policy available for the selected student and shift");
  }

  const normalizedGender = String(params.gender || "").trim().toLowerCase();
  const availableLockers = (lockers || [])
    .filter((locker: any) => !locker.is_occupied)
    .filter((locker: any) => {
      const lockerGender = String(locker.gender || "any").toLowerCase();
      return lockerGender === "any" || lockerGender === normalizedGender;
    })
    .map((locker: any) => String(locker.locker_number || "").trim())
    .filter(Boolean)
    .sort((left: string, right: string) => left.localeCompare(right, undefined, { numeric: true }));

  let lockerNumber = params.requestedLockerNumber ? String(params.requestedLockerNumber).trim() : "";
  if (lockerNumber) {
    if (!availableLockers.includes(lockerNumber)) {
      throw new Error("Requested locker is not available");
    }
  } else {
    lockerNumber = availableLockers[0] || "";
  }

  if (!lockerNumber) {
    throw new Error("No locker left for this student");
  }

  const lockerFee = asNumber(lockerPolicy.monthly_fee, 0) * Math.max(1, Math.round(params.durationMonths || 1));
  return {
    assign_locker: true,
    locker_number: lockerNumber,
    locker_fee_total: lockerFee,
    locker_policy: lockerPolicy,
    available_lockers: availableLockers,
  };
}

export async function createAuditEvent(supabase: any, payload: any) {
  const { error } = await supabase.from("audit_events").insert(payload);
  if (error) {
    console.error("Failed to create audit event", error);
  }
}

export async function notifyOwners(supabase: any, payload: {
  library_id: string;
  actor_user_id?: string | null;
  type: string;
  title: string;
  body: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data: owners } = await supabase
    .from("library_user_access")
    .select("user_id")
    .eq("library_id", payload.library_id)
    .eq("role", "owner")
    .eq("status", "active");

  if (!owners || owners.length === 0) return;

  const rows = owners.map((owner: any) => ({
    library_id: payload.library_id,
    owner_user_id: owner.user_id,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    actor_user_id: payload.actor_user_id || null,
    entity_type: payload.entity_type || null,
    entity_id: payload.entity_id || null,
    metadata: payload.metadata || {},
  }));

  const { error } = await supabase.from("owner_notifications").insert(rows);
  if (error) {
    console.error("Failed to create owner notifications", error);
  }
}

export async function fetchStudentBundles(supabase: any, libraryId: string) {
  const [{ data: students, error: studentError }, { data: memberships, error: membershipError }, { data: shifts }] = await Promise.all([
    supabase
      .from("students")
      .select("id, library_id, full_name, father_name, phone, gender, address, status, created_at")
      .eq("library_id", libraryId)
      .order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("id, student_id, library_id, shift_id, seat_number, locker_number, start_date, end_date, amount_paid, payment_mode, payment_status, plan_duration, status")
      .eq("library_id", libraryId)
      .order("end_date", { ascending: false }),
    supabase
      .from("shifts")
      .select("id, label, start_time, end_time, duration_hours")
      .eq("library_id", libraryId)
      .eq("is_active", true),
  ]);

  if (studentError) {
    throw new Error(`Failed to fetch students: ${studentError.message}`);
  }
  if (membershipError) {
    throw new Error(`Failed to fetch memberships: ${membershipError.message}`);
  }

  const shiftMap = new Map<string, any>();
  for (const shift of shifts || []) {
    shiftMap.set(shift.id, shift);
  }

  const groupedMemberships = new Map<string, any[]>();
  for (const membership of memberships || []) {
    if (!groupedMemberships.has(membership.student_id)) {
      groupedMemberships.set(membership.student_id, []);
    }
    groupedMemberships.get(membership.student_id)!.push(membership);
  }

  const today = todayDate();
  return (students || []).map((student: any) => {
    const studentMemberships = groupedMemberships.get(student.id) || [];
    const normalizedMemberships = studentMemberships.map((membership) => ({
      ...membership,
      shift_label: shiftMap.get(membership.shift_id)?.label || "Shift",
      shift_duration_hours: asNumber(shiftMap.get(membership.shift_id)?.duration_hours, 0),
    }));
    const latestMembership = normalizedMemberships[0] || null;
    const latestEndDate = latestMembership?.end_date || null;
    const isExpired = Boolean(latestEndDate && compareDateOnly(latestEndDate, today) < 0);
    const dueSoon = Boolean(latestEndDate && compareDateOnly(latestEndDate, addDays(today, 7)) <= 0 && compareDateOnly(latestEndDate, today) >= 0);
    const seatNumber = latestMembership?.seat_number || "";
    const lockerNumber = latestMembership?.locker_number || "";

    return {
      ...student,
      memberships: normalizedMemberships,
      latest_membership: latestMembership,
      seat_number: seatNumber,
      locker_number: lockerNumber,
      shift_labels: [...new Set(normalizedMemberships.map((item) => item.shift_label))],
      current_end_date: latestEndDate,
      is_expired: isExpired,
      due_soon: dueSoon,
    };
  });
}

export async function buildSeatMap(supabase: any, libraryId: string) {
  const [{ data: seats, error: seatError }, { data: occupancies, error: occError }, { data: memberships }, { data: shifts }, { data: students }] = await Promise.all([
    supabase
      .from("seats")
      .select("id, seat_number, gender")
      .eq("library_id", libraryId)
      .order("seat_number", { ascending: true }),
    supabase
      .from("seat_occupancy")
      .select("seat_number, shift_id, membership_id, start_date, end_date, gender")
      .eq("library_id", libraryId)
      .gte("end_date", todayDate()),
    supabase
      .from("memberships")
      .select("id, student_id, seat_number, locker_number, end_date")
      .eq("library_id", libraryId)
      .gte("end_date", todayDate()),
    supabase
      .from("shifts")
      .select("id, label")
      .eq("library_id", libraryId),
    supabase
      .from("students")
      .select("id, full_name")
      .eq("library_id", libraryId),
  ]);

  if (seatError) throw new Error(`Failed to fetch seat map: ${seatError.message}`);
  if (occError) throw new Error(`Failed to fetch occupancy map: ${occError.message}`);

  const membershipMap = new Map<string, any>();
  for (const membership of memberships || []) {
    membershipMap.set(membership.id, membership);
  }
  const shiftMap = new Map<string, string>();
  for (const shift of shifts || []) {
    shiftMap.set(shift.id, shift.label);
  }
  const studentMap = new Map<string, string>();
  for (const student of students || []) {
    studentMap.set(student.id, student.full_name);
  }

  const occupancyBySeat = new Map<string, any[]>();
  for (const occupancy of occupancies || []) {
    if (!occupancyBySeat.has(occupancy.seat_number)) {
      occupancyBySeat.set(occupancy.seat_number, []);
    }
    const membership = membershipMap.get(occupancy.membership_id);
    occupancyBySeat.get(occupancy.seat_number)!.push({
      membership_id: occupancy.membership_id,
      shift_label: shiftMap.get(occupancy.shift_id) || "Shift",
      student_name: studentMap.get(membership?.student_id) || "Student",
      ends_on: membership?.end_date || occupancy.end_date,
      locker_number: membership?.locker_number || null,
    });
  }

  return (seats || []).map((seat: any) => ({
    id: seat.id,
    seat_number: seat.seat_number,
    gender: seat.gender,
    occupants: occupancyBySeat.get(seat.seat_number) || [],
  }));
}

export function summarizeVacancyByShift(seatMap: any[], shifts: any[]) {
  return (shifts || []).map((shift: any) => {
    const occupiedSeats = new Set<string>();
    for (const seat of seatMap) {
      if ((seat.occupants || []).some((occupant: any) => occupant.shift_label === shift.label)) {
        occupiedSeats.add(seat.seat_number);
      }
    }
    return {
      shift_id: shift.id,
      shift_label: shift.label,
      vacant_count: Math.max((seatMap || []).length - occupiedSeats.size, 0),
    };
  });
}

export function monthsFromPlanDuration(planDuration: string | number | null | undefined) {
  const numeric = Math.round(Number(planDuration || 1));
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return numeric;
}

export function nextEndDate(fromDate: string | null | undefined, durationMonths: number) {
  const base = asDateOnly(fromDate) || todayDate();
  return addMonthsDate(base, durationMonths);
}
