-- 0073_invoice_notes.sql
-- Optional free-text notes on an invoice, printed for the customer (on the
-- invoice view and the PDF). Null / empty = no notes section.
alter table public.invoices
  add column if not exists notes text;
