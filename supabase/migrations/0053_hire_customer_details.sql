-- 0053_hire_customer_details.sql  (Hire Management — richer customer record)
-- ============================================================================
-- Adds company / registration / bank fields to B2B HIRE customers only
-- (public.rental_customers). Garage customers (public.customers) are a SEPARATE
-- population and are NOT touched.
--
-- All columns are nullable and additive, so existing rows and non-hire orgs are
-- unaffected. Re-runnable (add column if not exists). RLS is unchanged — these
-- columns inherit the existing org-scoped policy on rental_customers.
-- ============================================================================

alter table public.rental_customers add column if not exists address             text;
alter table public.rental_customers add column if not exists company_number      text;
alter table public.rental_customers add column if not exists vat_number          text;
alter table public.rental_customers add column if not exists website             text;
alter table public.rental_customers add column if not exists bank_account_name   text;
alter table public.rental_customers add column if not exists bank_sort_code      text;
alter table public.rental_customers add column if not exists bank_account_number text;
