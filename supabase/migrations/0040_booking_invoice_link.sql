-- 0040 — link a service booking to the invoice raised from it, and let
-- cash / close-customer jobs be marked as deliberately not needing an invoice.
-- Powers the "Raise invoice from job" action and the "Not invoiced" flag on
-- the service bookings page.
--
-- RUN THIS ONCE in the Supabase SQL editor (the app never runs SQL for you).

alter table public.service_bookings
  add column if not exists invoice_id uuid
    references public.invoices(id) on delete set null,
  add column if not exists no_invoice_needed boolean not null default false;

-- Clean slate: treat every job already completed as settled, so the new
-- "Not invoiced" flag only surfaces jobs completed from now on. Deleting an
-- invoice later nulls invoice_id (on delete set null) and re-flags the job.
update public.service_bookings
  set no_invoice_needed = true
  where status = 'completed'
    and invoice_id is null
    and no_invoice_needed = false;

create index if not exists service_bookings_invoice_id_idx
  on public.service_bookings (invoice_id);
