create extension if not exists pgcrypto;

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  status text not null default 'Unread',
  constraint contact_submissions_status_check
    check (status in ('Unread', 'Read', 'Replied'))
);

alter table public.contact_submissions
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists subject text,
  add column if not exists message text,
  add column if not exists status text not null default 'Unread';

create index if not exists contact_submissions_created_at_idx
  on public.contact_submissions (created_at desc);

create index if not exists contact_submissions_status_idx
  on public.contact_submissions (status);

alter table public.contact_submissions enable row level security;
