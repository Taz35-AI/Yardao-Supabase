-- ============================================================================
-- YARDAO → Supabase  |  0019_realtime_pub.sql
-- ----------------------------------------------------------------------------
-- Adds the `customers` table to the supabase_realtime publication so the
-- useCustomers hook receives live INSERT/UPDATE/DELETE events — replacing the
-- Firestore onSnapshot it previously used (new customers created by the
-- booking-save upsert must appear in autocomplete immediately).
--
-- checked_in_vehicles + yard_layouts are already in the publication (0002), so
-- useYardData and useYardLayout need nothing added here.
--
-- checkout_history is intentionally NOT added: useCheckoutHistory is a one-time
-- fetch (loadAll + manual refresh), not a live listener, so it needs no
-- realtime stream.
-- ============================================================================

alter publication supabase_realtime add table public.customers;
