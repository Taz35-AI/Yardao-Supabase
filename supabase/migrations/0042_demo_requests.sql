-- 0042_demo_requests.sql
-- Captures submissions from the public "Request a demo" page (the old self-serve
-- /register flow is replaced by demo requests). Unauthenticated visitors may
-- INSERT; there are no SELECT/UPDATE/DELETE policies, so RLS denies reads to
-- everyone except the service role — view/manage submissions in the Supabase
-- dashboard (Table editor) or via a service-role query.

create table if not exists public.demo_requests (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  full_name         text not null,
  work_email        text not null,
  phone             text,
  organization_name text not null,
  business_type     text,
  fleet_size        text,
  sites             text,
  message           text,
  status            text not null default 'new',
  source            text not null default 'request-a-demo'
);

alter table public.demo_requests enable row level security;

-- Anyone (including anonymous visitors) may submit a demo request.
drop policy if exists "demo_requests_public_insert" on public.demo_requests;
create policy "demo_requests_public_insert"
  on public.demo_requests
  for insert
  to anon, authenticated
  with check (true);

create index if not exists demo_requests_created_at_idx
  on public.demo_requests (created_at desc);
