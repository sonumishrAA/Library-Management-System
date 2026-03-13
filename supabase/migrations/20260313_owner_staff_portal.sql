-- Owner + Staff portal schema

create table if not exists public.library_users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  password_hash text not null,
  role text not null check (role in ('owner', 'staff')),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists library_users_email_unique_idx
  on public.library_users (lower(email))
  where email is not null;

create unique index if not exists library_users_phone_unique_idx
  on public.library_users (phone)
  where phone is not null;

create table if not exists public.library_user_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.library_users(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  is_primary_owner boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, library_id)
);

create index if not exists library_user_access_library_idx
  on public.library_user_access (library_id, role, status);

create index if not exists library_user_access_user_idx
  on public.library_user_access (user_id, status);

create table if not exists public.library_subscriptions (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null unique references public.libraries(id) on delete cascade,
  pricing_plan_id uuid references public.pricing_plans(id) on delete set null,
  plan_key text,
  status text not null default 'active' check (status in ('active', 'expired', 'paused', 'pending', 'pending_approval')),
  starts_on date,
  ends_on date,
  paused_on date,
  renewal_requested_on date,
  last_paid_amount numeric(10,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_subscriptions_status_idx
  on public.library_subscriptions (status, ends_on);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  membership_id uuid references public.memberships(id) on delete set null,
  collected_by_user_id uuid references public.library_users(id) on delete set null,
  transaction_type text not null check (transaction_type in ('admission', 'renewal', 'locker_fee')),
  amount numeric(10,2) not null default 0,
  payment_mode text not null default 'cash' check (payment_mode in ('cash')),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists cash_transactions_library_idx
  on public.cash_transactions (library_id, collected_at desc);

create table if not exists public.owner_notifications (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  owner_user_id uuid references public.library_users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  actor_user_id uuid references public.library_users(id) on delete set null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists owner_notifications_library_idx
  on public.owner_notifications (library_id, created_at desc);

create index if not exists owner_notifications_owner_unread_idx
  on public.owner_notifications (owner_user_id, read_at, created_at desc);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  actor_user_id uuid references public.library_users(id) on delete set null,
  actor_role text,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_library_idx
  on public.audit_events (library_id, created_at desc);

create table if not exists public.subscription_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  pricing_plan_id uuid references public.pricing_plans(id) on delete set null,
  requested_by_user_id uuid references public.library_users(id) on delete set null,
  approved_by uuid,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  amount numeric(10,2) not null default 0,
  cash_reference_note text,
  requested_period_days integer,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_renewal_requests_library_idx
  on public.subscription_renewal_requests (library_id, status, created_at desc);

alter table public.combined_shift_pricing
  add column if not exists fee_plans jsonb not null default '{}'::jsonb;

alter table public.libraries
  add column if not exists male_lockers integer not null default 0,
  add column if not exists female_lockers integer not null default 0,
  add column if not exists staff_email text,
  add column if not exists staff_password_hash text;

create table if not exists public.pending_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  library_ids jsonb not null default '[]'::jsonb,
  amount numeric(10,2) not null default 0,
  status text not null default 'created',
  payment_id text,
  created_at timestamptz not null default now()
);

alter table public.pending_orders
  add column if not exists plan_selections jsonb,
  add column if not exists promo_code_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_max_staff_per_library()
returns trigger
language plpgsql
as $$
declare
  active_staff_count integer;
begin
  if new.role = 'staff' and new.status = 'active' then
    select count(*) into active_staff_count
    from public.library_user_access lua
    where lua.library_id = new.library_id
      and lua.role = 'staff'
      and lua.status = 'active'
      and lua.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if active_staff_count >= 2 then
      raise exception 'Only 2 active staff accounts allowed per library';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_library_users_updated_at on public.library_users;
create trigger trg_library_users_updated_at
before update on public.library_users
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_library_user_access_updated_at on public.library_user_access;
create trigger trg_library_user_access_updated_at
before update on public.library_user_access
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_library_subscriptions_updated_at on public.library_subscriptions;
create trigger trg_library_subscriptions_updated_at
before update on public.library_subscriptions
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_subscription_renewal_requests_updated_at on public.subscription_renewal_requests;
create trigger trg_subscription_renewal_requests_updated_at
before update on public.subscription_renewal_requests
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_library_user_access_staff_limit on public.library_user_access;
create trigger trg_library_user_access_staff_limit
before insert or update of role, status, library_id on public.library_user_access
for each row execute function public.enforce_max_staff_per_library();

insert into public.library_subscriptions (
  library_id,
  plan_key,
  status,
  starts_on,
  ends_on,
  metadata
)
select
  l.id,
  null,
  case
    when l.status = 'active' then 'active'
    when l.status in ('pending', 'pending_payment') then 'pending'
    else 'paused'
  end,
  case when l.status = 'active' then coalesce(l.created_at::date, current_date) else null end,
  null,
  jsonb_build_object('backfilled', true)
from public.libraries l
where not exists (
  select 1 from public.library_subscriptions ls where ls.library_id = l.id
);

create index if not exists memberships_library_student_end_date_idx
  on public.memberships (library_id, student_id, end_date desc);

create index if not exists seat_occupancy_lookup_idx
  on public.seat_occupancy (library_id, shift_id, seat_number, start_date, end_date);

create index if not exists lockers_library_number_idx
  on public.lockers (library_id, locker_number);
