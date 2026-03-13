import bcrypt from "npm:bcryptjs@3.0.2";
import { SignJWT, jwtVerify } from "https://esm.sh/jose@5.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export type PortalRole = "owner" | "staff";

export const createServiceClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
};

export const asDateOnly = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
};

export const todayDate = () => new Date().toISOString().split("T")[0];

export const addDays = (dateValue: string, days: number) => {
  const parsed = new Date(`${dateValue}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().split("T")[0];
};

export const addMonthsDate = (dateValue: string, months: number) => {
  const parsed = new Date(`${dateValue}T00:00:00`);
  parsed.setMonth(parsed.getMonth() + months);
  return parsed.toISOString().split("T")[0];
};

export const compareDateOnly = (left?: string | null, right?: string | null) => {
  const leftValue = asDateOnly(left);
  const rightValue = asDateOnly(right);
  if (!leftValue || !rightValue) return 0;
  return leftValue.localeCompare(rightValue);
};

export const subscriptionStateFromRecord = (subscription: any) => {
  if (!subscription) {
    return {
      status: "active",
      ends_on: null,
      starts_on: null,
      paused_on: null,
      renewal_requested_on: null,
      is_expired: false,
      is_locked: false,
      label: "Active",
    };
  }

  const today = todayDate();
  const endsOn = asDateOnly(subscription.ends_on);
  const rawStatus = String(subscription.status || "active").toLowerCase();
  const expiredByDate = Boolean(endsOn && compareDateOnly(endsOn, today) < 0);

  let status = rawStatus;
  if (expiredByDate && rawStatus === "active") {
    status = "expired";
  }

  const isLocked = status === "expired" || status === "paused" || status === "pending_approval";
  const labelMap: Record<string, string> = {
    active: "Active",
    expired: "Expired",
    paused: "Paused",
    pending: "Pending",
    pending_approval: "Renewal Pending",
  };

  return {
    ...subscription,
    status,
    ends_on: endsOn,
    starts_on: asDateOnly(subscription.starts_on),
    paused_on: asDateOnly(subscription.paused_on),
    renewal_requested_on: asDateOnly(subscription.renewal_requested_on),
    is_expired: status === "expired",
    is_locked: isLocked,
    label: labelMap[status] || "Active",
  };
};

export async function issueLibraryUserToken(
  payload: {
    userId: string;
    userRole: PortalRole;
    libraryIds: string[];
    email?: string | null;
  },
  jwtSecret: string,
) {
  const secret = new TextEncoder().encode(jwtSecret);
  return await new SignJWT({
    role: "library_user",
    user_id: payload.userId,
    user_role: payload.userRole,
    library_ids: payload.libraryIds,
    email: payload.email || null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyLibraryUserToken(req: Request, jwtSecret: string) {
  // Always prioritize the custom portal token header if it exists
  const authHeader = req.headers.get("x-portal-authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const secret = new TextEncoder().encode(jwtSecret);
  const { payload } = await jwtVerify(token, secret);

  if (payload.role !== "library_user" || !payload.user_id) {
    throw new Error("Unauthorized: invalid portal token");
  }

  return payload as unknown as {
    user_id: string;
    user_role: PortalRole;
    library_ids: string[];
    email?: string | null;
  };
}

export async function ensurePortalAccess(
  req: Request,
  libraryId: string,
  options?: {
    requireOwner?: boolean;
    allowExpiredOwnerRead?: boolean;
    allowExpiredOwnerWrite?: boolean;
  },
) {
  const jwtSecret = Deno.env.get("JWT_SECRET")!;
  const tokenPayload = await verifyLibraryUserToken(req, jwtSecret);
  const allowedLibraryIds = Array.isArray(tokenPayload.library_ids) ? tokenPayload.library_ids : [];

  if (!allowedLibraryIds.includes(libraryId)) {
    throw new Error("Unauthorized: library access denied");
  }

  const supabase = createServiceClient();
  const { data: user, error: userError } = await supabase
    .from("library_users")
    .select("id, email, phone, role, status")
    .eq("id", tokenPayload.user_id)
    .single();

  if (userError || !user || user.status !== "active") {
    throw new Error("Unauthorized: user not found or inactive");
  }

  const { data: access, error: accessError } = await supabase
    .from("library_user_access")
    .select("id, role, status, is_primary_owner")
    .eq("user_id", user.id)
    .eq("library_id", libraryId)
    .single();

  if (accessError || !access || access.status !== "active") {
    throw new Error("Unauthorized: access revoked");
  }

  if (options?.requireOwner && access.role !== "owner") {
    throw new Error("Unauthorized: owner access required");
  }

  const { data: library, error: libraryError } = await supabase
    .from("libraries")
    .select("id, name, city, state, address, pincode, contact_phone, contact_email, status, male_seats, female_seats, total_seats, male_lockers, female_lockers, total_lockers, created_at")
    .eq("id", libraryId)
    .single();

  if (libraryError || !library) {
    throw new Error("Library not found");
  }

  const { data: subscription } = await supabase
    .from("library_subscriptions")
    .select("id, pricing_plan_id, plan_key, status, starts_on, ends_on, paused_on, renewal_requested_on, last_paid_amount, metadata")
    .eq("library_id", libraryId)
    .maybeSingle();

  const normalizedSubscription = subscriptionStateFromRecord(subscription);
  const isExpiredOwnerRead = Boolean(options?.allowExpiredOwnerRead && access.role === "owner");
  const isExpiredOwnerWrite = Boolean(options?.allowExpiredOwnerWrite && access.role === "owner");

  if (normalizedSubscription.is_locked) {
    if (access.role === "staff") {
      throw new Error("Subscription locked: staff access is blocked");
    }

    if (!isExpiredOwnerRead && !isExpiredOwnerWrite) {
      throw new Error("Subscription locked: owner access limited to renewal flow");
    }
  }

  return {
    supabase,
    tokenPayload,
    user,
    access,
    library,
    subscription: normalizedSubscription,
  };
}

export async function getAccessibleLibrariesForUser(userId: string) {
  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("library_user_access")
    .select(`
      library_id,
      role,
      status,
      is_primary_owner,
      libraries (
        id,
        name,
        city,
        state,
        status
      )
    `)
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to load linked libraries: ${error.message}`);
  }

  const libraryIds = (rows || []).map((row: any) => row.library_id);
  const subscriptionMap = new Map<string, any>();
  if (libraryIds.length > 0) {
    const { data: subscriptions } = await supabase
      .from("library_subscriptions")
      .select("library_id, pricing_plan_id, plan_key, status, starts_on, ends_on, paused_on, renewal_requested_on, last_paid_amount, metadata")
      .in("library_id", libraryIds);

    for (const item of subscriptions || []) {
      subscriptionMap.set(item.library_id, subscriptionStateFromRecord(item));
    }
  }

  return (rows || []).map((row: any) => ({
    id: row.library_id,
    name: row.libraries?.name || "Library",
    city: row.libraries?.city || "",
    state: row.libraries?.state || "",
    library_status: row.libraries?.status || "active",
    role: row.role,
    is_primary_owner: Boolean(row.is_primary_owner),
    subscription: subscriptionMap.get(row.library_id) || subscriptionStateFromRecord(null),
  }));
}

const findLegacyOwnerMatch = async (supabase: any, identifier: string, password: string) => {
  const { data: ownerCandidates } = await supabase
    .from("libraries")
    .select("id, login_id, password_hash, contact_email, contact_phone, name, city, status")
    .or(`login_id.eq.${identifier},contact_email.eq.${identifier},contact_phone.eq.${identifier}`)
    .eq("status", "active");

  for (const library of ownerCandidates || []) {
    if (!library.password_hash) continue;
    const valid = await bcrypt.compare(password, library.password_hash);
    if (valid) {
      return library;
    }
  }

  return null;
};

const findLegacyStaffMatch = async (supabase: any, identifier: string, password: string) => {
  const { data: staffCandidates } = await supabase
    .from("libraries")
    .select("id, staff_email, staff_password_hash, contact_email, contact_phone, name, city, status")
    .eq("staff_email", identifier)
    .eq("status", "active");

  for (const library of staffCandidates || []) {
    if (!library.staff_password_hash) continue;
    const valid = await bcrypt.compare(password, library.staff_password_hash);
    if (valid) {
      return library;
    }
  }

  return null;
};

export async function provisionLegacyOwnerUser(supabase: any, library: any) {
  const ownerEmail = String(library.contact_email || library.login_id || "").trim().toLowerCase();
  const ownerPhone = String(library.contact_phone || "").trim() || null;

  if (!ownerEmail) {
    throw new Error("Legacy owner migration failed: missing owner email/login");
  }

  let { data: user } = await supabase
    .from("library_users")
    .select("id, email, phone, role, status")
    .ilike("email", ownerEmail)
    .maybeSingle();

  if (!user) {
    const inserted = await supabase
      .from("library_users")
      .insert({
        email: ownerEmail,
        phone: ownerPhone,
        password_hash: library.password_hash,
        role: "owner",
        status: "active",
      })
      .select("id, email, phone, role, status")
      .single();

    if (inserted.error) {
      throw new Error(`Failed to provision owner user: ${inserted.error.message}`);
    }

    user = inserted.data;
  } else {
    await supabase
      .from("library_users")
      .update({ password_hash: library.password_hash, phone: ownerPhone || user.phone, status: "active" })
      .eq("id", user.id);
  }

  const { data: linkedLibraries } = await supabase
    .from("libraries")
    .select("id")
    .eq("contact_email", library.contact_email)
    .eq("status", "active");

  const accessRows = (linkedLibraries || [{ id: library.id }]).map((item: any) => ({
    user_id: user.id,
    library_id: item.id,
    role: "owner",
    is_primary_owner: true,
    status: "active",
  }));

  const { error: accessError } = await supabase
    .from("library_user_access")
    .upsert(accessRows, { onConflict: "user_id,library_id" });

  if (accessError) {
    throw new Error(`Failed to provision owner access: ${accessError.message}`);
  }

  return user;
}

export async function provisionLegacyStaffUser(supabase: any, library: any) {
  const staffEmail = String(library.staff_email || "").trim().toLowerCase();
  if (!staffEmail) {
    throw new Error("Legacy staff migration failed: missing staff email");
  }

  let { data: user } = await supabase
    .from("library_users")
    .select("id, email, phone, role, status")
    .ilike("email", staffEmail)
    .maybeSingle();

  if (!user) {
    const inserted = await supabase
      .from("library_users")
      .insert({
        email: staffEmail,
        phone: null,
        password_hash: library.staff_password_hash,
        role: "staff",
        status: "active",
      })
      .select("id, email, phone, role, status")
      .single();

    if (inserted.error) {
      throw new Error(`Failed to provision staff user: ${inserted.error.message}`);
    }
    user = inserted.data;
  } else {
    await supabase
      .from("library_users")
      .update({ password_hash: library.staff_password_hash, status: "active", role: "staff" })
      .eq("id", user.id);
  }

  const { error: accessError } = await supabase
    .from("library_user_access")
    .upsert({
      user_id: user.id,
      library_id: library.id,
      role: "staff",
      is_primary_owner: false,
      status: "active",
    }, { onConflict: "user_id,library_id" });

  if (accessError) {
    throw new Error(`Failed to provision staff access: ${accessError.message}`);
  }

  return user;
}

export async function authenticatePortalUser(identifier: string, password: string) {
  const supabase = createServiceClient();
  const normalized = String(identifier || "").trim();
  if (!normalized || !password) {
    throw new Error("Email or phone and password are required");
  }

  let user = null;
  if (normalized.includes("@")) {
    const userRes = await supabase
      .from("library_users")
      .select("id, email, phone, password_hash, role, status")
      .ilike("email", normalized.toLowerCase())
      .maybeSingle();
    user = userRes.data;
  } else {
    const userRes = await supabase
      .from("library_users")
      .select("id, email, phone, password_hash, role, status")
      .eq("phone", normalized)
      .maybeSingle();
    user = userRes.data;
  }

  if (user?.password_hash && user.status === "active") {
    const valid = await bcrypt.compare(password, user.password_hash);
    if (valid) {
      return user;
    }
  }

  const legacyOwner = await findLegacyOwnerMatch(supabase, normalized, password);
  if (legacyOwner) {
    return await provisionLegacyOwnerUser(supabase, legacyOwner);
  }

  const legacyStaff = await findLegacyStaffMatch(supabase, normalized, password);
  if (legacyStaff) {
    return await provisionLegacyStaffUser(supabase, legacyStaff);
  }

  throw new Error("Invalid credentials");
}
