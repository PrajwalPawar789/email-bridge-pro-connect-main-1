ALTER TABLE public.onboarding_profiles
  ADD COLUMN IF NOT EXISTS postmaster_domain TEXT;
