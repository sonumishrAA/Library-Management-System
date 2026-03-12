import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import StepIndicator from '../components/StepIndicator.jsx';
import { registerLibraryBatch, getPricing, createPaymentOrder, verifyPayment } from '../lib/api.js';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const formatTime12 = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

const FEE_PLAN_MONTHS = Array.from({ length: 12 }, (_, idx) => idx + 1);

const createEmptyFeePlans = () =>
  Object.fromEntries(FEE_PLAN_MONTHS.map((month) => [String(month), '']));

const normalizeFeePlans = (feePlans = {}) =>
  Object.fromEntries(
    FEE_PLAN_MONTHS.map((month) => {
      const key = String(month);
      const raw = feePlans?.[key];
      return [key, raw === undefined || raw === null ? '' : String(raw)];
    }),
  );

const compactPlanPayload = (feePlans = {}) =>
  Object.fromEntries(
    Object.entries(feePlans)
      .filter(([, value]) => value !== '' && value !== null && value !== undefined)
      .map(([month, value]) => [month, Number(value)]),
  );

const createDefaultFeePlans = () => {
  const plans = createEmptyFeePlans();
  plans['1'] = '500';
  plans['3'] = '1500';
  return plans;
};

const calcDurationHours = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 10) / 10;
};

const DEFAULT_SHIFT_BLUEPRINTS = [
  { label: 'Morning', start_time: '07:00', end_time: '12:00' },
  { label: 'Afternoon', start_time: '12:00', end_time: '17:00' },
  { label: 'Evening', start_time: '17:00', end_time: '22:00' },
  { label: 'Night', start_time: '22:00', end_time: '07:00' },
];

const createDefaultShifts = () =>
  DEFAULT_SHIFT_BLUEPRINTS.map((shift, idx) => ({
    id: `default-shift-${idx + 1}`,
    label: shift.label,
    start_time: shift.start_time,
    end_time: shift.end_time,
    duration_hours: calcDurationHours(shift.start_time, shift.end_time),
    monthly_fee: 500,
    fee_plans: createDefaultFeePlans(),
    is_base: true,
  }));

const createDefaultCombinedPricing = (shifts) => {
  const combos = [];
  let comboIdx = 1;

  for (let len = 2; len <= shifts.length; len += 1) {
    for (let i = 0; i <= shifts.length - len; i += 1) {
      const slice = shifts.slice(i, i + len);
      const isConsecutive = slice.every(
        (shift, index) => index === 0 || slice[index - 1].end_time === shift.start_time,
      );
      if (!isConsecutive) continue;

      const month1 = slice.reduce((sum, shift) => sum + Number(shift.fee_plans?.['1'] || 0), 0);
      const month3 = slice.reduce((sum, shift) => sum + Number(shift.fee_plans?.['3'] || 0), 0);
      const defaultFeePlans = createEmptyFeePlans();
      defaultFeePlans['1'] = String(month1);
      defaultFeePlans['3'] = String(month3);

      combos.push({
        id: `default-combo-${comboIdx}`,
        shift_ids: slice.map((shift) => shift.id),
        label: slice.map((shift) => shift.label).join(' + '),
        default_fee: month1,
        default_fee_plans: defaultFeePlans,
        custom_fee: String(month1),
        custom_fee_plans: { ...defaultFeePlans },
        is_offered: true,
        start_time: slice[0].start_time,
        end_time: slice[slice.length - 1].end_time,
        duration_hours: slice.reduce((sum, shift) => sum + Number(shift.duration_hours || 0), 0),
      });
      comboIdx += 1;
    }
  }

  return combos;
};

const createEmptyShiftForm = () => ({
  label: 'Morning',
  start_time: '07:00',
  end_time: '12:00',
  fee_plans: createDefaultFeePlans(),
});

const getShiftPlanAmount = (shift, durationMonths) => {
  if (!shift) return 0;
  const duration = Number(durationMonths) || 1;
  const planValue = shift.fee_plans?.[String(duration)];

  if (planValue === undefined || planValue === null || planValue === '') {
    if (duration === 1) {
      const monthlyFee = Number(shift.monthly_fee);
      return Number.isNaN(monthlyFee) ? null : monthlyFee;
    }
    return null;
  }

  const numericPlanValue = Number(planValue);
  return Number.isNaN(numericPlanValue) ? null : numericPlanValue;
};

const getComboPlanAmount = (combo, durationMonths) => {
  if (!combo) return null;
  const duration = Number(durationMonths) || 1;
  const key = String(duration);

  const customPlanValue = combo.custom_fee_plans?.[key];
  if (customPlanValue !== undefined && customPlanValue !== null && customPlanValue !== '') {
    const numericCustom = Number(customPlanValue);
    if (!Number.isNaN(numericCustom)) return numericCustom;
  }

  const defaultPlanValue = combo.default_fee_plans?.[key];
  if (defaultPlanValue !== undefined && defaultPlanValue !== null && defaultPlanValue !== '') {
    const numericDefault = Number(defaultPlanValue);
    if (!Number.isNaN(numericDefault)) return numericDefault;
  }

  if (duration === 1) {
    const oneMonthFallback = Number(combo.custom_fee ?? combo.default_fee);
    return Number.isNaN(oneMonthFallback) ? null : oneMonthFallback;
  }

  return null;
};

const getConfiguredPlanEntries = (feePlans = {}) =>
  Object.entries(feePlans || {})
    .filter(
      ([month, value]) =>
        month !== '' &&
        value !== '' &&
        value !== null &&
        value !== undefined &&
        !Number.isNaN(Number(value)),
    )
    .map(([month, value]) => ({ month: Number(month), amount: Number(value) }))
    .filter((entry) => Number.isFinite(entry.month) && Number.isFinite(entry.amount))
    .sort((a, b) => a.month - b.month);

const STUDENT_CSV_HEADERS = [
  'name',
  'father_name',
  'phone',
  'gender',
  'address',
  'shift_label',
  'plan_duration',
  'admission_date',
  'payment_status',
  'has_locker',
  'locker_no',
];

const CSV_HEADER_ALIASES = {
  name: ['name', 'full_name'],
  father_name: ['father_name', 'father_name_optional', 'father_name_(optional)', 'father_name_optional_'],
  phone: ['phone', 'mobile', 'mobile_number'],
  gender: ['gender', 'sex'],
  address: ['address', 'full_address'],
  shift_label: ['shift_label', 'shift', 'shift_name'],
  plan_duration: ['plan_duration', 'months', 'plan_duration_months'],
  admission_date: ['admission_date', 'start_date', 'joining_date'],
  payment_status: ['payment_status', 'payment'],
  has_locker: ['has_locker', 'assign_locker', 'locker'],
  locker_no: ['locker_no', 'locker_number'],
};

const getTodayDateISO = () => new Date().toISOString().split('T')[0];

const normalizeDurationMonths = (value) => {
  const rawValue = String(value ?? '').trim().toLowerCase();
  if (!rawValue) return 1;

  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue)) {
    return Math.min(12, Math.max(1, Math.round(numericValue)));
  }

  const extractedDigits = rawValue.match(/\d+/);
  if (!extractedDigits) return 1;
  return Math.min(12, Math.max(1, Math.round(Number(extractedDigits[0]))));
};

const addMonthsToDateISO = (dateValue, months) => {
  const fallback = getTodayDateISO();
  const safeDate = dateValue || fallback;
  const date = new Date(`${safeDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return addMonthsToDateISO(fallback, months);
  }
  date.setMonth(date.getMonth() + normalizeDurationMonths(months));
  return date.toISOString().split('T')[0];
};

const normalizeStudentGender = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'female' ? 'female' : 'male';
};

const normalizePaymentStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'pending' ? 'pending' : 'paid';
};

const normalizeCsvHeader = (header) =>
  String(header || '')
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, '')
    .replace(/\s+/g, '_');

const normalizeShiftLabelKey = (label) =>
  String(label || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+(and)\s+/g, ' + ')
    .replace(/\s*(\/|&|\||,)\s*/g, ' + ')
    .replace(/\s+/g, ' ')
    .replace(/\bafter noon\b/g, 'afternoon')
    .replace(/\bnoon\b/g, 'afternoon')
    .replace(/\bmid\s*day\b/g, 'afternoon')
    .replace(/\bshift\b/g, '')
    .replace(/\s*\+\s*/g, ' + ');

const splitShiftLabelParts = (label) =>
  normalizeShiftLabelKey(label)
    .split(' + ')
    .map((part) => part.trim())
    .filter(Boolean);

const toCanonicalShiftAlias = (label) => {
  const normalized = normalizeShiftLabelKey(label).replace(/\s+/g, '');
  if (!normalized) return '';

  if (
    ['morning', 'morn', 'morng', 'am', 'm'].includes(normalized) ||
    /^m\d*$/.test(normalized)
  ) {
    return 'morning';
  }
  if (
    ['afternoon', 'afternon', 'afternoon', 'aft', 'pm', 'a', 'noon'].includes(normalized) ||
    /^a\d*$/.test(normalized)
  ) {
    return 'afternoon';
  }
  if (
    ['evening', 'eve', 'evng', 'e'].includes(normalized) ||
    /^e\d*$/.test(normalized)
  ) {
    return 'evening';
  }
  if (
    ['night', 'nite', 'ngt', 'n'].includes(normalized) ||
    /^n\d*$/.test(normalized)
  ) {
    return 'night';
  }

  return normalized;
};

const inferShiftAliasFromStartTime = (startTime) => {
  const [hoursRaw] = String(startTime || '').split(':');
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours)) return '';
  if (hours >= 5 && hours < 12) return 'morning';
  if (hours >= 12 && hours < 17) return 'afternoon';
  if (hours >= 17 && hours < 22) return 'evening';
  return 'night';
};

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  values.push(current.trim());
  return values;
};

const parseCsvText = (csvText = '') =>
  csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(parseCsvLine);

const parseCsvBoolean = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'yes', 'true', 'y'].includes(normalized);
};

const toCsvCell = (value) => {
  const stringValue = String(value ?? '');
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const getPlanIdentity = (plan) => {
  if (!plan) return '';
  if (plan.id !== undefined && plan.id !== null && String(plan.id).trim() !== '') {
    return `id:${String(plan.id)}`;
  }
  if (plan.name) return `name:${String(plan.name)}`;
  return '';
};

const generateStudentRowId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `student-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createStudentRow = (overrides = {}) => {
  const today = getTodayDateISO();
  const duration = normalizeDurationMonths(overrides.plan_duration || 1);
  const admissionDate = overrides.admission_date || today;
  return {
    id: generateStudentRowId(),
    name: '',
    father_name: '',
    phone: '',
    address: '',
    gender: 'male',
    shift_id: '',
    seat_number: '',
    seat_available_count: 0,
    has_locker: false,
    locker_no: '',
    locker_options: [],
    locker_available_count: 0,
    locker_allowed: false,
    locker_disabled_reason: 'Select a shift first',
    plan_duration: String(duration),
    admission_date: admissionDate,
    end_date: addMonthsToDateISO(admissionDate, duration),
    amount_paid: 0,
    payment_status: 'paid',
    ...overrides,
  };
};

const getSeatPoolForStudent = (lib, gender) => {
  const maleSeats = Number(lib?.male_seats) || 0;
  const femaleSeats = Number(lib?.female_seats) || 0;
  const normalizedGender = normalizeStudentGender(gender);

  if (maleSeats > 0 && femaleSeats > 0) {
    const count = normalizedGender === 'female' ? femaleSeats : maleSeats;
    const prefix = normalizedGender === 'female' ? 'F' : 'M';
    return Array.from({ length: count }, (_, idx) => `${prefix}${idx + 1}`);
  }

  if (maleSeats > 0) {
    return Array.from({ length: maleSeats }, (_, idx) => `M${idx + 1}`);
  }

  if (femaleSeats > 0) {
    return Array.from({ length: femaleSeats }, (_, idx) => `F${idx + 1}`);
  }

  return [];
};

const getLockerPolicyForStudent = (lib, gender) => {
  const maleLockers = Number(lib?.male_lockers) || 0;
  const femaleLockers = Number(lib?.female_lockers) || 0;
  const normalizedGender = normalizeStudentGender(gender);

  if (normalizedGender === 'female' && femaleLockers > 0) {
    return lib?.femaleLockerPolicy || null;
  }
  if (normalizedGender === 'male' && maleLockers > 0) {
    return lib?.maleLockerPolicy || null;
  }

  if (femaleLockers === 0 && maleLockers > 0) {
    return lib?.maleLockerPolicy || null;
  }
  if (maleLockers === 0 && femaleLockers > 0) {
    return lib?.femaleLockerPolicy || null;
  }

  return null;
};

const getLockerPoolForStudent = (lib, gender) => {
  const maleLockers = Number(lib?.male_lockers) || 0;
  const femaleLockers = Number(lib?.female_lockers) || 0;
  const normalizedGender = normalizeStudentGender(gender);

  if (maleLockers > 0 && femaleLockers > 0) {
    const count = normalizedGender === 'female' ? femaleLockers : maleLockers;
    const prefix = normalizedGender === 'female' ? 'FL' : 'ML';
    return Array.from({ length: count }, (_, idx) => `${prefix}${idx + 1}`);
  }

  if (maleLockers > 0) {
    return Array.from({ length: maleLockers }, (_, idx) => `ML${idx + 1}`);
  }

  if (femaleLockers > 0) {
    return Array.from({ length: femaleLockers }, (_, idx) => `FL${idx + 1}`);
  }

  return [];
};

const isLockerRuleEligible = (eligibleShiftType, durationHours) => {
  if (!Number.isFinite(Number(durationHours))) return false;
  const duration = Number(durationHours);
  if (eligibleShiftType === '24h_only') return duration >= 24;
  if (eligibleShiftType === '12h_plus') return duration >= 12;
  return true;
};

const lockerRuleLabel = (eligibleShiftType) => {
  if (eligibleShiftType === '24h_only') return '24-hour';
  if (eligibleShiftType === '12h_plus') return '12+ hour';
  return 'any';
};

const getShiftMetaForStudent = (lib, shiftId, durationMonths) => {
  if (!shiftId) {
    return { amount: 0, durationHours: null, shiftIds: [] };
  }

  const baseShift = (lib?.shifts || []).find((shift) => shift.id === shiftId);
  if (baseShift) {
    return {
      amount: getShiftPlanAmount(baseShift, durationMonths) ?? 0,
      durationHours: Number(baseShift.duration_hours) || 0,
      shiftIds: [baseShift.id],
    };
  }

  const comboShift = (lib?.combinedPricing || []).find((combo) => combo.id === shiftId);
  if (comboShift) {
    return {
      amount: getComboPlanAmount(comboShift, durationMonths) ?? 0,
      durationHours: Number(comboShift.duration_hours) || 0,
      shiftIds: Array.isArray(comboShift.shift_ids) ? comboShift.shift_ids : [],
    };
  }

  return { amount: 0, durationHours: null, shiftIds: [] };
};

const getConfiguredMonthsFromPlans = (...plans) =>
  Array.from(
    new Set(
      plans
        .flatMap((plan) => getConfiguredPlanEntries(plan || {}).map((entry) => Number(entry.month)))
        .filter((month) => Number.isFinite(month)),
    ),
  ).sort((a, b) => a - b);

const getConfiguredMonthsForShiftOption = (lib, shiftId) => {
  if (!shiftId) return [];

  const baseShift = (lib?.shifts || []).find((shift) => shift.id === shiftId);
  if (baseShift) {
    return getConfiguredMonthsFromPlans(baseShift.fee_plans);
  }

  const comboShift = (lib?.combinedPricing || []).find((combo) => combo.id === shiftId);
  if (comboShift) {
    return getConfiguredMonthsFromPlans(comboShift.custom_fee_plans, comboShift.default_fee_plans);
  }

  return [];
};

const getLibraryConfiguredMonths = (lib) =>
  Array.from(
    new Set([
      ...(lib?.shifts || []).flatMap((shift) => getConfiguredMonthsFromPlans(shift.fee_plans)),
      ...((lib?.combinedPricing || [])
        .filter((combo) => combo.is_offered)
        .flatMap((combo) => getConfiguredMonthsFromPlans(combo.custom_fee_plans, combo.default_fee_plans))),
    ]),
  ).sort((a, b) => a - b);

const getAvailablePlanMonthsForStudent = (lib, student) => {
  const shiftSpecificMonths = getConfiguredMonthsForShiftOption(lib, student?.shift_id);
  if (shiftSpecificMonths.length > 0) return shiftSpecificMonths;

  const libraryMonths = getLibraryConfiguredMonths(lib);
  if (libraryMonths.length > 0) return libraryMonths;

  return [1];
};

const recalculateImportedStudentsForLibrary = (lib, students = []) => {
  const occupiedByShift = new Map();
  const occupiedLockers = new Set();

  return (students || []).map((student) => {
    const availablePlanMonths = getAvailablePlanMonthsForStudent(lib, student);
    const requestedDuration = normalizeDurationMonths(student.plan_duration);
    const durationMonths = availablePlanMonths.includes(requestedDuration)
      ? requestedDuration
      : (availablePlanMonths[0] || 1);
    const admissionDate = student.admission_date || getTodayDateISO();
    const endDate = addMonthsToDateISO(admissionDate, durationMonths);
    const gender = normalizeStudentGender(student.gender);
    const shiftMeta = getShiftMetaForStudent(lib, student.shift_id, durationMonths);

    const seatPool = student.shift_id ? getSeatPoolForStudent(lib, gender) : [];
    const shiftOccupancySet = student.shift_id
      ? occupiedByShift.get(student.shift_id) || new Set()
      : new Set();
    const existingSeat = String(student.seat_number || '').trim();

    let assignedSeat = '';
    if (student.shift_id && seatPool.length > 0) {
      const canKeepExistingSeat =
        existingSeat &&
        seatPool.includes(existingSeat) &&
        !shiftOccupancySet.has(existingSeat);
      assignedSeat = canKeepExistingSeat
        ? existingSeat
        : seatPool.find((seatNumber) => !shiftOccupancySet.has(seatNumber)) || '';

      if (assignedSeat) {
        shiftOccupancySet.add(assignedSeat);
      }
      occupiedByShift.set(student.shift_id, shiftOccupancySet);
    }

    const availableSeatCount = student.shift_id
      ? Math.max(seatPool.length - shiftOccupancySet.size, 0)
      : 0;

    const lockerPolicy = getLockerPolicyForStudent(lib, gender);
    const isRuleEligible =
      Boolean(lockerPolicy) &&
      isLockerRuleEligible(lockerPolicy.eligible_shift_type, shiftMeta.durationHours);
    const lockerPool = Boolean(student.shift_id) && isRuleEligible
      ? getLockerPoolForStudent(lib, gender)
      : [];
    const lockerAllowed = Boolean(student.shift_id) && Boolean(lockerPolicy) && isRuleEligible && lockerPool.length > 0;
    const existingLocker = String(student.locker_no || '').trim();
    const requestedLocker = lockerAllowed ? Boolean(student.has_locker) : false;

    let assignedLocker = '';
    let hasLocker = false;
    if (lockerAllowed && requestedLocker) {
      const canKeepExistingLocker =
        existingLocker &&
        lockerPool.includes(existingLocker) &&
        !occupiedLockers.has(existingLocker);

      assignedLocker = canKeepExistingLocker
        ? existingLocker
        : lockerPool.find((lockerNo) => !occupiedLockers.has(lockerNo)) || '';

      hasLocker = Boolean(assignedLocker);
      if (assignedLocker) occupiedLockers.add(assignedLocker);
    }

    const lockerOptions = lockerAllowed
      ? lockerPool.filter(
          (lockerNo) =>
            !occupiedLockers.has(lockerNo) ||
            lockerNo === assignedLocker ||
            lockerNo === existingLocker,
        )
      : [];

    const lockerAvailableCount = lockerAllowed
      ? lockerPool.filter((lockerNo) => !occupiedLockers.has(lockerNo)).length
      : 0;

    let lockerDisabledReason = '';
    if (!student.shift_id) {
      lockerDisabledReason = 'Select a shift first';
    } else if (!lockerPolicy) {
      lockerDisabledReason = 'No locker policy available for this student';
    } else if (!isRuleEligible) {
      lockerDisabledReason = `Locker is allowed only for ${lockerRuleLabel(lockerPolicy.eligible_shift_type)} shifts`;
    } else if (lockerPool.length === 0) {
      lockerDisabledReason = 'No lockers configured for this student category';
    } else if (requestedLocker && !assignedLocker) {
      lockerDisabledReason = 'No locker left for this student category';
    }

    if (!hasLocker && lockerAllowed && lockerAvailableCount === 0) {
      lockerDisabledReason = 'No locker left for this student category';
    }

    const isLockerAssignable = lockerAllowed && (lockerAvailableCount > 0 || hasLocker);

    return {
      ...student,
      id: student.id || generateStudentRowId(),
      gender,
      plan_duration: String(durationMonths),
      admission_date: admissionDate,
      end_date: endDate,
      amount_paid: Number.isFinite(Number(shiftMeta.amount)) ? Number(shiftMeta.amount) : 0,
      payment_status: normalizePaymentStatus(student.payment_status),
      seat_number: assignedSeat,
      seat_available_count: availableSeatCount,
      locker_allowed: isLockerAssignable,
      locker_disabled_reason: isLockerAssignable ? '' : lockerDisabledReason,
      has_locker: hasLocker,
      locker_no: hasLocker ? assignedLocker : '',
      locker_options: lockerOptions,
      locker_available_count: lockerAvailableCount,
    };
  });
};

const resolveStudentShiftIds = (lib, student) =>
  getShiftMetaForStudent(lib, student?.shift_id, student?.plan_duration).shiftIds;

const getShiftLabelForStudent = (lib, shiftId) => {
  if (!shiftId) return 'Not selected';
  const base = (lib?.shifts || []).find((shift) => shift.id === shiftId);
  if (base) return `[Base] ${base.label}`;
  const combo = (lib?.combinedPricing || []).find((item) => item.id === shiftId);
  if (combo) return `[Combo] ${combo.label}`;
  return 'Unknown shift';
};

const generateTempPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
  let output = '';
  for (let i = 0; i < 10; i += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
};

const initialForm = {
  name: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  male_seats: '', // Replaces total_seats
  female_seats: '', // Replaces total_girls_seats
  male_lockers: '', // Replaces total_lockers
  female_lockers: '',
  shifts: [], // Base shifts
  combinedPricing: [], // Auto-generated combos
  maleLockerPolicy: {
    eligible_shift_type: 'any',
    monthly_fee: '',
    description: '',
  },
  femaleLockerPolicy: {
    eligible_shift_type: 'any',
    monthly_fee: '',
    description: '',
  },
  contact_phone: '',
  contact_email: '',
  admin_email: '',
  admin_password: '',
  staff_enabled: false,
  staff_email: '',
  staff_password: '',
  imported_students: [],
  selectedPlan: null,
};

const createInitialLibraryForm = () => {
  // Pre-fill default shift schedule and combo pricing; user can edit during registration.
  const shifts = createDefaultShifts();
  return {
    ...initialForm,
    shifts,
    combinedPricing: createDefaultCombinedPricing(shifts),
    maleLockerPolicy: { ...initialForm.maleLockerPolicy },
    femaleLockerPolicy: { ...initialForm.femaleLockerPolicy },
    imported_students: [],
    selectedPlan: null,
  };
};

export default function RegisterLibrary() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [libraries, setLibraries] = useState([createInitialLibraryForm()]);
  const [staffAccountMode, setStaffAccountMode] = useState('separate');
  const [activeLibIndex, setActiveLibIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const studentCsvInputRefs = useRef({});

  // Admin account details form no longer needed in phase 1, but keep it for contact step temporarily if needed
  // Will be removed completely in Step 7 refactor
  const [form, setForm] = useState({
    adminPassword: '',
    adminPasswordConfirm: '',
  });

  // Pricing & Subscription state
  const [pricingPlans, setPricingPlans] = useState([]);
  const [isFetchingPlans, setIsFetchingPlans] = useState(false);
  
  // Promo and Checkout State
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');
  const [isVerifyingPromo, setIsVerifyingPromo] = useState(false);

  // Fetch Pricing Plans
  useEffect(() => {
    async function fetchPlans() {
      setIsFetchingPlans(true);
      try {
        const result = await getPricing({ allowFallback: false });
        const data = result?.data || result;
        if (data && data.length > 0) {
          setPricingPlans(data);
          // Default plan should be 1 month (30 days). Fallback to shortest duration.
          const defaultPlan =
            data.find((p) => Number(p.duration_days) === 30 || String(p.name || '').toLowerCase() === 'monthly') ||
            [...data].sort((a, b) => Number(a.duration_days || 0) - Number(b.duration_days || 0))[0];
          // Set the default plan for all libraries
          setLibraries(prev => prev.map(lib => ({ ...lib, selectedPlan: lib.selectedPlan || defaultPlan })));
        }
      } catch (err) {
        setPricingPlans([]);
        toast.error(err?.message || 'Failed to load live subscription plans');
      } finally {
        setIsFetchingPlans(false);
      }
    }
    fetchPlans();
  }, []);

  // Pincode lookup status
  const [pincodeStatus, setPincodeStatus] = useState('');

  // Shift & Combo local states mapped by libIdx
  const [shiftForms, setShiftForms] = useState({});
  const [showShiftForms, setShowShiftForms] = useState({});
  const [editingShiftIds, setEditingShiftIds] = useState({});
  const [comboForms, setComboForms] = useState({});
  const [showComboForms, setShowComboForms] = useState({});

// ComboPriceInput: A small local component to prevent massive React state lag (dropped keystrokes)
// by holding the input value locally and dispatching onBlur or debounced change
const ComboPriceInput = ({ libIdx, comboId, monthKey, defaultValue, initialValue, onUpdate }) => {
  const [localValue, setLocalValue] = useState(initialValue);

  // Sync if external prop heavily changes, usually only on mount or clear
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  const handleBlur = () => {
    if (localValue !== initialValue) {
      onUpdate(libIdx, comboId, monthKey, localValue);
    }
  };

  return (
    <input
      type="number"
      min="0"
      className="form-input bg-white text-xs px-2 py-1.5 h-9"
      placeholder={
        defaultValue !== '' && defaultValue !== null && defaultValue !== undefined
          ? String(defaultValue)
          : 'optional'
      }
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
};

  const getShiftForm = (libIdx) => shiftForms[libIdx] || createEmptyShiftForm();
  const updateShiftForm = (libIdx, updater) => setShiftForms(prev => ({ ...prev, [libIdx]: typeof updater === 'function' ? updater(getShiftForm(libIdx)) : updater }));

  const getComboForm = (libIdx) => comboForms[libIdx] || { selectedShifts: [], combined_fee: '' };
  const updateComboForm = (libIdx, updater) => setComboForms(prev => ({ ...prev, [libIdx]: typeof updater === 'function' ? updater(getComboForm(libIdx)) : updater }));

  const isMultiLibrary = libraries.length > 1;

  const hasLockersAnywhere = libraries.some(lib => {
    const maleL = parseInt(lib.male_lockers) || 0;
    const femaleL = parseInt(lib.female_lockers) || 0;
    return (maleL + femaleL) > 0;
  });
  const totalSteps = 10; // Basic, Cap, Shifts, Lockers, Contact, Students, Student Review, Accounts, Plan, Review
  const stepLabels = [
    'Basic Info',
    'Capacity',
    'Shifts',
    'Locker',
    'Contact',
    'Students',
    'Students Review',
    'Accounts',
    'Plan Selection',
    'Review & Pay',
  ];

  // Determine actual step mapping
  const getActualStep = () => {
    // If there are no lockers, skip the locker step (step 4)
    if (!hasLockersAnywhere && step >= 4) {
      return step + 1;
    }
    return step;
  };

  const actualStep = getActualStep();

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const updateLibField = (libIdx, field, value) => {
    setLibraries((prev) => {
      return prev.map((lib, idx) => {
        if (idx !== libIdx) return lib;
        const nextLib = { ...lib, [field]: value };
        if (
          ['male_seats', 'female_seats', 'male_lockers', 'female_lockers', 'maleLockerPolicy', 'femaleLockerPolicy']
            .includes(field)
        ) {
          nextLib.imported_students = recalculateImportedStudentsForLibrary(
            nextLib,
            nextLib.imported_students || [],
          );
        }
        return nextLib;
      });
    });
    if (errors[`${libIdx}_${field}`]) setErrors((prev) => ({ ...prev, [`${libIdx}_${field}`]: '' }));
  };

  const clearCredentialErrors = (field) => {
    setErrors((prev) => {
      const next = { ...prev };
      libraries.forEach((_, idx) => {
        delete next[`${idx}_${field}`];
      });
      return next;
    });
  };

  const updateAdminField = (libIdx, field, value) => {
    if (!isMultiLibrary) {
      updateLibField(libIdx, field, value);
      return;
    }
    setLibraries((prev) => prev.map((lib) => ({ ...lib, [field]: value })));
    clearCredentialErrors(field);
  };

  const updateStaffField = (libIdx, field, value) => {
    if (!isMultiLibrary || staffAccountMode === 'separate') {
      updateLibField(libIdx, field, value);
      return;
    }
    setLibraries((prev) => prev.map((lib) => ({ ...lib, [field]: value })));
    clearCredentialErrors(field);
  };

  const setStaffEnabled = (libIdx, enabled) => {
    if (!isMultiLibrary || staffAccountMode === 'separate') {
      setLibraries((prev) =>
        prev.map((item, idx) =>
          idx === libIdx
            ? {
                ...item,
                staff_enabled: enabled,
                staff_email: enabled ? item.staff_email : '',
                staff_password: enabled ? item.staff_password : '',
              }
            : item,
        ),
      );
      clearCredentialErrors('staff_email');
      clearCredentialErrors('staff_password');
      return;
    }

    setLibraries((prev) =>
      prev.map((item, idx) => {
        const source = prev[0] || {};
        return {
          ...item,
          staff_enabled: enabled,
          staff_email: enabled
            ? (idx === 0 ? item.staff_email : source.staff_email) || ''
            : '',
          staff_password: enabled
            ? (idx === 0 ? item.staff_password : source.staff_password) || ''
            : '',
        };
      }),
    );
    clearCredentialErrors('staff_email');
    clearCredentialErrors('staff_password');
  };

  const updateSelectedPlan = (libIdx, plan) => {
    if (isMultiLibrary) {
      setLibraries((prev) => prev.map((lib) => ({ ...lib, selectedPlan: plan })));
      return;
    }
    updateLibField(libIdx, 'selectedPlan', plan);
  };

  useEffect(() => {
    if (libraries.length <= 1 && staffAccountMode !== 'separate') {
      setStaffAccountMode('separate');
    }
  }, [libraries.length, staffAccountMode]);

  useEffect(() => {
    if (libraries.length <= 1) return;
    setLibraries((prev) => {
      const source = prev[0];
      if (!source) return prev;
      let changed = false;
      const next = prev.map((lib, idx) => {
        if (idx === 0) return lib;
        if ((lib.admin_email || '') === (source.admin_email || '') && (lib.admin_password || '') === (source.admin_password || '')) {
          return lib;
        }
        changed = true;
        return {
          ...lib,
          admin_email: source.admin_email || '',
          admin_password: source.admin_password || '',
        };
      });
      return changed ? next : prev;
    });
  }, [libraries.length, libraries[0]?.admin_email, libraries[0]?.admin_password]);

  /* ─── Validation (checks ALL libraries) ─── */
  const validateStep1 = () => {
    const e = {};
    let valid = true;
    libraries.forEach((lib, i) => {
      if (!lib.name.trim()) { e[`${i}_name`] = 'Required'; valid = false; }
      if (!lib.address.trim()) { e[`${i}_address`] = 'Required'; valid = false; }
      if (!lib.city.trim()) { e[`${i}_city`] = 'Required'; valid = false; }
      if (!lib.state.trim()) { e[`${i}_state`] = 'Required'; valid = false; }
      if (!lib.pincode.trim()) { e[`${i}_pincode`] = 'Required'; valid = false; }
      else if (!/^\d{6}$/.test(lib.pincode)) { e[`${i}_pincode`] = '6 digits'; valid = false; }
    });
    setErrors(e);
    if (!valid) toast.error('Fill all fields for every library');
    return valid;
  };

  const validateStep2 = () => {
    const e = {};
    let valid = true;
    libraries.forEach((lib, i) => {
      const maleS = parseInt(lib.male_seats) || 0;
      const femaleS = parseInt(lib.female_seats) || 0;
      if (lib.male_seats === '' && lib.female_seats === '') {
        e[`${i}_male_seats`] = 'Required';
        e[`${i}_female_seats`] = 'Required';
        valid = false;
      } else if (maleS + femaleS < 1) {
        e[`${i}_male_seats`] = 'Total ≥ 1';
        valid = false;
      }
      
      const maleL = parseInt(lib.male_lockers) || 0;
      const femaleL = parseInt(lib.female_lockers) || 0;
      if (lib.male_lockers === '') { e[`${i}_male_lockers`] = 'Required'; valid = false; }
      else if (maleL < 0) { e[`${i}_male_lockers`] = '≥0'; valid = false; }
      
      if (lib.female_lockers === '') { e[`${i}_female_lockers`] = 'Required'; valid = false; }
      else if (femaleL < 0) { e[`${i}_female_lockers`] = '≥0'; valid = false; }

      if (lib.male_lockers !== '' && lib.female_lockers !== '') {
        const totalSeats = maleS + femaleS;
        const totalLockers = maleL + femaleL;

        if (totalLockers > totalSeats) {
          e[`${i}_male_lockers`] = 'Total lockers must be <= total seats';
          e[`${i}_female_lockers`] = 'Total lockers must be <= total seats';
          valid = false;
        } else if (maleS > 0 && femaleS > 0) {
          if (maleL > maleS) {
            e[`${i}_male_lockers`] = 'Male lockers must be <= male seats';
            valid = false;
          }
          if (femaleL > femaleS) {
            e[`${i}_female_lockers`] = 'Female lockers must be <= female seats';
            valid = false;
          }
        }
      }
    });
    setErrors(e);
    if (!valid) toast.error('Check capacity fields');
    return valid;
  };

  const validateStep3 = () => {
    for (let i = 0; i < libraries.length; i++) {
      if (libraries[i].shifts.length === 0) {
        toast.error(`Add at least one shift for ${libraries[i].name || `Library ${i + 1}`}`);
        setActiveLibIndex(i);
        return false;
      }
    }
    return true;
  };

  const validateStep4 = () => {
    const e = {};
    let valid = true;
    for (let i = 0; i < libraries.length; i++) {
      const lib = libraries[i];
      const ml = parseInt(lib.male_lockers) || 0;
      const fl = parseInt(lib.female_lockers) || 0;
      
      if (ml > 0) {
        if (lib.maleLockerPolicy.monthly_fee === '' || parseFloat(lib.maleLockerPolicy.monthly_fee) < 0) {
          e[`${i}_male_locker_fee`] = 'Required';
          valid = false;
        }
      }
      if (fl > 0) {
        if (lib.femaleLockerPolicy.monthly_fee === '' || parseFloat(lib.femaleLockerPolicy.monthly_fee) < 0) {
          e[`${i}_female_locker_fee`] = 'Required';
          valid = false;
        }
      }
    }
    setErrors(e);
    if (!valid) toast.error('Enter a valid monthly fee for locker policies');
    return valid;
  };

  const validateStep5 = () => {
    const e = {};
    let valid = true;
    const lib = libraries[0];
    
    if (!lib.contact_phone.trim()) { e['0_contact_phone'] = 'Required'; valid = false; }
    else if (!/^\d{10}$/.test(lib.contact_phone.trim())) { e['0_contact_phone'] = '10 digits'; valid = false; }
    
    if (!lib.contact_email.trim()) { e['0_contact_email'] = 'Required'; valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lib.contact_email.trim())) { e['0_contact_email'] = 'Invalid'; valid = false; }
    
    setErrors(e);
    if (!valid) toast.error('Please fill in valid contact details');
    return valid;
  };

  const validateStep6 = () => {
    for (let libIdx = 0; libIdx < libraries.length; libIdx += 1) {
      const lib = libraries[libIdx];
      const students = lib.imported_students || [];
      for (let sIdx = 0; sIdx < students.length; sIdx += 1) {
        const student = students[sIdx];
        const rowLabel = `Student #${sIdx + 1} in ${lib.name || `Library ${libIdx + 1}`}`;
        if (!student.name?.trim()) {
          toast.error(`${rowLabel}: Name is required`);
          return false;
        }
        if (!/^\d{10}$/.test(String(student.phone || '').trim())) {
          toast.error(`${rowLabel}: Phone must be 10 digits`);
          return false;
        }
        if (!student.shift_id) {
          toast.error(`${rowLabel}: Select a shift`);
          return false;
        }
        if (!student.seat_number) {
          toast.error(`${rowLabel}: No seat available for selected shift/gender`);
          return false;
        }
        if (!student.admission_date || !student.end_date) {
          toast.error(`${rowLabel}: Admission and end date are required`);
          return false;
        }
      }
    }
    return true;
  };

  const validateStep7 = () => {
    return true;
  };

  const validateStep8 = () => {
    const e = {};
    let valid = true;
    const ownerEmail = libraries[0]?.contact_email?.trim() || '';

    const adminEmail = (libraries[0]?.admin_email || ownerEmail || '').trim();
    if (!adminEmail) {
      e['0_admin_email'] = 'Required';
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      e['0_admin_email'] = 'Invalid email';
      valid = false;
    }

    if (!libraries[0]?.admin_password?.trim()) {
      e['0_admin_password'] = 'Required';
      valid = false;
    } else if (libraries[0].admin_password.trim().length < 6) {
      e['0_admin_password'] = 'Minimum 6 characters';
      valid = false;
    }

    const validateStaffForLibrary = (lib, i) => {
      if (!lib.staff_enabled) return;

      const staffEmail = (lib.staff_email || '').trim();
      if (!staffEmail) {
        e[`${i}_staff_email`] = 'Required';
        valid = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffEmail)) {
        e[`${i}_staff_email`] = 'Invalid email';
        valid = false;
      }

      if (!lib.staff_password?.trim()) {
        e[`${i}_staff_password`] = 'Required';
        valid = false;
      } else if (lib.staff_password.trim().length < 6) {
        e[`${i}_staff_password`] = 'Minimum 6 characters';
        valid = false;
      }
    };

    if (isMultiLibrary && staffAccountMode === 'shared') {
      validateStaffForLibrary(libraries[0], 0);
    } else {
      libraries.forEach((lib, i) => validateStaffForLibrary(lib, i));
    }

    setErrors(e);
    if (!valid) toast.error('Please complete admin/staff credentials');
    return valid;
  };

  const validateStep9 = () => {
    let valid = true;
    if (isMultiLibrary) {
      valid = Boolean(libraries[0]?.selectedPlan);
    } else {
      libraries.forEach((lib) => {
        if (!lib.selectedPlan) valid = false;
      });
    }

    if (!valid) {
      toast.error(
        isMultiLibrary
          ? 'Please select one shared plan for all libraries.'
          : 'Please select a plan for every library to continue.',
      );
    }
    return valid;
  };

  const nextStep = () => {
    let valid = true;
    if (actualStep === 1) valid = validateStep1();
    else if (actualStep === 2) valid = validateStep2();
    else if (actualStep === 3) valid = validateStep3();
    else if (actualStep === 4) valid = validateStep4(); // Locker
    else if (actualStep === 5) valid = validateStep5(); // Contact
    else if (actualStep === 6) valid = validateStep6(); // Students
    else if (actualStep === 7) valid = validateStep7(); // Students summary
    else if (actualStep === 8) valid = validateStep8(); // Accounts
    else if (actualStep === 9) valid = validateStep9(); // Plan
    
    // Auto-generate combos for all libraries before moving past Step 3
    if (valid && actualStep === 3) {
      libraries.forEach((_, i) => updateAutoCombos(i));
    }
    
    if (valid) setStep((s) => s + 1);
  };

  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  /* ─── Shift helpers ─── */
  const calcDuration = (start, end) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return Math.round((diff / 60) * 10) / 10;
  };

  const addShift = (libIdx) => {
    const sForm = getShiftForm(libIdx);
    if (!sForm.label || !sForm.label.trim()) {
      sForm.label = 'Morning'; // Fallback to default if somehow empty in state
    }
    if (!sForm.start_time || !sForm.end_time) {
      toast.error('Please select start and end times');
      return;
    }
    const monthOneRaw = sForm.fee_plans?.['1'];
    const monthOneFee = monthOneRaw === '' ? NaN : Number(monthOneRaw);
    if (Number.isNaN(monthOneFee) || monthOneFee < 0) {
      toast.error('1 month fee is required');
      return;
    }
    const parsedFeePlans = { '1': monthOneFee };
    for (const month of FEE_PLAN_MONTHS) {
      const key = String(month);
      if (month === 1) {
        continue;
      }
      const raw = sForm.fee_plans?.[key];

      if (raw === '' || raw === undefined || raw === null) {
        continue;
      }

      const numericFee = Number(raw);
      if (Number.isNaN(numericFee) || numericFee < 0) {
        toast.error(`Invalid fee for ${month} month`);
        return;
      }
      parsedFeePlans[key] = numericFee;
    }

    // Overlap logic
    const newStart = parseInt(sForm.start_time.split(':')[0]) * 60 + parseInt(sForm.start_time.split(':')[1]);
    let newEnd = parseInt(sForm.end_time.split(':')[0]) * 60 + parseInt(sForm.end_time.split(':')[1]);
    if (newEnd <= newStart) newEnd += 24 * 60; // Crosses midnight

    const existing = libraries[libIdx].shifts;
    const editingId = editingShiftIds[libIdx];

    for (const es of existing) {
      if (editingId && es.id === editingId) continue; // Skip overlap check with itself while editing

      const eStart = parseInt(es.start_time.split(':')[0]) * 60 + parseInt(es.start_time.split(':')[1]);
      let eEnd = parseInt(es.end_time.split(':')[0]) * 60 + parseInt(es.end_time.split(':')[1]);
      if (eEnd <= eStart) eEnd += 24 * 60;

      if (Math.max(newStart, eStart) < Math.min(newEnd, eEnd)) {
        toast.error(`Time overlaps with existing shift: ${es.label}`);
        return;
      }
    }

    const duration = calcDuration(sForm.start_time, sForm.end_time);
    
    setLibraries((prev) => {
      const copy = [...prev];
      let nextLibShifts = [...copy[libIdx].shifts];
      
      if (editingId) {
        // Update existing
        nextLibShifts = nextLibShifts.map((s) => 
          s.id === editingId ? { ...s, label: sForm.label.trim(), start_time: sForm.start_time, end_time: sForm.end_time, duration_hours: duration, fee_plans: parsedFeePlans, monthly_fee: Number(parsedFeePlans['1']) } : s
        );
      } else {
        // Add new
        const newShift = {
          id: Date.now().toString(),
          label: sForm.label.trim(),
          start_time: sForm.start_time,
          end_time: sForm.end_time,
          duration_hours: duration,
          monthly_fee: Number(parsedFeePlans['1']),
          fee_plans: parsedFeePlans,
          is_base: true
        };
        nextLibShifts.push(newShift);
      }

      const nextLib = { ...copy[libIdx], shifts: nextLibShifts };
      nextLib.imported_students = recalculateImportedStudentsForLibrary(nextLib, nextLib.imported_students || []);
      copy[libIdx] = nextLib;
      return copy;
    });

    updateShiftForm(libIdx, createEmptyShiftForm());
    setShowShiftForms((prev) => ({ ...prev, [libIdx]: false }));
    setEditingShiftIds((prev) => ({ ...prev, [libIdx]: null }));
    setTimeout(() => updateAutoCombos(libIdx), 50);
  };

  const handleEditShift = (libIdx, shift) => {
    updateShiftForm(libIdx, {
      label: shift.label,
      start_time: shift.start_time,
      end_time: shift.end_time,
      duration_hours: shift.duration_hours,
      fee_plans: normalizeFeePlans(shift.fee_plans || {})
    });
    setEditingShiftIds((prev) => ({ ...prev, [libIdx]: shift.id }));
    setShowShiftForms((prev) => ({ ...prev, [libIdx]: true }));
  };

  const deleteShift = (libIdx, id) => {
    setLibraries((prev) => {
      const copy = [...prev];
      const nextLib = {
        ...copy[libIdx],
        shifts: copy[libIdx].shifts.filter((s) => s.id !== id),
        combinedPricing: copy[libIdx].combinedPricing.filter((c) => !c.shift_ids.includes(id)),
      };
      nextLib.imported_students = recalculateImportedStudentsForLibrary(
        nextLib,
        nextLib.imported_students || [],
      );
      copy[libIdx] = nextLib;
      return copy;
    });
    setTimeout(() => updateAutoCombos(libIdx), 50);
  };

  /* ─── Combined pricing helpers ─── */
  const updateAutoCombos = (libIdx) => {
    setLibraries((prev) => {
      const copy = [...prev];
      const lib = copy[libIdx];
      const shifts = [...lib.shifts].sort((a, b) => {
        const at = parseInt(a.start_time.split(':')[0]) * 60 + parseInt(a.start_time.split(':')[1]);
        const bt = parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]);
        return at - bt;
      });

      const newCombos = [];
      const existingCombos = lib.combinedPricing || [];

      // Generate all consecutive subgroups of length >= 2
      for (let len = 2; len <= shifts.length; len++) {
        for (let i = 0; i <= shifts.length - len; i++) {
          const slice = shifts.slice(i, i + len);
          
          let consecutive = true;
          for (let k = 1; k < slice.length; k++) {
            if (slice[k-1].end_time !== slice[k].start_time) {
              consecutive = false;
              break;
            }
          }

          if (consecutive) {
            const shiftIds = slice.map(s => s.id);
            const defaultFeePlans = Object.fromEntries(
              FEE_PLAN_MONTHS.map((month) => {
                const monthValues = slice.map((shift) => getShiftPlanAmount(shift, month));
                const allAvailable = monthValues.every(
                  (value) => value !== null && value !== undefined && !Number.isNaN(Number(value)),
                );
                if (!allAvailable) return [String(month), ''];
                return [String(month), monthValues.reduce((sum, value) => sum + Number(value), 0)];
              }),
            );
            const defaultFee = Number(defaultFeePlans['1']) || 0;
            const label = slice.map(s => s.label).join(' + ');

            const existing = existingCombos.find(c => c.shift_ids.length === shiftIds.length && c.shift_ids.every((id, idx) => id === shiftIds[idx]));
            const existingCustomPlans = normalizeFeePlans(existing?.custom_fee_plans || {});
            if (
              existing &&
              (existingCustomPlans['1'] === '' || existingCustomPlans['1'] === null) &&
              existing.custom_fee !== '' &&
              existing.custom_fee !== null &&
              existing.custom_fee !== undefined
            ) {
              existingCustomPlans['1'] = String(existing.custom_fee);
            }
            if (
              existing &&
              (existingCustomPlans['3'] === '' || existingCustomPlans['3'] === null || existingCustomPlans['3'] === undefined)
            ) {
              const defaultMonthThree = defaultFeePlans['3'];
              if (defaultMonthThree !== '' && defaultMonthThree !== null && defaultMonthThree !== undefined) {
                existingCustomPlans['3'] = String(defaultMonthThree);
              }
            }

            const seededCustomPlans = createEmptyFeePlans();
            seededCustomPlans['1'] = defaultFeePlans['1'] === '' ? '' : String(defaultFeePlans['1']);
            seededCustomPlans['3'] = defaultFeePlans['3'] === '' ? '' : String(defaultFeePlans['3']);
            
            newCombos.push({
              id: existing ? existing.id : `combo-${Date.now()}-${Math.random().toString(36).substring(2,9)}`,
              shift_ids: shiftIds,
              label: label,
              default_fee: defaultFee,
              default_fee_plans: defaultFeePlans,
              custom_fee: existing ? existing.custom_fee : seededCustomPlans['1'],
              custom_fee_plans: existing ? existingCustomPlans : seededCustomPlans,
              is_offered: existing ? existing.is_offered : true,
              start_time: slice[0].start_time,
              end_time: slice[slice.length - 1].end_time,
              duration_hours: slice.reduce((sum, s) => sum + s.duration_hours, 0)
            });
          }
        }
      }

      const nextLib = { ...lib, combinedPricing: newCombos };
      nextLib.imported_students = recalculateImportedStudentsForLibrary(
        nextLib,
        nextLib.imported_students || [],
      );
      copy[libIdx] = nextLib;
      return copy;
    });
  };

  const toggleComboOffered = (libIdx, comboId) => {
    setLibraries((prev) =>
      prev.map((lib, idx) => {
        if (idx !== libIdx) return lib;
        const nextCombinedPricing = (lib.combinedPricing || []).map((combo) => {
          if (combo.id !== comboId) return combo;
          const nextIsOffered = !Boolean(combo.is_offered);
          const nextCustomPlans = normalizeFeePlans(combo.custom_fee_plans || {});
          const defaultMonthOne = combo.default_fee_plans?.['1'] ?? combo.default_fee ?? '';
          const shouldSeedCustomFee =
            nextIsOffered &&
            (nextCustomPlans['1'] === '' ||
              nextCustomPlans['1'] === null ||
              nextCustomPlans['1'] === undefined);
          if (shouldSeedCustomFee) {
            nextCustomPlans['1'] = String(defaultMonthOne);
          }
          return {
            ...combo,
            is_offered: nextIsOffered,
            custom_fee_plans: nextCustomPlans,
            custom_fee: nextCustomPlans['1'] ?? combo.custom_fee,
          };
        });
        const nextLib = {
          ...lib,
          combinedPricing: nextCombinedPricing,
        };
        return {
          ...nextLib,
          imported_students: recalculateImportedStudentsForLibrary(
            nextLib,
            nextLib.imported_students || [],
          ),
        };
      }),
    );
  };

  const updateComboCustomFee = (libIdx, comboId, month, fee) => {
    setLibraries((prev) =>
      prev.map((lib, idx) =>
        idx === libIdx
          ? (() => {
              const monthKey = String(month);
              const nextCombinedPricing = (lib.combinedPricing || []).map((combo) => {
                if (combo.id !== comboId) return combo;
                const nextPlans = {
                  ...normalizeFeePlans(combo.custom_fee_plans || {}),
                  [monthKey]: fee,
                };
                return {
                  ...combo,
                  custom_fee_plans: nextPlans,
                  custom_fee: monthKey === '1' ? fee : combo.custom_fee,
                };
              });
              const nextLib = { ...lib, combinedPricing: nextCombinedPricing };
              return {
                ...nextLib,
                imported_students: recalculateImportedStudentsForLibrary(
                  nextLib,
                  nextLib.imported_students || [],
                ),
              };
            })()
          : lib,
      ),
    );
  };

  /* ─── Student Import helpers ─── */
  const addStudent = (libIdx) => {
    setLibraries((prev) => {
      return prev.map((lib, idx) => {
        if (idx !== libIdx) return lib;
        const nextStudents = recalculateImportedStudentsForLibrary(lib, [
          ...(lib.imported_students || []),
          createStudentRow(),
        ]);
        return { ...lib, imported_students: nextStudents };
      });
    });
  };

  const removeStudent = (libIdx, sIdx) => {
    setLibraries((prev) => {
      return prev.map((lib, idx) => {
        if (idx !== libIdx) return lib;
        const filtered = (lib.imported_students || []).filter((_, i) => i !== sIdx);
        const nextStudents = recalculateImportedStudentsForLibrary(lib, filtered);
        return { ...lib, imported_students: nextStudents };
      });
    });
  };

  const updateStudent = (libIdx, sIdx, field, value) => {
    setLibraries((prev) => {
      return prev.map((lib, idx) => {
        if (idx !== libIdx) return lib;
        const updatedRows = (lib.imported_students || []).map((student, i) => (
          i === sIdx ? { ...student, [field]: value } : student
        ));
        const nextStudents = recalculateImportedStudentsForLibrary(lib, updatedRows);
        return { ...lib, imported_students: nextStudents };
      });
    });
  };

  const downloadStudentCsvTemplate = (libIdx) => {
    const lib = libraries[libIdx];

    const shiftOptions = [
      ...(lib?.shifts || []).map((shift) => ({
        id: shift.id,
        label: shift.label,
        duration_hours: Number(shift.duration_hours) || 0,
      })),
      ...((lib?.combinedPricing || [])
        .filter((combo) => combo.is_offered)
        .map((combo) => ({
          id: combo.id,
          label: combo.label,
          duration_hours: Number(combo.duration_hours) || 0,
        }))),
    ];

    const fallbackShifts = DEFAULT_SHIFT_BLUEPRINTS.map((shift) => ({
      label: shift.label,
      duration_hours: calcDurationHours(shift.start_time, shift.end_time),
    }));
    const templateShifts = shiftOptions.length > 0 ? shiftOptions : fallbackShifts;

    const getLockerSample = (gender, shiftMeta) => {
      const lockerPolicy = getLockerPolicyForStudent(lib, gender);
      const lockerPool = getLockerPoolForStudent(lib, gender);
      const isEligible =
        Boolean(lockerPolicy) &&
        lockerPool.length > 0 &&
        isLockerRuleEligible(lockerPolicy.eligible_shift_type, Number(shiftMeta?.duration_hours) || 0);

      return {
        has_locker: isEligible ? 'yes' : 'no',
        locker_no: isEligible ? lockerPool[0] || '' : '',
      };
    };

    const firstShift = templateShifts[0];
    const secondShift = templateShifts[1] || templateShifts[0];
    const thirdShift = templateShifts[2] || templateShifts[0];

    const maleLockerSample = getLockerSample('male', firstShift);
    const femaleLockerSample = getLockerSample('female', secondShift);

    const sampleRecords = [
      {
        name: 'Aman Kumar',
        father_name: 'Rakesh Kumar',
        phone: '9876543210',
        gender: 'male',
        address: 'House 11, Main Road, Patna',
        shift_label: firstShift.label,
        plan_duration: '1',
        admission_date: getTodayDateISO(),
        payment_status: 'paid',
        has_locker: maleLockerSample.has_locker,
        locker_no: maleLockerSample.locker_no,
      },
      {
        name: 'Priya Sharma',
        father_name: 'Mahesh Sharma',
        phone: '9876500011',
        gender: 'female',
        address: 'Flat 4B, Lake View, Ranchi',
        shift_label: secondShift.label,
        plan_duration: '3',
        admission_date: getTodayDateISO(),
        payment_status: 'pending',
        has_locker: femaleLockerSample.has_locker,
        locker_no: femaleLockerSample.locker_no,
      },
      {
        name: 'Rohit Verma',
        father_name: '',
        phone: '9876500022',
        gender: 'male',
        address: '',
        shift_label: thirdShift.label,
        plan_duration: '6',
        admission_date: getTodayDateISO(),
        payment_status: 'paid',
        has_locker: 'yes',
        locker_no: '',
      },
      {
        name: 'Naina Singh',
        father_name: '',
        phone: '9876500033',
        gender: 'female',
        address: 'Near Station Road, Lucknow',
        shift_label: secondShift.label,
        plan_duration: '',
        admission_date: '',
        payment_status: '',
        has_locker: 'no',
        locker_no: '',
      },
    ];

    const sampleRows = [
      STUDENT_CSV_HEADERS.join(','),
      ...sampleRecords.map((record) =>
        STUDENT_CSV_HEADERS.map((header) => toCsvCell(record[header])).join(','),
      ),
    ];

    const csvBlob = new Blob([sampleRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    const safeLibraryName = String(lib?.name || `library_${libIdx + 1}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `library_${libIdx + 1}`;
    link.download = `students-import-template-${safeLibraryName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);

    if (shiftOptions.length === 0) {
      toast('Template downloaded with default shift labels. Add shifts first for exact labels.');
    }
  };

  const handleStudentCsvUpload = async (libIdx, file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (rows.length < 2) {
        toast.error('CSV must contain a header and at least one student row');
        return;
      }

      const normalizedHeaders = rows[0].map(normalizeCsvHeader);
      const findHeaderIndex = (key) => {
        const aliases = CSV_HEADER_ALIASES[key] || [key];
        return normalizedHeaders.findIndex((header) => aliases.includes(header));
      };

      const requiredColumns = ['name', 'phone', 'gender', 'shift_label'];
      const missingColumns = requiredColumns.filter((column) => findHeaderIndex(column) === -1);
      if (missingColumns.length > 0) {
        toast.error(`Missing CSV columns: ${missingColumns.join(', ')}`);
        return;
      }

      const activeLibrary = libraries[libIdx];
      if (!activeLibrary) {
        toast.error('Library context not found for CSV import');
        return;
      }

      let importedCount = 0;
      let skippedCount = 0;
      const baseShiftOptions = (activeLibrary.shifts || []).map((shift, orderIndex) => ({
        id: shift.id,
        label: shift.label,
        start_time: shift.start_time,
        orderIndex,
      }));
      const offeredCombos = (activeLibrary.combinedPricing || [])
        .filter((combo) => combo.is_offered)
        .map((combo) => ({
          id: combo.id,
          label: combo.label,
          shift_ids: Array.isArray(combo.shift_ids) ? combo.shift_ids.filter(Boolean) : [],
        }));

      const shiftLookup = new Map();
      const baseShiftAliasLookup = new Map();
      const baseShiftIdSet = new Set(baseShiftOptions.map((shift) => shift.id));
      const baseShiftOrderLookup = new Map(
        baseShiftOptions.map((shift) => [shift.id, shift.orderIndex]),
      );
      const comboByShiftSetLookup = new Map(
        offeredCombos
          .filter((combo) => combo.shift_ids.length > 1)
          .map((combo) => [combo.shift_ids.slice().sort().join('|'), combo.id]),
      );

      const registerLookup = (key, value) => {
        if (!key || !value) return;
        if (!shiftLookup.has(key)) shiftLookup.set(key, value);
      };

      baseShiftOptions.forEach((shift) => {
        const labelKey = normalizeShiftLabelKey(shift.label);
        registerLookup(labelKey, shift.id);
        const labelAlias = toCanonicalShiftAlias(shift.label);
        if (labelAlias) {
          if (!baseShiftAliasLookup.has(labelAlias)) baseShiftAliasLookup.set(labelAlias, shift.id);
          registerLookup(labelAlias, shift.id);
        }

        const timeAlias = inferShiftAliasFromStartTime(shift.start_time);
        if (timeAlias && !baseShiftAliasLookup.has(timeAlias)) {
          baseShiftAliasLookup.set(timeAlias, shift.id);
          registerLookup(timeAlias, shift.id);
        }
      });

      offeredCombos.forEach((combo) => {
        registerLookup(normalizeShiftLabelKey(combo.label), combo.id);
      });

      const unmatchedShiftLabels = new Set();

      const resolveShiftIdByLabel = (label) => {
        const directKey = normalizeShiftLabelKey(label);
        if (!directKey) return '';
        if (shiftLookup.has(directKey)) return shiftLookup.get(directKey) || '';

        const parts = splitShiftLabelParts(label);
        if (parts.length === 0) return '';

        if (parts.length === 1) {
          const singlePartAlias = toCanonicalShiftAlias(parts[0]);
          return baseShiftAliasLookup.get(singlePartAlias) || '';
        }

        const resolvedBaseShiftIds = Array.from(
          new Set(
            parts
              .map((part) => {
                const partKey = normalizeShiftLabelKey(part);
                const directMatch = shiftLookup.get(partKey);
                if (directMatch && baseShiftIdSet.has(directMatch)) return directMatch;
                const partAlias = toCanonicalShiftAlias(part);
                return baseShiftAliasLookup.get(partAlias) || '';
              })
              .filter(Boolean),
          ),
        );

        if (resolvedBaseShiftIds.length !== parts.length) {
          return '';
        }

        const normalizedComboKey = resolvedBaseShiftIds
          .slice()
          .sort((a, b) => (baseShiftOrderLookup.get(a) ?? 0) - (baseShiftOrderLookup.get(b) ?? 0))
          .join('|');

        return comboByShiftSetLookup.get(normalizedComboKey) || '';
      };

      const newStudents = [];

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];

        const getCellValue = (key) => {
          const cellIndex = findHeaderIndex(key);
          if (cellIndex === -1) return '';
          return String(row[cellIndex] || '').trim();
        };

        const name = getCellValue('name');
        const phone = getCellValue('phone');
        const shiftLabel = getCellValue('shift_label');
        const shiftId = resolveShiftIdByLabel(shiftLabel);

        if (!name && !phone && !shiftLabel) {
          skippedCount += 1;
          continue;
        }

        if (!name || !phone || !shiftId) {
          if (name && phone && !shiftId && shiftLabel) {
            unmatchedShiftLabels.add(shiftLabel);
          }
          skippedCount += 1;
          continue;
        }

        const admissionDateRaw = getCellValue('admission_date');
        const parsedAdmissionDate = /^\d{4}-\d{2}-\d{2}$/.test(admissionDateRaw)
          ? admissionDateRaw
          : getTodayDateISO();
        const duration = normalizeDurationMonths(getCellValue('plan_duration'));

        newStudents.push(
          createStudentRow({
            name,
            father_name: getCellValue('father_name'),
            phone,
            gender: normalizeStudentGender(getCellValue('gender')),
            address: getCellValue('address'),
            shift_id: shiftId,
            plan_duration: String(duration),
            admission_date: parsedAdmissionDate,
            payment_status: normalizePaymentStatus(getCellValue('payment_status')),
            has_locker: parseCsvBoolean(getCellValue('has_locker')),
            locker_no: getCellValue('locker_no'),
          }),
        );
        importedCount += 1;
      }

      if (importedCount === 0) {
        if (unmatchedShiftLabels.size > 0) {
          const examples = Array.from(unmatchedShiftLabels).slice(0, 5).join(' | ');
          toast.error(`No valid rows. Unmatched shift_label: ${examples}`);
        }
        toast.error('No valid student rows found in CSV');
        return;
      }

      setLibraries((prev) =>
        prev.map((lib, idx) => {
          if (idx !== libIdx) return lib;
          const nextStudents = recalculateImportedStudentsForLibrary(lib, [
            ...(lib.imported_students || []),
            ...newStudents,
          ]);
          return { ...lib, imported_students: nextStudents };
        }),
      );

      if (skippedCount > 0) {
        toast.success(`Imported ${importedCount} students. Skipped ${skippedCount} invalid rows.`);
      } else {
        toast.success(`Imported ${importedCount} students successfully.`);
      }
    } catch (error) {
      toast.error('Failed to parse CSV file');
    } finally {
      const inputNode = studentCsvInputRefs.current[libIdx];
      if (inputNode) inputNode.value = '';
    }
  };

  /* ─── Promo helpers ─── */
  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setIsVerifyingPromo(true);
    setPromoError('');
    try {
      // Simulate API call for now
      await new Promise(r => setTimeout(r, 600));
      if (promoInput.toUpperCase() === 'WELCOME500') {
        setPromoDiscount(500);
        setPromoCode('WELCOME500');
        toast.success('Promo code applied successfully!');
      } else {
        setPromoError('Invalid or expired promo code');
      }
    } finally {
      setIsVerifyingPromo(false);
    }
  };

  const removePromo = () => {
    setPromoDiscount(0);
    setPromoCode('');
    setPromoInput('');
    setPromoError('');
  };

  /* ─── Submit ─── */
  const handlePay = async () => {
    if (!validateStep8() || !validateStep9()) return;
    if (!confirmed) {
      toast.error('Please confirm the details');
      return;
    }
    
    setIsSubmitting(true);
    setSubmitError('');
    setIsVerifying(false);
    let waitingForCheckoutResult = false;
    
    try {
      // Placeholder structure for processing before payment API Integration (Phase 3)
      const payload = {
        contact_phone: libraries[0].contact_phone.trim(),
        contact_email: libraries[0].contact_email.trim(),
        promo_code: promoDiscount > 0 ? promoCode : null,
        libraries: libraries.map(lib => {
          const mLockers = parseInt(lib.male_lockers) || 0;
          const fLockers = parseInt(lib.female_lockers) || 0;
          
          const locker_policies = [];
          if (mLockers > 0) locker_policies.push({ ...lib.maleLockerPolicy, gender: 'male', monthly_fee: parseFloat(lib.maleLockerPolicy.monthly_fee) || 0 });
          if (fLockers > 0) locker_policies.push({ ...lib.femaleLockerPolicy, gender: 'female', monthly_fee: parseFloat(lib.femaleLockerPolicy.monthly_fee) || 0 });
          
          const effectiveSelectedPlan = isMultiLibrary
            ? (libraries[0]?.selectedPlan || null)
            : (lib.selectedPlan || null);

          return {
            name: lib.name.trim(),
            address: lib.address.trim(),
            city: lib.city.trim(),
            state: lib.state.trim(),
            pincode: lib.pincode.trim(),
            
            male_seats: parseInt(lib.male_seats) || 0,
            female_seats: parseInt(lib.female_seats) || 0,
            male_lockers: mLockers,
            female_lockers: fLockers,
            
            // Keep local shift ids so verify-payment can map imported student shift_ids reliably.
            shifts: lib.shifts.map((s) => ({ ...s, is_base: true })),
            combined_pricing: lib.combinedPricing
              ? lib.combinedPricing
                  .filter((combo) => combo.is_offered)
                  .map(({ id, custom_fee_plans, default_fee_plans, ...combo }) => ({
                    ...combo,
                    custom_fee_plans: compactPlanPayload(custom_fee_plans || {}),
                    default_fee_plans: compactPlanPayload(default_fee_plans || {}),
                    custom_fee:
                      custom_fee_plans?.['1'] !== '' &&
                      custom_fee_plans?.['1'] !== null &&
                      custom_fee_plans?.['1'] !== undefined
                        ? Number(custom_fee_plans['1'])
                        : combo.custom_fee,
                    combined_fee:
                      custom_fee_plans?.['1'] !== '' &&
                      custom_fee_plans?.['1'] !== null &&
                      custom_fee_plans?.['1'] !== undefined
                        ? Number(custom_fee_plans['1'])
                        : combo.default_fee,
                  }))
              : [],
            locker_policies,
            
            imported_students: (lib.imported_students || []).map((student) => ({
              ...student,
              shift_ids: resolveStudentShiftIds(lib, student),
            })),
            admin_account: {
              email: (lib.admin_email || libraries[0].contact_email || '').trim(),
              password: lib.admin_password || '',
              role: 'library_admin',
            },
            staff_account: lib.staff_enabled
              ? {
                  email: (lib.staff_email || '').trim(),
                  password: lib.staff_password || '',
                  role: 'staff',
                  permissions: ['view_data', 'admission', 'collect_payment'],
                }
              : null,
            selected_plan_id: effectiveSelectedPlan?.id,
            duration_days: effectiveSelectedPlan?.duration_days,
            selected_plan_name: effectiveSelectedPlan?.name || null,
            selected_plan_label: effectiveSelectedPlan?.label || null,
          };
        }),
      };
      
      console.log('Final Payload prepared for the API:', payload);
      
      // 1. Register Libraries (Batch)
      const registerRes = await registerLibraryBatch(payload);
      const libraryIds = registerRes.library_ids;

      if (!libraryIds || libraryIds.length === 0) {
        throw new Error("No libraries returned from registration");
      }

      // Prepare plan selections for createPaymentOrder
      const planSelections = {};
      payload.libraries.forEach((lib, idx) => {
        const mappedLibraryId = libraryIds[idx];
        if (!mappedLibraryId) return;
        planSelections[mappedLibraryId] = {
          plan_id: lib.selected_plan_id ?? null,
          duration_days: Number(lib.duration_days) || null,
          name: lib.selected_plan_name || null,
          label: lib.selected_plan_label || null,
        };
      });

      // 2. Create Payment Order
      const orderRes = await createPaymentOrder(
        libraryIds,
        planSelections,
        promoDiscount > 0 ? promoCode : null
      );

      // 3. Razorpay Checkout
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderRes.amount,
        currency: orderRes.currency,
        name: "LibraryOS",
        description: "Library Registration Payment",
        order_id: orderRes.order_id,
        handler: async function (response) {
          try {
            setIsVerifying(true);
            // 4. Verify Payment upon successful razorpay checkout
            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              library_ids: libraryIds,
              libraries_payload: payload.libraries,
            };

            const verifyRes = await verifyPayment(verifyPayload);

            toast.success(`${libraries.length} ${libraries.length === 1 ? 'library' : 'libraries'} registered successfully!`);
            setIsSubmitting(false);
            
            navigate('/register/success', { 
              state: { credentials: verifyRes.credentials }
            });
          } catch (err) {
            console.error("Verification failed:", err);
            setSubmitError(err.message || 'Payment verification failed');
            toast.error(err.message || 'Payment verification failed');
            setIsSubmitting(false);
            setIsVerifying(false);
          }
        },
        prefill: {
          name: payload.libraries[0]?.name || "Library Admin",
          email: payload.contact_email,
          contact: payload.contact_phone,
        },
        theme: {
          color: "#0f172a", // Navy color matching brand
        },
        modal: {
          ondismiss: function() {
            setSubmitError('Payment cancelled by user');
            toast.error('Payment cancelled');
            setIsSubmitting(false);
            setIsVerifying(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response){
        console.error("Payment failed", response.error);
        setSubmitError(response.error.description || 'Payment processing failed');
        toast.error('Payment failed: ' + (response.error.description || 'Try again'));
        setIsSubmitting(false);
        setIsVerifying(false);
      });
      waitingForCheckoutResult = true;
      rzp.open();
      
      // Do NOT set isSubmitting(false) here, we wait for Razorpay UI callbacks
      return;
      
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || 'Something went wrong');
      toast.error(err.message || 'Registration failed');
    } finally {
      if (!waitingForCheckoutResult) {
        setIsSubmitting(false);
      }
    }
  };

  /* ─── Library tab helpers ─── */
  const addNewLibrary = () => {
    setLibraries((prev) => {
      const base = prev[0] || createInitialLibraryForm();
      const nextLibrary = {
        ...createInitialLibraryForm(),
        admin_email: base.admin_email || '',
        admin_password: base.admin_password || '',
        selectedPlan: base.selectedPlan || null,
      };

      if (staffAccountMode === 'shared') {
        nextLibrary.staff_enabled = Boolean(base.staff_enabled);
        nextLibrary.staff_email = base.staff_email || '';
        nextLibrary.staff_password = base.staff_password || '';
      }

      return [...prev, nextLibrary];
    });
    setActiveLibIndex(libraries.length);
    setPincodeStatus('');
    setStep(1); // Force back to step 1 to fill basic info
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeLibrary = (index) => {
    if (libraries.length <= 1) return;
    setLibraries((prev) => prev.filter((_, i) => i !== index));
    if (activeLibIndex >= index && activeLibIndex > 0) {
      setActiveLibIndex((prev) => prev - 1);
    }
  };

  const switchLibrary = (index) => {
    setActiveLibIndex(index);
    setPincodeStatus(libraries[index]?.city ? 'success' : '');
  };

  /* ─── Render helpers ─── */
  const renderLibInput = (libIdx, label, field, type = 'text', placeholder = '', extra = {}) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type={type}
        className={`form-input ${errors[`${libIdx}_${field}`] ? 'error' : ''}`}
        value={libraries[libIdx][field]}
        onChange={(e) => updateLibField(libIdx, field, e.target.value)}
        placeholder={placeholder}
        {...extra}
      />
      {errors[`${libIdx}_${field}`] && <div className="form-error">{errors[`${libIdx}_${field}`]}</div>}
    </div>
  );

  return (
    <div className="register-page">
      {isVerifying && (
        <div className="payment-verifying-overlay" role="status" aria-live="polite">
          <div className="payment-verifying-card">
            <span className="payment-verifying-spinner" />
            <h2>Processing payment...</h2>
            <p>
            Please wait while we set up your library and generate your credentials. Do not refresh or close this page.
            </p>
          </div>
        </div>
      )}
      <div className="register-topbar">
        <div className="container">
          <div className="register-topbar-inner">
            <Link to="/" className="nav-logo no-underline">
              <span className="material-symbols-rounded">local_library</span>
              <span>LibraryOS</span>
            </Link>
            <span className="text-sm font-medium text-muted">
              Step {actualStep} of {totalSteps}
            </span>
          </div>
        </div>
      </div>

      <div className="container register-shell">
        <aside className="register-sidebar">
          <div className="register-sidebar-card">
            <span className="public-eyebrow">Register library</span>
            <h1>Set up the branch exactly how it operates.</h1>
            <p>
              This form captures library basics, capacity, shift pricing, locker
              rules, and the final contact details needed for review.
            </p>

            <ul className="public-list" style={{ marginTop: '1rem' }}>
              <li>
                <span className="material-symbols-rounded icon-sm">check_circle</span>
                <span>Seats, shifts, and pricing stay in one submission</span>
              </li>
              <li>
                <span className="material-symbols-rounded icon-sm">check_circle</span>
                <span>Locker policy is included only if the branch has lockers</span>
              </li>
              <li>
                <span className="material-symbols-rounded icon-sm">check_circle</span>
                <span>Final review step summarizes the full branch setup</span>
              </li>
            </ul>
          </div>

          {/* Library Tabs in Sidebar */}
          {libraries.length > 1 && (
            <div className="register-sidebar-card">
              <span className="public-eyebrow">Your Libraries</span>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {libraries.map((lib, i) => (
                  <div
                    key={i}
                    className={`registered-lib-card ${i === activeLibIndex ? 'active' : ''}`}
                    onClick={() => switchLibrary(i)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="material-symbols-rounded" style={{ color: i === activeLibIndex ? 'var(--color-amber)' : 'var(--color-text-muted)', fontSize: '1.1rem', flexShrink: 0 }}>
                      {lib.name ? 'business' : 'add_business'}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '0.8rem', color: i === activeLibIndex ? 'var(--color-amber-dark)' : 'var(--color-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lib.name || `Library ${i + 1}`}
                      </strong>
                      {lib.city && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{lib.city}, {lib.state}</span>}
                    </div>
                    {libraries.length > 1 && (
                      <button
                        type="button"
                        className="shift-remove-btn"
                        style={{ padding: '0.15rem', minWidth: 'auto' }}
                        onClick={(e) => { e.stopPropagation(); removeLibrary(i); }}
                        title="Remove library"
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: '0.9rem' }}>close</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="register-stage">
          <StepIndicator currentStep={actualStep} totalSteps={totalSteps} labels={stepLabels} />

          <div className="card reveal visible register-card">
          {/* ─── Step 1: Basic Info ─── */}
          {actualStep === 1 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Library Basic Info
              </h2>
              <p className="text-sm mb-6 text-muted">
                Tell us about your library
              </p>
              
              <div className="flex flex-col gap-6">
                {libraries.map((lib, libIdx) => (
                  <div key={libIdx} className="p-5 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-light)', position: 'relative' }}>
                    {libraries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLibrary(libIdx)}
                        className="btn-icon text-danger"
                        style={{ position: 'absolute', top: '1rem', right: '1rem' }}
                        title="Remove library"
                      >
                        <span className="material-symbols-rounded">delete</span>
                      </button>
                    )}
                    <h3 className="font-bold text-lg mb-4 text-navy pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="material-symbols-rounded align-middle mr-2" style={{ color: 'var(--color-amber)' }}>business</span>
                      {lib.name || `Library ${libIdx + 1}`}
                    </h3>

                    {renderLibInput(libIdx, 'Library Name', 'name', 'text', 'e.g. Sunrise Study Library')}
                    <div className="form-group">
                      <label className="form-label">Full Address</label>
                      <textarea
                        className={`form-textarea ${errors[`${libIdx}_address`] ? 'error' : ''}`}
                        value={lib.address}
                        onChange={(e) => updateLibField(libIdx, 'address', e.target.value)}
                        placeholder="Street address, area, landmark"
                      />
                      {errors[`${libIdx}_address`] && <div className="form-error">{errors[`${libIdx}_address`]}</div>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* State Dropdown */}
                      <div className="form-group">
                        <label className="form-label">State</label>
                        <select
                          className={`form-input ${errors[`${libIdx}_state`] ? 'error' : ''}`}
                          value={lib.state}
                          onChange={(e) => updateLibField(libIdx, 'state', e.target.value)}
                        >
                          <option value="">Select State</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* PIN Code */}
                      <div className="form-group">
                        <label className="form-label">PIN Code</label>
                        <input
                          type="text"
                          className={`form-input ${errors[`${libIdx}_pincode`] ? 'error' : ''}`}
                          value={lib.pincode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                            updateLibField(libIdx, 'pincode', val);
                          }}
                          placeholder="6 digit PIN code"
                          maxLength={6}
                          inputMode="numeric"
                        />
                        {errors[`${libIdx}_pincode`] && (
                          <div className="form-error">{errors[`${libIdx}_pincode`]}</div>
                        )}
                      </div>

                      {/* City */}
                      <div className="form-group">
                        <label className="form-label">City</label>
                        <input
                          type="text"
                          className={`form-input ${errors[`${libIdx}_city`] ? 'error' : ''}`}
                          value={lib.city}
                          onChange={(e) => updateLibField(libIdx, 'city', e.target.value)}
                          placeholder="e.g. Mumbai"
                        />
                        {errors[`${libIdx}_city`] && <div className="form-error">{errors[`${libIdx}_city`]}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Step 2: Capacity ─── */}
          {actualStep === 2 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Capacity
              </h2>
              <p className="text-sm mb-6 text-muted">
                How big is your library?
              </p>
              
              <div className="flex flex-col gap-6">
                {libraries.map((lib, libIdx) => (
                  <div key={libIdx} className="p-5 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-light)' }}>
                    <h3 className="font-bold text-lg mb-4 text-navy pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="material-symbols-rounded align-middle mr-2" style={{ color: 'var(--color-amber)' }}>business</span>
                      {lib.name || `Library ${libIdx + 1}`}
                    </h3>
                    
                    <div className="grid sm:grid-cols-2 gap-8">
                      {/* Seats Section */}
                      <div className="p-4 rounded-xl bg-white border border-slate-200">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                          <h4 className="font-bold text-navy flex items-center gap-2">
                            <span className="material-symbols-rounded icon-sm text-amber">chair</span>
                            Seating Capacity
                          </h4>
                          <span className="text-sm font-bold text-main bg-main-lightest px-2 py-0.5 rounded-md">
                            Total: {(parseInt(lib.male_seats) || 0) + (parseInt(lib.female_seats) || 0)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {renderLibInput(libIdx, 'Male Seats', 'male_seats', 'number', 'e.g. 50', { min: 0 })}
                          {renderLibInput(libIdx, 'Female Seats', 'female_seats', 'number', 'e.g. 50', { min: 0 })}
                        </div>
                        <p className="text-xs text-muted mt-3 leading-relaxed">
                          <strong className="text-navy">No gender separation?</strong> Enter all seats under Male Seats and 0 under Female Seats. All seats will be available to any student.
                        </p>
                      </div>

                      {/* Lockers Section */}
                      <div className="p-4 rounded-xl bg-white border border-slate-200">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                          <h4 className="font-bold text-navy flex items-center gap-2">
                            <span className="material-symbols-rounded icon-sm text-amber">lock</span>
                            Locker Capacity
                          </h4>
                          <span className="text-sm font-bold text-main bg-main-lightest px-2 py-0.5 rounded-md">
                            Total: {(parseInt(lib.male_lockers) || 0) + (parseInt(lib.female_lockers) || 0)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {renderLibInput(libIdx, 'Male Lockers', 'male_lockers', 'number', 'Enter 0 if none', { min: 0 })}
                          {renderLibInput(libIdx, 'Female Lockers', 'female_lockers', 'number', 'Enter 0 if none', { min: 0 })}
                        </div>
                        {((parseInt(lib.male_lockers) || 0) + (parseInt(lib.female_lockers) || 0)) === 0 && (
                          <p className="text-xs text-amber-dark bg-amber-lightest p-2 rounded flex items-start gap-1 mt-3">
                            <span className="material-symbols-rounded icon-sm" style={{ marginTop: '0.1rem' }}>info</span>
                            Locker configuration step will be skipped since you have 0 total lockers.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {actualStep === 3 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Shifts
              </h2>
              <p className="text-sm mb-6 text-muted">
                Configure the shifts your library offers
              </p>

              <div className="flex flex-col gap-8">
                {libraries.map((lib, libIdx) => {
                  const shiftForm = getShiftForm(libIdx);
                  const comboForm = getComboForm(libIdx);
                  const showSF = showShiftForms[libIdx];
                  const showCF = showComboForms[libIdx];

                  return (
                    <div key={libIdx} className="p-5 rounded-xl shadow-sm" style={{ border: '1px solid var(--color-border)', background: '#fff' }}>
                      <h3 className="font-bold text-lg mb-4 text-navy pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span className="material-symbols-rounded align-middle mr-2" style={{ color: 'var(--color-amber)' }}>business</span>
                        {lib.name || `Library ${libIdx + 1}`}
                      </h3>

                      {/* Added shifts cards */}
                      {lib.shifts.length > 0 && (
                        <div className="shift-cards-grid mb-6">
                          {lib.shifts.map((s) => {
                            const configuredEntries = getConfiguredPlanEntries(s.fee_plans);
                            const fallbackMonthOne = getShiftPlanAmount(s, 1);
                            const planEntries =
                              configuredEntries.length > 0
                                ? configuredEntries
                                : fallbackMonthOne !== null
                                  ? [{ month: 1, amount: Number(fallbackMonthOne) }]
                                  : [];

                            return (
                            <div key={s.id} className="shift-card-item" style={{ cursor: 'pointer' }} onClick={() => handleEditShift(libIdx, s)}>
                              <div className="shift-card-header">
                                <div className="shift-card-title-row">
                                  <span className="material-symbols-rounded" style={{ color: 'var(--color-amber)', fontSize: '1.3rem' }}>light_mode</span>
                                  <h4 className="font-bold text-navy">{s.label}</h4>
                                </div>
                                <button className="btn-icon text-danger" onClick={(e) => { e.stopPropagation(); deleteShift(libIdx, s.id); }} title="Remove shift">
                                  <span className="material-symbols-rounded icon-sm">close</span>
                                </button>
                              </div>
                              <div className="shift-card-time">
                                <span className="material-symbols-rounded icon-sm" style={{ color: 'var(--color-text-muted)' }}>schedule</span>
                                <span>{formatTime12(s.start_time)} – {formatTime12(s.end_time)}</span>
                                <span className="shift-duration-badge">{s.duration_hours}h</span>
                              </div>
                              <div className="shift-card-plans flex gap-2">
                                {planEntries.length === 0 ? (
                                  <span className="shift-plan-tag bg-slate-50 text-slate-600 font-medium px-3 py-1 rounded-full text-sm">
                                    No pricing set
                                  </span>
                                ) : (
                                  planEntries.map((entry) => (
                                    <span
                                      key={`${s.id}-plan-${entry.month}`}
                                      className="shift-plan-tag bg-green-50 text-green-700 font-medium px-3 py-1 rounded-full text-sm"
                                    >
                                      {entry.month}M: ₹{entry.amount}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          )})}
                        </div>
                      )}

                      {/* Add shift form */}
                      {showSF ? (
                        <div className="shift-form-container">
                          <div className="form-group mb-0">
                            <label className="form-label flex items-center gap-2">
                              <span className="material-symbols-rounded icon-sm" style={{ color: 'var(--color-amber)' }}>label</span>
                              Shift Label
                            </label>
                            <select
                              className="form-select bg-white"
                              value={shiftForm.label}
                              onChange={(e) => updateShiftForm(libIdx, (p) => ({ ...p, label: e.target.value }))}
                            >
                              <option value="Morning">Morning</option>
                              <option value="Afternoon">Afternoon</option>
                              <option value="Evening">Evening</option>
                              <option value="Night">Night</option>
                            </select>
                          </div>

                          {/* Section 2: Time Picker */}
                          <div className="shift-time-section">
                            <div className="shift-time-header">
                              <span className="material-symbols-rounded" style={{ color: 'var(--color-amber)', fontSize: '1.4rem' }}>schedule</span>
                              <span className="font-semibold text-navy">Shift Timing</span>
                              {shiftForm.start_time && shiftForm.end_time && (
                                <span className="shift-duration-pill">
                                  <span className="material-symbols-rounded" style={{ fontSize: '0.9rem' }}>timelapse</span>
                                  {calcDuration(shiftForm.start_time, shiftForm.end_time)}h duration
                                </span>
                              )}
                            </div>
                            <div className="shift-time-pickers">
                              <div className="shift-time-box">
                                <span className="shift-time-label">Start Time</span>
                                <div className="shift-time-input-wrapper">
                                  <div className="shift-time-selects">
                                    <select
                                      className="shift-hour-select"
                                      value={shiftForm.start_time ? String((parseInt(shiftForm.start_time.split(':')[0]) % 12) || 12) : ''}
                                      onChange={(e) => {
                                        const h = parseInt(e.target.value);
                                        const currentPeriod = shiftForm.start_time && parseInt(shiftForm.start_time.split(':')[0]) >= 12 ? 'PM' : 'AM';
                                        const h24 = currentPeriod === 'PM' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
                                        updateShiftForm(libIdx, (p) => ({ ...p, start_time: `${String(h24).padStart(2, '0')}:00` }));
                                      }}
                                    >
                                      <option value="">Hr</option>
                                      {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => (
                                        <option key={h} value={h}>{h}</option>
                                      ))}
                                    </select>
                                    <div className="shift-ampm-toggle">
                                      {['AM', 'PM'].map(p => (
                                        <button
                                          key={p}
                                          type="button"
                                          className={`shift-ampm-btn ${shiftForm.start_time && ((p === 'PM' && parseInt(shiftForm.start_time.split(':')[0]) >= 12) || (p === 'AM' && parseInt(shiftForm.start_time.split(':')[0]) < 12)) ? 'active' : ''}`}
                                          onClick={() => {
                                            if (!shiftForm.start_time) return;
                                            const curH = parseInt(shiftForm.start_time.split(':')[0]);
                                            const h12 = curH % 12 || 12;
                                            const h24 = p === 'PM' ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
                                            updateShiftForm(libIdx, (prev) => ({ ...prev, start_time: `${String(h24).padStart(2, '0')}:00` }));
                                          }}
                                        >{p}</button>
                                      ))}
                                    </div>
                                  </div>
                                  {shiftForm.start_time && (
                                    <span className="shift-time-display">{formatTime12(shiftForm.start_time)}</span>
                                  )}
                                </div>
                              </div>
                              <div className="shift-time-divider">
                                <span className="material-symbols-rounded" style={{ color: 'var(--color-amber)' }}>arrow_forward</span>
                              </div>
                              <div className="shift-time-box">
                                <span className="shift-time-label">End Time</span>
                                <div className="shift-time-input-wrapper">
                                  <div className="shift-time-selects">
                                    <select
                                      className="shift-hour-select"
                                      value={shiftForm.end_time ? String((parseInt(shiftForm.end_time.split(':')[0]) % 12) || 12) : ''}
                                      onChange={(e) => {
                                        const h = parseInt(e.target.value);
                                        const currentPeriod = shiftForm.end_time && parseInt(shiftForm.end_time.split(':')[0]) >= 12 ? 'PM' : 'AM';
                                        const h24 = currentPeriod === 'PM' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
                                        updateShiftForm(libIdx, (p) => ({ ...p, end_time: `${String(h24).padStart(2, '0')}:00` }));
                                      }}
                                    >
                                      <option value="">Hr</option>
                                      {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => (
                                        <option key={h} value={h}>{h}</option>
                                      ))}
                                    </select>
                                    <div className="shift-ampm-toggle">
                                      {['AM', 'PM'].map(p => (
                                        <button
                                          key={p}
                                          type="button"
                                          className={`shift-ampm-btn ${shiftForm.end_time && ((p === 'PM' && parseInt(shiftForm.end_time.split(':')[0]) >= 12) || (p === 'AM' && parseInt(shiftForm.end_time.split(':')[0]) < 12)) ? 'active' : ''}`}
                                          onClick={() => {
                                            if (!shiftForm.end_time) return;
                                            const curH = parseInt(shiftForm.end_time.split(':')[0]);
                                            const h12 = curH % 12 || 12;
                                            const h24 = p === 'PM' ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
                                            updateShiftForm(libIdx, (prev) => ({ ...prev, end_time: `${String(h24).padStart(2, '0')}:00` }));
                                          }}
                                        >{p}</button>
                                      ))}
                                    </div>
                                  </div>
                                  {shiftForm.end_time && (
                                    <span className="shift-time-display">{formatTime12(shiftForm.end_time)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Section 3: Fee Plans */}
                          <div className="form-group mb-6">
                            <label className="form-label flex items-center gap-2">
                              <span className="material-symbols-rounded icon-sm text-green-600">payments</span>
                              Fee Plans (₹)
                            </label>
                            <p className="text-xs text-muted mb-3">
                              Only 1 month is required. Months 2-12 are optional and saved only if entered.
                            </p>
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                              {FEE_PLAN_MONTHS.map((month) => (
                                <div key={month} className="form-group mb-0">
                                  <label className="form-label text-[11px] leading-tight">
                                    {month}M{month === 1 ? ' *' : ''}
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    className="form-input bg-white text-xs px-2 py-1.5 h-9"
                                    placeholder={month === 1 ? '500' : 'optional'}
                                    value={shiftForm.fee_plans?.[String(month)] ?? ''}
                                    onChange={(e) =>
                                      updateShiftForm(libIdx, (p) => ({
                                        ...p,
                                        fee_plans: {
                                          ...normalizeFeePlans(p.fee_plans),
                                          [String(month)]: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-3" style={{ paddingTop: '0.5rem' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => addShift(libIdx)}>
                              <span className="material-symbols-rounded icon-sm">add_circle</span> Add Shift
                            </button>
                            <button className="btn btn-sm" style={{ color: 'var(--color-text-muted)' }} onClick={() => setShowShiftForms(prev => ({...prev, [libIdx]: false}))}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-secondary btn-sm mb-8" onClick={() => setShowShiftForms(prev => ({...prev, [libIdx]: true}))}>
                          <span className="material-symbols-rounded icon-sm">add</span> Add Base Shift
                        </button>
                      )}

                      {/* Section B: Combination Shifts */}
                      {lib.shifts.length >= 2 && (
                        <div className="mt-8 pt-6 rounded-xl bg-surface-dark" style={{ border: '1px solid var(--color-border)' }}>
                          <div className="px-6 mb-4">
                            <h4 className="font-bold text-navy flex items-center gap-2 text-lg">
                              <span className="material-symbols-rounded text-purple-600">auto_awesome</span>
                              Auto-Generated Combinations
                            </h4>
                            <p className="text-sm text-muted mt-1">
                              Consecutive shift combinations are generated automatically. Enable only the ones you offer and set pricing.
                            </p>
                          </div>

                          {lib.combinedPricing && lib.combinedPricing.length > 0 ? (
                            <div className="grid gap-3 px-4 pb-4">
                              {lib.combinedPricing.map((combo) => {
                                const isOffered = Boolean(combo.is_offered);
                                return (
                                <div key={combo.id} className={`p-4 rounded-xl transition-all ${isOffered ? 'bg-amber-50 shadow-sm' : 'bg-white opacity-70'}`} style={{ border: `1px solid ${isOffered ? 'var(--color-amber)' : 'var(--color-border)'}` }}>
                                  <div className="flex items-start justify-between mb-3">
                                    <div style={{ minWidth: 0, flex: 1, paddingRight: '0.75rem' }}>
                                      <h5 className="font-bold text-navy text-base" style={{ overflowWrap: 'anywhere' }}>{combo.label}</h5>
                                      <div className="text-sm text-muted flex items-center gap-1 mt-1">
                                        <span className="material-symbols-rounded icon-sm">schedule</span>
                                        {formatTime12(combo.start_time)} – {formatTime12(combo.end_time)}
                                        <span className="ml-2 font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">{combo.duration_hours}h</span>
                                      </div>
                                      <p className="text-xs text-slate-500 mt-2">
                                        Name and timing are auto-generated. Only set the pricing.
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      className={`btn btn-sm ${isOffered ? 'btn-primary' : 'btn-secondary'}`}
                                      onClick={() => toggleComboOffered(libIdx, combo.id)}
                                      aria-pressed={isOffered}
                                    >
                                      {isOffered ? 'Enabled' : 'Enable'}
                                    </button>
                                  </div>

                                  {isOffered && (
                                    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                                      <p className="text-xs text-slate-500 mb-2">
                                        Set offer pricing for durations from 1 to 12 months. Only filled values are saved.
                                      </p>
                                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                        {FEE_PLAN_MONTHS.map((month) => {
                                          const monthKey = String(month);
                                          const defaultValue = combo.default_fee_plans?.[monthKey];
                                          const customValue = combo.custom_fee_plans?.[monthKey] ?? '';
                                          return (
                                            <div key={`${combo.id}-${monthKey}`} className="form-group mb-0">
                                              <ComboPriceInput
                                                  libIdx={libIdx}
                                                  comboId={combo.id}
                                                  monthKey={monthKey}
                                                  defaultValue={defaultValue}
                                                  initialValue={customValue}
                                                  onUpdate={updateComboCustomFee}
                                                />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )})}
                            </div>
                          ) : (
                            <div className="p-6 m-6 bg-slate-50 rounded-xl text-center" style={{ border: '1px solid var(--color-border)' }}>
                              <span className="material-symbols-rounded text-slate-300 mb-2" style={{ fontSize: '2rem' }}>info</span>
                              <p className="text-muted text-sm border-0 m-0">No consecutive shifts available to combine.</p>
                              <p className="text-xs text-slate-400 mt-1">Add consecutive base shifts to see options here.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 4: Locker Policy ─── */}
          {actualStep === 4 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Locker Policy
              </h2>
              <p className="text-sm mb-6 text-muted">
                Configure locker access and rules
              </p>

              <div className="flex flex-col gap-6">
                {libraries.map((lib, libIdx) => {
                  const mLockers = parseInt(lib.male_lockers) || 0;
                  const fLockers = parseInt(lib.female_lockers) || 0;
                  
                  if (mLockers === 0 && fLockers === 0) return null;

                  return (
                    <div key={libIdx} className="flex flex-col gap-6">
                      <div className="p-5 rounded-xl text-navy bg-white shadow-sm" style={{ border: '1px solid var(--color-border)' }}>
                        <h3 className="font-bold text-lg pb-3 mb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <span className="material-symbols-rounded align-middle mr-2" style={{ color: 'var(--color-amber)' }}>business</span>
                          {lib.name || `Library ${libIdx + 1}`}
                        </h3>

                        {/* Male Lockers Policy */}
                        {mLockers > 0 && (
                          <div className={fLockers > 0 ? "mb-8 pb-8 border-b border-slate-100" : ""}>
                            <h4 className="font-bold text-md mb-3 flex items-center gap-2">
                              <span className="material-symbols-rounded icon-sm text-blue-600">male</span>
                              Male Lockers ({mLockers})
                            </h4>
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                              <div className="mb-4">
                                <label className="form-label text-sm text-navy font-bold">Who can take a male locker?</label>
                                <div className="flex flex-col gap-2 mt-2">
                                  {[
                                    { value: 'any', label: 'Any member (any shift)' },
                                    { value: '12h_plus', label: 'Only Full Day (12h+) members' },
                                    { value: '24h_only', label: 'Only 24-hour members' },
                                  ].map((opt) => (
                                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${lib.maleLockerPolicy.eligible_shift_type === opt.value ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'} border`}>
                                      <input
                                        type="radio"
                                        name={`mLockerEligibility_${libIdx}`}
                                        value={opt.value}
                                        checked={lib.maleLockerPolicy.eligible_shift_type === opt.value}
                                        onChange={(e) => updateLibField(libIdx, 'maleLockerPolicy', { ...lib.maleLockerPolicy, eligible_shift_type: e.target.value })}
                                        className="h-4 w-4 text-amber-500 focus:ring-amber-500"
                                      />
                                      <span className="text-sm font-medium text-navy">{opt.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="form-group mb-0">
                                  <label className="form-label text-sm font-bold text-navy">Monthly Fee (₹) <span className="text-danger">*</span></label>
                                  <input
                                    type="number"
                                    className={`form-input bg-white ${errors[`${libIdx}_male_locker_fee`] ? 'border-red-500' : ''}`}
                                    value={lib.maleLockerPolicy.monthly_fee}
                                    onChange={(e) => updateLibField(libIdx, 'maleLockerPolicy', { ...lib.maleLockerPolicy, monthly_fee: e.target.value })}
                                    placeholder="e.g. 300"
                                  />
                                  {errors[`${libIdx}_male_locker_fee`] && <span className="text-xs text-red-500 mt-1 block">{errors[`${libIdx}_male_locker_fee`]}</span>}
                                </div>
                                <div className="form-group mb-0">
                                  <label className="form-label text-sm font-bold text-navy">Description (optional)</label>
                                  <input
                                    type="text"
                                    className="form-input bg-white"
                                    value={lib.maleLockerPolicy.description}
                                    onChange={(e) => updateLibField(libIdx, 'maleLockerPolicy', { ...lib.maleLockerPolicy, description: e.target.value })}
                                    placeholder="Any locker rules"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Female Lockers Policy */}
                        {fLockers > 0 && (
                          <div>
                            <h4 className="font-bold text-md mb-3 flex items-center gap-2">
                              <span className="material-symbols-rounded icon-sm text-pink-600">female</span>
                              Female Lockers ({fLockers})
                            </h4>
                            <div className="p-4 rounded-xl bg-pink-50 border border-pink-100">
                              <div className="mb-4">
                                <label className="form-label text-sm text-navy font-bold">Who can take a female locker?</label>
                                <div className="flex flex-col gap-2 mt-2">
                                  {[
                                    { value: 'any', label: 'Any member (any shift)' },
                                    { value: '12h_plus', label: 'Only Full Day (12h+) members' },
                                    { value: '24h_only', label: 'Only 24-hour members' },
                                  ].map((opt) => (
                                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${lib.femaleLockerPolicy.eligible_shift_type === opt.value ? 'bg-pink-100 border-pink-300' : 'bg-white border-pink-200'} border`}>
                                      <input
                                        type="radio"
                                        name={`fLockerEligibility_${libIdx}`}
                                        value={opt.value}
                                        checked={lib.femaleLockerPolicy.eligible_shift_type === opt.value}
                                        onChange={(e) => updateLibField(libIdx, 'femaleLockerPolicy', { ...lib.femaleLockerPolicy, eligible_shift_type: e.target.value })}
                                        className="h-4 w-4 text-pink-500 focus:ring-pink-500"
                                      />
                                      <span className="text-sm font-medium text-navy">{opt.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="form-group mb-0">
                                  <label className="form-label text-sm font-bold text-navy">Monthly Fee (₹) <span className="text-danger">*</span></label>
                                  <input
                                    type="number"
                                    className={`form-input bg-white ${errors[`${libIdx}_female_locker_fee`] ? 'border-red-500' : ''}`}
                                    value={lib.femaleLockerPolicy.monthly_fee}
                                    onChange={(e) => updateLibField(libIdx, 'femaleLockerPolicy', { ...lib.femaleLockerPolicy, monthly_fee: e.target.value })}
                                    placeholder="e.g. 300"
                                  />
                                  {errors[`${libIdx}_female_locker_fee`] && <span className="text-xs text-red-500 mt-1 block">{errors[`${libIdx}_female_locker_fee`]}</span>}
                                </div>
                                <div className="form-group mb-0">
                                  <label className="form-label text-sm font-bold text-navy">Description (optional)</label>
                                  <input
                                    type="text"
                                    className="form-input bg-white"
                                    value={lib.femaleLockerPolicy.description}
                                    onChange={(e) => updateLibField(libIdx, 'femaleLockerPolicy', { ...lib.femaleLockerPolicy, description: e.target.value })}
                                    placeholder="Any locker rules"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 5: Contact ─── */}
          {actualStep === 5 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Owner Contact Details
              </h2>
              <p className="text-sm mb-6 text-muted">
                How should we reach you regarding your overarching account?
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 p-5 rounded-xl" style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-border)' }}>
                {renderLibInput(0, 'Contact Phone', 'contact_phone', 'tel', '10 digit number')}
                {renderLibInput(0, 'Contact Email', 'contact_email', 'email', 'you@example.com')}
              </div>
            </div>
          )}

          {/* ─── Step 6: Student Import ─── */}
          {actualStep === 6 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Import Existing Students
              </h2>
              <p className="text-sm mb-6 text-muted">
                Add your current members here so their attendance, seats, and payments are tracked immediately.
              </p>

              <div className="students-shell">
                {libraries.map((lib, libIdx) => {
                  const availableShiftLabels = [
                    ...(lib.shifts || []).map((shift) => shift.label),
                    ...((lib.combinedPricing || [])
                      .filter((combo) => combo.is_offered)
                      .map((combo) => combo.label)),
                  ];
                  const hasAnyLockerConfigured =
                    (Number(lib.male_lockers) || 0) + (Number(lib.female_lockers) || 0) > 0;

                  return (
                  <div key={libIdx} className="students-library-block">
                    <div className="students-library-header">
                      <h3 className="students-library-title">{lib.name || `Library ${libIdx + 1}`} Students</h3>
                      <div className="students-library-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => addStudent(libIdx)}
                        >
                          <span className="material-symbols-rounded icon-sm">person_add</span> Add Student
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => studentCsvInputRefs.current[libIdx]?.click()}
                        >
                          <span className="material-symbols-rounded icon-sm">upload_file</span> Upload CSV
                        </button>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          ref={(node) => {
                            if (node) studentCsvInputRefs.current[libIdx] = node;
                          }}
                          onChange={(e) => handleStudentCsvUpload(libIdx, e.target.files?.[0])}
                        />
                      </div>
                    </div>
                    <div className="students-csv-help">
                      <span className="students-csv-meta">
                        CSV headers: {STUDENT_CSV_HEADERS.join(', ')}. Valid shift_label values for this library: {availableShiftLabels.length > 0 ? availableShiftLabels.join(' | ') : 'Add shifts first'}.
                        {' '}
                        Locker values: has_locker accepts yes/no (or true/false). locker_no is optional (example: ML1, FL1). {hasAnyLockerConfigured ? 'Locker assignment still follows configured locker policy and eligibility rules.' : 'No lockers configured, so keep has_locker as no/blank.'}
                      </span>
                      <button
                        type="button"
                        className="students-template-btn"
                        onClick={() => downloadStudentCsvTemplate(libIdx)}
                      >
                        Download Template
                      </button>
                    </div>

                    {lib.imported_students.length === 0 ? (
                      <div
                        className="students-empty-state"
                        style={{ border: '1px dashed var(--color-border)', background: 'var(--color-surface-light)' }}
                      >
                        <span className="material-symbols-rounded icon-lg" style={{ color: 'var(--color-border-hover)' }}>group_off</span>
                        <p className="students-empty-title">No students added yet.</p>
                        <p className="students-empty-subtitle">Click the button above to import a student.</p>
                      </div>
                    ) : (
                      <div className="students-list">
                        {lib.imported_students.map((student, sIdx) => {
                          return (
                            <article key={`student-${libIdx}-${sIdx}`} className="student-entry-card">
                              <div className="student-entry-header">
                                <div className="student-entry-number">#{sIdx + 1}</div>
                                <button
                                  type="button"
                                  className="student-remove-btn"
                                  onClick={() => removeStudent(libIdx, sIdx)}
                                  title="Remove Student"
                                >
                                  <span className="material-symbols-rounded icon-sm">delete</span>
                                </button>
                              </div>

                              <div className="student-entry-grid">
                                <section className="student-entry-section">
                                  <h6 className="student-entry-section-title">Student Info</h6>
                                  <div className="student-entry-fields">
                                    <input
                                      type="text"
                                      className="form-input student-entry-input"
                                      value={student.name}
                                      onChange={(e) => updateStudent(libIdx, sIdx, 'name', e.target.value)}
                                      placeholder="Full Name *"
                                    />
                                    <input
                                      type="text"
                                      className="form-input student-entry-input"
                                      value={student.father_name}
                                      onChange={(e) => updateStudent(libIdx, sIdx, 'father_name', e.target.value)}
                                      placeholder="Father's Name *"
                                    />
                                    <input
                                      type="tel"
                                      className="form-input student-entry-input"
                                      value={student.phone}
                                      onChange={(e) => updateStudent(libIdx, sIdx, 'phone', e.target.value)}
                                      placeholder="Phone (10 digits) *"
                                    />
                                    <select
                                      className="form-select student-entry-input"
                                      value={student.gender}
                                      onChange={(e) => updateStudent(libIdx, sIdx, 'gender', e.target.value)}
                                    >
                                      <option value="male">Male</option>
                                      <option value="female">Female</option>
                                    </select>
                                  </div>
                                </section>

                                <section className="student-entry-section">
                                  <h6 className="student-entry-section-title">Address</h6>
                                  <textarea
                                    className="form-textarea student-entry-address"
                                    value={student.address}
                                    onChange={(e) => updateStudent(libIdx, sIdx, 'address', e.target.value)}
                                    placeholder="Full Address * (House, Street, Area, City, Pincode)"
                                  />
                                </section>

                                <section className="student-entry-section">
                                  <h6 className="student-entry-section-title">Shift and Seat</h6>
                                  <div className="student-entry-fields">
                                    <select
                                      className="form-select student-entry-input"
                                      value={student.shift_id}
                                      onChange={(e) => updateStudent(libIdx, sIdx, 'shift_id', e.target.value)}
                                    >
                                      <option value="">Select Shift</option>
                                      {lib.shifts.map(sh => <option key={sh.id} value={sh.id}>[Base] {sh.label}</option>)}
                                      {lib.combinedPricing?.filter(c => c.is_offered).map(c => <option key={c.id} value={c.id}>[Combo] {c.label}</option>)}
                                    </select>
                                    <div className="student-seat-readout">
                                      <strong className="student-seat-code">
                                        {student.seat_number || 'No seat available'}
                                      </strong>
                                      <span className="student-seat-meta">
                                        {student.shift_id
                                          ? `${student.seat_available_count || 0} seats left for this shift`
                                          : 'Select shift to auto-assign seat'}
                                      </span>
                                    </div>
                                  </div>
                                </section>

                                <section className="student-entry-section">
                                  <h6 className="student-entry-section-title">Locker</h6>
                                  <div className="student-entry-fields">
                                    <label className={`student-locker-toggle ${!student.locker_allowed ? 'disabled' : ''}`}>
                                      <input
                                        type="checkbox"
                                        className="form-checkbox"
                                        checked={student.has_locker}
                                        disabled={!student.locker_allowed}
                                        onChange={(e) => updateStudent(libIdx, sIdx, 'has_locker', e.target.checked)}
                                      />
                                      <span>Assign locker</span>
                                    </label>
                                    {student.locker_allowed && (
                                      <span className="student-locker-note">
                                        {student.locker_available_count || 0} lockers available
                                      </span>
                                    )}
                                    {!student.locker_allowed && (
                                      <span className="student-locker-note">
                                        {student.locker_disabled_reason || 'Locker not available for this student'}
                                      </span>
                                    )}
                                    {student.has_locker && (
                                      <>
                                        <select
                                          className="form-select student-entry-input"
                                          value={student.locker_no || ''}
                                          onChange={(e) => updateStudent(libIdx, sIdx, 'locker_no', e.target.value)}
                                        >
                                          <option value="">
                                            {(student.locker_options || []).length > 0 ? 'Select Locker' : 'No locker left'}
                                          </option>
                                          {(student.locker_options || []).map((lockerNo) => (
                                            <option key={lockerNo} value={lockerNo}>
                                              {lockerNo}
                                            </option>
                                          ))}
                                        </select>
                                        <span className="student-locker-note">
                                          {student.locker_no
                                            ? `${student.locker_available_count || 0} lockers left after assignment`
                                            : `${student.locker_available_count || 0} lockers available`}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </section>

                                <section className="student-entry-section">
                                  <h6 className="student-entry-section-title">Payment</h6>
                                  <div className="student-entry-fields">
                                    {(() => {
                                      const availablePlanMonths = getAvailablePlanMonthsForStudent(lib, student);
                                      return (
                                    <select
                                      className="form-select student-entry-input"
                                      value={student.plan_duration}
                                      onChange={(e) => updateStudent(libIdx, sIdx, 'plan_duration', e.target.value)}
                                    >
                                      {availablePlanMonths.map((month) => (
                                        <option key={month} value={String(month)}>
                                          {month} {month === 1 ? 'Month' : 'Months'}
                                        </option>
                                      ))}
                                    </select>
                                      );
                                    })()}
                                    <input
                                      type="date"
                                      className="form-input student-entry-input"
                                      value={student.admission_date || ''}
                                      onChange={(e) => updateStudent(libIdx, sIdx, 'admission_date', e.target.value)}
                                    />
                                    <input
                                      type="date"
                                      className="form-input student-entry-input student-entry-readonly"
                                      value={student.end_date || ''}
                                      readOnly
                                    />
                                    <div className="student-amount-field">
                                      <span className="student-amount-currency">₹</span>
                                      <input
                                        type="number"
                                        className="form-input student-entry-input student-amount-input student-entry-readonly"
                                        value={student.amount_paid}
                                        readOnly
                                      />
                                    </div>
                                    <span className="student-amount-hint">
                                      Shift fee is auto-calculated from selected shift and plan duration.
                                    </span>
                                    <select
                                      className="form-select student-entry-input"
                                      value={student.payment_status}
                                      onChange={(e) => updateStudent(libIdx, sIdx, 'payment_status', e.target.value)}
                                    >
                                      <option value="paid">Paid</option>
                                      <option value="pending">Pending</option>
                                    </select>
                                  </div>
                                </section>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 7: Students Review ─── */}
          {actualStep === 7 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Review Imported Students
              </h2>
              <p className="text-sm mb-6 text-muted">
                Confirm students, shifts, subscription period, and payment status before creating account credentials.
              </p>

              <div className="flex flex-col gap-6">
                {libraries.map((lib, libIdx) => {
                  const students = lib.imported_students || [];
                  const totalAmount = students.reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);
                  const pendingAmount = students.reduce(
                    (sum, s) => sum + (s.payment_status === 'pending' ? Number(s.amount_paid || 0) : 0),
                    0,
                  );
                  const collectedAmount = totalAmount - pendingAmount;
                  return (
                    <div key={libIdx} className="p-5 rounded-xl bg-white shadow-sm" style={{ border: '1px solid var(--color-border)' }}>
                      <h3 className="font-bold text-lg pb-3 mb-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span className="material-symbols-rounded text-amber-500">groups</span>
                        {lib.name || `Library ${libIdx + 1}`} Students
                      </h3>

                      {students.length === 0 ? (
                        <div className="p-5 rounded-xl text-center text-sm text-muted" style={{ background: 'var(--color-surface-dark)', border: '1px dashed var(--color-border)' }}>
                          No imported students for this library.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                              <tr>
                                <th className="p-3 font-semibold">Name</th>
                                <th className="p-3 font-semibold">Shift</th>
                                <th className="p-3 font-semibold">Subscription</th>
                                <th className="p-3 font-semibold">Status</th>
                                <th className="p-3 font-semibold text-right">Amount</th>
                                <th className="p-3 font-semibold text-right">Pending</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {students.map((student) => {
                                const amount = Number(student.amount_paid || 0);
                                const pending = student.payment_status === 'pending' ? amount : 0;
                                return (
                                  <tr key={student.id}>
                                    <td className="p-3">
                                      <div className="font-semibold text-navy">{student.name}</div>
                                      <div className="text-xs text-muted">{student.phone}</div>
                                    </td>
                                    <td className="p-3 text-navy">{getShiftLabelForStudent(lib, student.shift_id)}</td>
                                    <td className="p-3 text-navy">
                                      <div>{student.admission_date || '-'}</div>
                                      <div className="text-xs text-muted">to {student.end_date || '-'} ({student.plan_duration}M)</div>
                                    </td>
                                    <td className="p-3">
                                      <span
                                        className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold"
                                        style={{
                                          background: student.payment_status === 'paid' ? 'var(--color-success-light)' : 'var(--color-warning-light)',
                                          color: student.payment_status === 'paid' ? 'var(--color-success)' : '#92400E',
                                        }}
                                      >
                                        {student.payment_status === 'paid' ? 'Paid' : 'Pending'}
                                      </span>
                                    </td>
                                    <td className="p-3 text-right font-semibold text-navy">₹{amount.toLocaleString('en-IN')}</td>
                                    <td className="p-3 text-right font-semibold" style={{ color: pending > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                      ₹{pending.toLocaleString('en-IN')}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                        <div className="p-3 rounded-lg" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-dark)' }}>
                          <div className="text-xs text-muted">Total Students</div>
                          <div className="text-xl font-bold text-navy">{students.length}</div>
                        </div>
                        <div className="p-3 rounded-lg" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-dark)' }}>
                          <div className="text-xs text-muted">Collected</div>
                          <div className="text-xl font-bold" style={{ color: 'var(--color-success)' }}>₹{collectedAmount.toLocaleString('en-IN')}</div>
                        </div>
                        <div className="p-3 rounded-lg" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-dark)' }}>
                          <div className="text-xs text-muted">Pending</div>
                          <div className="text-xl font-bold" style={{ color: 'var(--color-danger)' }}>₹{pendingAmount.toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 8: Account Setup ─── */}
          {actualStep === 8 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Account Credentials Setup
              </h2>
              <p className="text-sm mb-6 text-muted">
                Owner email is prefilled for admin. For multiple libraries, owner login is shared across all libraries.
              </p>

              {isMultiLibrary && (
                <div className="p-4 rounded-xl mb-6" style={{ background: 'var(--color-surface-dark)', border: '1px solid var(--color-border)' }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted uppercase tracking-wide mb-2">Owner Account Mode</div>
                      <div className="font-semibold text-navy">Shared owner login for all libraries</div>
                      <div className="text-xs text-muted mt-1">
                        Admin email/password entered in first card will auto-apply to every library.
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-muted uppercase tracking-wide mb-2">Staff Account Mode</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`btn btn-sm ${staffAccountMode === 'shared' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => {
                            setStaffAccountMode('shared');
                            setLibraries((prev) => {
                              const source = prev[0] || {};
                              return prev.map((lib) => ({
                                ...lib,
                                staff_enabled: Boolean(source.staff_enabled),
                                staff_email: source.staff_email || '',
                                staff_password: source.staff_password || '',
                              }));
                            });
                            clearCredentialErrors('staff_email');
                            clearCredentialErrors('staff_password');
                          }}
                        >
                          Shared Staff
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${staffAccountMode === 'separate' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setStaffAccountMode('separate')}
                        >
                          Separate Staff
                        </button>
                      </div>
                      <div className="text-xs text-muted mt-2">
                        Shared mode uses one staff credential for all libraries. Separate mode keeps staff per library.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isMultiLibrary && (
                <div className="p-5 rounded-xl bg-white shadow-sm mb-6" style={{ border: '1px solid var(--color-border)' }}>
                  <h3 className="font-bold text-lg pb-3 mb-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span className="material-symbols-rounded text-amber-500">admin_panel_settings</span>
                    Shared Admin Account (All Libraries)
                  </h3>
                  <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-dark)', border: '1px solid var(--color-border)' }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="form-group mb-0">
                        <label className="form-label">Admin Email</label>
                        <input
                          type="email"
                          className={`form-input ${errors['0_admin_email'] ? 'error' : ''}`}
                          value={libraries[0]?.admin_email || libraries[0]?.contact_email || ''}
                          onChange={(e) => updateAdminField(0, 'admin_email', e.target.value)}
                          placeholder="admin@library.com"
                        />
                        {errors['0_admin_email'] && <div className="form-error">{errors['0_admin_email']}</div>}
                        <div className="text-xs text-muted mt-1">Prefilled from owner contact email and applied to all libraries.</div>
                      </div>
                      <div className="form-group mb-0">
                        <label className="form-label">Admin Password</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className={`form-input ${errors['0_admin_password'] ? 'error' : ''}`}
                            value={libraries[0]?.admin_password || ''}
                            onChange={(e) => updateAdminField(0, 'admin_password', e.target.value)}
                            placeholder="Minimum 6 characters"
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => updateAdminField(0, 'admin_password', generateTempPassword())}
                          >
                            Generate
                          </button>
                        </div>
                        {errors['0_admin_password'] && <div className="form-error">{errors['0_admin_password']}</div>}
                      </div>
                    </div>
                    <p className="text-xs text-muted mt-3">
                      This single owner/admin login will control all registered libraries in this submission.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-6">
                {libraries.map((lib, libIdx) => {
                  const ownerEmail = libraries[0]?.contact_email || '';
                  const adminEmailValue = lib.admin_email || ownerEmail;
                  const adminPasswordValue = lib.admin_password;
                  const isSharedStaffMode = isMultiLibrary && staffAccountMode === 'shared';
                  const staffEnabledValue = isSharedStaffMode
                    ? Boolean(libraries[0]?.staff_enabled)
                    : Boolean(lib.staff_enabled);
                  const staffEmailValue = isSharedStaffMode
                    ? (libraries[0]?.staff_email || '')
                    : (lib.staff_email || '');
                  const staffPasswordValue = isSharedStaffMode
                    ? (libraries[0]?.staff_password || '')
                    : (lib.staff_password || '');
                  const lockSharedStaffForThisCard = isSharedStaffMode && libIdx > 0;
                  return (
                    <div key={libIdx} className="p-5 rounded-xl bg-white shadow-sm" style={{ border: '1px solid var(--color-border)' }}>
                      <h3 className="font-bold text-lg pb-3 mb-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span className="material-symbols-rounded text-amber-500">admin_panel_settings</span>
                        {lib.name || `Library ${libIdx + 1}`}
                      </h3>

                      {!isMultiLibrary && (
                        <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--color-surface-dark)', border: '1px solid var(--color-border)' }}>
                          <h4 className="font-semibold text-navy mb-3">Library Admin Account</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-group mb-0">
                              <label className="form-label">Admin Email</label>
                              <input
                                type="email"
                                className={`form-input ${errors[`${libIdx}_admin_email`] ? 'error' : ''}`}
                                value={adminEmailValue}
                                onChange={(e) => updateAdminField(libIdx, 'admin_email', e.target.value)}
                                placeholder="admin@library.com"
                              />
                              {errors[`${libIdx}_admin_email`] && <div className="form-error">{errors[`${libIdx}_admin_email`]}</div>}
                              <div className="text-xs text-muted mt-1">Prefilled from owner contact email.</div>
                            </div>
                            <div className="form-group mb-0">
                              <label className="form-label">Admin Password</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  className={`form-input ${errors[`${libIdx}_admin_password`] ? 'error' : ''}`}
                                  value={adminPasswordValue}
                                  onChange={(e) => updateAdminField(libIdx, 'admin_password', e.target.value)}
                                  placeholder="Minimum 6 characters"
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => updateAdminField(libIdx, 'admin_password', generateTempPassword())}
                                >
                                  Generate
                                </button>
                              </div>
                              {errors[`${libIdx}_admin_password`] && <div className="form-error">{errors[`${libIdx}_admin_password`]}</div>}
                            </div>
                          </div>
                          <p className="text-xs text-muted mt-3">
                            Admin can fully manage this library with complete CRUD access.
                          </p>
                        </div>
                      )}

                      {isMultiLibrary && (
                        <div className="text-xs text-muted mb-4">
                          Admin login is shared from the top section.
                        </div>
                      )}

                      <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-dark)', border: '1px solid var(--color-border)' }}>
                        <label className="checkbox-label mb-3">
                          <input
                            type="checkbox"
                            className="form-checkbox"
                            checked={staffEnabledValue}
                            onChange={(e) => {
                              if (lockSharedStaffForThisCard) return;
                              setStaffEnabled(libIdx, e.target.checked);
                            }}
                            disabled={lockSharedStaffForThisCard}
                          />
                          <span>{isSharedStaffMode ? 'Add Shared Staff Account' : 'Add Staff Account'}</span>
                        </label>

                        {staffEnabledValue && !lockSharedStaffForThisCard && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="form-group mb-0">
                              <label className="form-label">Staff Email</label>
                              <input
                                type="email"
                                className={`form-input ${errors[`${libIdx}_staff_email`] ? 'error' : ''}`}
                                value={staffEmailValue}
                                onChange={(e) => updateStaffField(libIdx, 'staff_email', e.target.value)}
                                placeholder="staff@library.com"
                              />
                              {errors[`${libIdx}_staff_email`] && <div className="form-error">{errors[`${libIdx}_staff_email`]}</div>}
                            </div>
                            <div className="form-group mb-0">
                              <label className="form-label">Staff Password</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  className={`form-input ${errors[`${libIdx}_staff_password`] ? 'error' : ''}`}
                                  value={staffPasswordValue}
                                  onChange={(e) => updateStaffField(libIdx, 'staff_password', e.target.value)}
                                  placeholder="Minimum 6 characters"
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => updateStaffField(libIdx, 'staff_password', generateTempPassword())}
                                >
                                  Generate
                                </button>
                              </div>
                              {errors[`${libIdx}_staff_password`] && <div className="form-error">{errors[`${libIdx}_staff_password`]}</div>}
                            </div>
                          </div>
                        )}

                        {lockSharedStaffForThisCard && (
                          <div className="text-xs text-muted">
                            This library uses the shared staff credentials configured in the first library card.
                          </div>
                        )}

                        <p className="text-xs text-muted mt-3">
                          Staff can view data, admit students, and collect payments, but cannot delete data or change core library setup.
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 9: Plan Selection ─── */}
          {actualStep === 9 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Select Subscription Plan
              </h2>
              <p className="text-sm mb-6 text-muted">
                {isMultiLibrary
                  ? `Choose one shared plan for all ${libraries.length} libraries. Amount is calculated securely on backend as plan price x library count.`
                  : 'Choose a plan for your library to activate it on LibraryOS.'}
              </p>

              {isMultiLibrary && (
                <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--color-surface-dark)', border: '1px solid var(--color-border)' }}>
                  <div className="text-xs text-muted uppercase tracking-wide mb-2">Shared Plan Scope</div>
                  <div className="text-sm text-navy font-medium">
                    {libraries.map((lib, idx) => lib.name || `Library ${idx + 1}`).join(' + ')}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-6">
                {isMultiLibrary ? (
                  <div className="p-5 rounded-xl bg-white shadow-sm" style={{ border: '1px solid var(--color-border)' }}>
                    <h3 className="font-bold text-lg pb-3 mb-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="material-symbols-rounded text-amber-500">store</span>
                      Shared Plan (Applies To All Libraries)
                    </h3>

                    {isFetchingPlans ? (
                      <div className="p-8 text-center text-muted"><span className="loading-spinner"></span> Loading plans...</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pricingPlans.map((plan, planIdx) => {
                          const planIdentity = getPlanIdentity(plan);
                          const selectedPlanIdentity = getPlanIdentity(libraries[0]?.selectedPlan);
                          const isSelected = selectedPlanIdentity !== '' && selectedPlanIdentity === planIdentity;
                          const planKey =
                            planIdentity || `plan_${planIdx}_${plan.name || plan.label || plan.duration_days || 'x'}`;
                          return (
                            <label
                              key={planKey}
                              className={`relative p-5 rounded-xl cursor-pointer transition-all border-2 ${isSelected ? 'border-amber-500 bg-amber-50/30' : 'border-slate-200 hover:border-amber-300'}`}
                            >
                              <input
                                type="radio"
                                name="plan_shared"
                                value={planKey}
                                className="absolute right-4 top-4 h-5 w-5 text-amber-500 focus:ring-amber-500"
                                checked={isSelected}
                                onChange={() => updateSelectedPlan(0, plan)}
                              />
                              <div className="mb-3">
                                {plan.name === "3_month" && <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded mb-2 uppercase">Most Popular</span>}
                                <h4 className="text-xl font-bold text-navy mb-1">{plan.label}</h4>
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-black text-navy">₹{plan.base_price}</span>
                                  <span className="text-sm text-slate-500">/{plan.duration_days} days per library</span>
                                </div>
                              </div>
                              <ul className="space-y-2 text-sm text-slate-600">
                                <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-green-500">check_circle</span> Unlimited Shifts & Combos</li>
                                <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-green-500">check_circle</span> Locker Management</li>
                                <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-green-500">check_circle</span> Income & Expense Tracking</li>
                              </ul>
                            </label>
                          );
                        })}

                        <label className={`relative p-5 rounded-xl cursor-not-allowed border-2 border-slate-200 bg-slate-50 opacity-70`}>
                          <div className="absolute right-4 top-4">
                            <span className="material-symbols-rounded text-slate-400">lock</span>
                          </div>
                          <div className="mb-3">
                            <span className="inline-block px-2 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded mb-2">COMING SOON</span>
                            <h4 className="text-xl font-bold text-slate-500 mb-1">Premium + AI CCTV</h4>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-slate-400">TBD</span>
                            </div>
                          </div>
                          <ul className="space-y-2 text-sm text-slate-500">
                            <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-slate-400">check_circle</span> All Standard Features</li>
                            <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-slate-400">check_circle</span> Admin App Access</li>
                            <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-slate-400">check_circle</span> Student App with QR Check-in</li>
                            <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-slate-400">check_circle</span> AI CCTV Integration</li>
                          </ul>
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  libraries.map((lib, libIdx) => (
                    <div key={libIdx} className="p-5 rounded-xl bg-white shadow-sm" style={{ border: '1px solid var(--color-border)' }}>
                      <h3 className="font-bold text-lg pb-3 mb-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span className="material-symbols-rounded text-amber-500">store</span>
                        {lib.name || `Library ${libIdx + 1}`}
                      </h3>

                      {isFetchingPlans ? (
                        <div className="p-8 text-center text-muted"><span className="loading-spinner"></span> Loading plans...</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {pricingPlans.map((plan, planIdx) => {
                            const planIdentity = getPlanIdentity(plan);
                            const selectedPlanIdentity = getPlanIdentity(lib.selectedPlan);
                            const isSelected = selectedPlanIdentity !== '' && selectedPlanIdentity === planIdentity;
                            const planKey =
                              planIdentity || `plan_${planIdx}_${plan.name || plan.label || plan.duration_days || 'x'}`;
                            return (
                              <label
                                key={planKey}
                                className={`relative p-5 rounded-xl cursor-pointer transition-all border-2 ${isSelected ? 'border-amber-500 bg-amber-50/30' : 'border-slate-200 hover:border-amber-300'}`}
                              >
                                <input
                                  type="radio"
                                  name={`plan_${libIdx}`}
                                  value={planKey}
                                  className="absolute right-4 top-4 h-5 w-5 text-amber-500 focus:ring-amber-500"
                                  checked={isSelected}
                                  onChange={() => updateSelectedPlan(libIdx, plan)}
                                />
                                <div className="mb-3">
                                  {plan.name === "3_month" && <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded mb-2 uppercase">Most Popular</span>}
                                  <h4 className="text-xl font-bold text-navy mb-1">{plan.label}</h4>
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-navy">₹{plan.base_price}</span>
                                    <span className="text-sm text-slate-500">/{plan.duration_days} days</span>
                                  </div>
                                </div>
                                <ul className="space-y-2 text-sm text-slate-600">
                                  <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-green-500">check_circle</span> Unlimited Shifts & Combos</li>
                                  <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-green-500">check_circle</span> Locker Management</li>
                                  <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-green-500">check_circle</span> Income & Expense Tracking</li>
                                </ul>
                              </label>
                            );
                          })}

                          <label className={`relative p-5 rounded-xl cursor-not-allowed border-2 border-slate-200 bg-slate-50 opacity-70`}>
                            <div className="absolute right-4 top-4">
                              <span className="material-symbols-rounded text-slate-400">lock</span>
                            </div>
                            <div className="mb-3">
                              <span className="inline-block px-2 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded mb-2">COMING SOON</span>
                              <h4 className="text-xl font-bold text-slate-500 mb-1">Premium + AI CCTV</h4>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-slate-400">TBD</span>
                              </div>
                            </div>
                            <ul className="space-y-2 text-sm text-slate-500">
                              <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-slate-400">check_circle</span> All Standard Features</li>
                              <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-slate-400">check_circle</span> Admin App Access</li>
                              <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-slate-400">check_circle</span> Student App with QR Check-in</li>
                              <li className="flex gap-2"><span className="material-symbols-rounded icon-sm text-slate-400">check_circle</span> AI CCTV Integration</li>
                            </ul>
                          </label>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ─── Step 10: Review & Payment ─── */}
          {actualStep === 10 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Choose Subscription & Checkout
              </h2>
              <p className="text-sm mb-6 text-muted">
                Review your libraries and select an operating plan.
              </p>

              <div className="mb-8 p-6 rounded-xl" style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-border)' }}>
                <h3 className="font-bold text-navy mb-4">You are registering {libraries.length} {libraries.length === 1 ? 'Library' : 'Libraries'}:</h3>
                <ul className="list-disc pl-5 text-sm text-navy font-medium">
                  {libraries.map((lib, i) => (
                    <li key={i}>
                      {lib.name || `Library ${i + 1}`} ({(Number(lib.male_seats) || 0) + (Number(lib.female_seats) || 0)} seats)
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white rounded-xl shadow-sm mb-8 overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                <div className="p-5 border-b border-slate-100 bg-slate-50">
                  <h3 className="font-bold text-navy text-lg">Order Summary</h3>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="p-4 font-semibold">Library Name</th>
                        <th className="p-4 font-semibold">Plan Chosen</th>
                        <th className="p-4 font-semibold">Duration</th>
                        <th className="p-4 font-semibold text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isMultiLibrary ? (
                        (() => {
                          const sharedPlan = libraries[0]?.selectedPlan || null;
                          const perLibraryPrice = Number(sharedPlan?.base_price || 0);
                          const sharedTotal = perLibraryPrice * libraries.length;
                          return (
                            <tr>
                              <td className="p-4 font-medium text-navy">
                                {libraries.length} Libraries (Shared Plan)
                                <span className="text-xs text-slate-400 block font-normal mt-1">
                                  {libraries.map((lib, i) => lib.name || `Library ${i + 1}`).join(' + ')}
                                </span>
                              </td>
                              <td className="p-4 text-slate-600">
                                {sharedPlan ? sharedPlan.label : <span className="text-red-500 font-bold">Missing</span>}
                              </td>
                              <td className="p-4 text-slate-600">
                                {sharedPlan ? `${sharedPlan.duration_days} days` : '-'}
                              </td>
                              <td className="p-4 text-navy font-bold text-right">
                                {sharedPlan ? `₹${perLibraryPrice} x ${libraries.length} = ₹${sharedTotal}` : '₹0'}
                              </td>
                            </tr>
                          );
                        })()
                      ) : (
                        libraries.map((lib, i) => {
                          const plan = lib.selectedPlan;
                          return (
                            <tr key={i}>
                              <td className="p-4 font-medium text-navy">
                                {lib.name || `Library ${i+1}`} 
                                <span className="text-xs text-slate-400 block font-normal mt-1">{lib.city}{lib.state ? `, ${lib.state}` : ''}</span>
                              </td>
                              <td className="p-4 text-slate-600">{plan ? plan.label : <span className="text-red-500 font-bold">Missing</span>}</td>
                              <td className="p-4 text-slate-600">{plan ? `${plan.duration_days} days` : '-'}</td>
                              <td className="p-4 text-navy font-bold text-right">{plan ? `₹${plan.base_price}` : '₹0'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50/50">
                      <tr>
                        <td colSpan="3" className="p-4 text-right font-medium text-slate-500">Subtotal:</td>
                        <td className="p-4 text-right font-bold text-navy">
                          ₹{libraries.reduce((sum, lib) => sum + (lib.selectedPlan?.base_price || 0), 0)}
                        </td>
                      </tr>
                      {promoDiscount > 0 && (
                        <tr className="text-green-600 bg-green-50/30">
                          <td colSpan="3" className="p-3 pr-4 text-right font-medium">Promo Applied ({promoCode}):</td>
                          <td className="p-3 pr-4 text-right font-bold">-₹{promoDiscount}</td>
                        </tr>
                      )}
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td colSpan="3" className="p-5 text-right font-bold text-navy text-lg">Total Payable:</td>
                        <td className="p-5 text-right font-black text-main text-2xl">
                          ₹{Math.max(0, libraries.reduce((sum, lib) => sum + (lib.selectedPlan?.base_price || 0), 0) - promoDiscount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="mb-8 p-6 rounded-xl bg-white border border-slate-200 w-full max-w-md shadow-sm">
                <label className="form-label mb-3 block font-bold text-navy">Have a Promo Code?</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="form-input flex-1 uppercase font-mono tracking-wider"
                    placeholder="ENTER CODE"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    disabled={isVerifyingPromo || promoDiscount > 0}
                  />
                  {promoDiscount === 0 ? (
                    <button 
                      className="btn btn-secondary whitespace-nowrap px-6"
                      onClick={applyPromo}
                      disabled={isVerifyingPromo || !promoInput.trim()}
                    >
                      {isVerifyingPromo ? <span className="loading-spinner"></span> : 'Apply'}
                    </button>
                  ) : (
                    <button 
                      className="btn btn-secondary whitespace-nowrap px-6 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                      onClick={removePromo}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {promoError && <p className="text-red-500 text-xs mt-2 font-medium">{promoError}</p>}
                {promoDiscount > 0 && (
                  <p className="text-green-600 font-medium text-xs mt-2 flex items-center gap-1">
                    <span className="material-symbols-rounded icon-sm" style={{ fontSize: '16px' }}>check_circle</span> 
                    Discount applied to your order!
                  </p>
                )}
              </div>

              <label className="checkbox-label mb-6 p-4 rounded-xl items-start" style={{ background: 'var(--color-amber-lightest)', border: '1px solid var(--color-amber-light)' }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="form-checkbox mt-1"
                />
                <span className="text-sm font-medium" style={{ color: '#92400E' }}>
                  I confirm all details above are correct and I want to submit my registration.
                </span>
              </label>

              <div className="p-4 rounded-xl mb-6 text-sm" style={{ background: 'var(--color-surface-dark)', border: '1px solid var(--color-border)' }}>
                After successful payment, you will be redirected to the library management portal:
                {' '}
                <a href="/manage-library" style={{ color: 'var(--color-amber-dark)', fontWeight: 700 }}>
                  /manage-library
                </a>
                {' '}
                (portal screens will be expanded in the next phase).
              </div>

              {submitError && (
                <div className="p-4 rounded-xl mb-6 text-sm flex items-start gap-2" style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
                  <span className="material-symbols-rounded icon-sm">error</span>
                  <span className="font-medium pt-0.5">{submitError}</span>
                </div>
              )}
            </div>
          )}

          {/* ─── Navigation buttons ─── */}
          <div className="flex items-center justify-between mt-10 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-3">
              {step > 1 && (
                <button className="btn btn-secondary" onClick={prevStep}>
                  <span className="material-symbols-rounded icon-sm">arrow_back</span> Back
                </button>
              )}
              {actualStep === 1 && (
                <button
                  className="btn btn-secondary"
                  onClick={addNewLibrary}
                  style={{ color: 'var(--color-amber-dark)', borderColor: 'var(--color-amber-light)', background: 'var(--color-amber-lightest)' }}
                >
                  <span className="material-symbols-rounded icon-sm">add_business</span> Add Another Library
                </button>
              )}
            </div>
            {actualStep < 10 ? (
              <button className="btn btn-primary" onClick={nextStep}>
                Continue <span className="material-symbols-rounded icon-sm">arrow_forward</span>
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handlePay}
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                {isSubmitting ? (
                  <>
                    <span className="loading-spinner" /> Processing...
                  </>
                ) : (
                  <>
                    Proceed to Payment <span className="material-symbols-rounded icon-sm">lock</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        </section>
      </div>
    </div>
  );
}
