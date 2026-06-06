-- ============================================================================
-- 0026_profile_tour.sql — onboarding tour completion flag.
-- Tracks whether a user has seen the guided dashboard tour, so it auto-starts
-- once for new users and never nags again (they can replay it from the header).
-- Persisted on the profile so it follows the user across devices.
-- Idempotent.
-- ============================================================================
alter table public.profiles
  add column if not exists has_completed_tour boolean not null default false;
