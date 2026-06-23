-- teardown_hire_management.sql  (Hire Management — full rollback)
-- ============================================================================
-- Reverses EVERYTHING migrations 0046–0049 added. Run manually in the Supabase
-- SQL editor ONLY to remove the hire module entirely.
--
-- ⚠️ Do NOT keep this in the migrations folder / run it in a normal deploy.
-- ⚠️ Permanently deletes hire customers, documents, agreements, lines, swaps and
--    credits. Garage customers (public.customers) and yard Contracts
--    (public.contracts) are NOT touched. All guarded with IF EXISTS (idempotent).
-- ============================================================================

-- child tables first (FKs), then parents
drop table if exists public.rental_credits             cascade;
drop table if exists public.rental_swaps               cascade;
drop table if exists public.rental_agreement_vehicles  cascade;
drop table if exists public.rental_agreements          cascade;
drop table if exists public.rental_customer_documents  cascade;
drop table if exists public.rental_customers           cascade;

-- yard link column
alter table public.checked_in_vehicles
  drop column if exists current_agreement_line_id;

-- hire settings blob
alter table public.organization_settings
  drop column if exists hire_settings;

-- verify nothing remains (expect 0 rows)
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'rental_%';
