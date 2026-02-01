-- Create onboarding profiles table for EmailBridge Pro
CREATE TABLE IF NOT EXISTS public.onboarding_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT,
  use_case TEXT,
  experience TEXT,
  target_industry TEXT,
  product_category TEXT,
  completion_status TEXT NOT NULL DEFAULT 'in_progress',
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.onboarding_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their onboarding profile"
  ON public.onboarding_profiles
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.onboarding_profiles
  ADD CONSTRAINT onboarding_profiles_completion_status_check
  CHECK (completion_status IN ('in_progress', 'completed', 'skipped'));

DROP TRIGGER IF EXISTS update_onboarding_profiles_updated_at ON public.onboarding_profiles;
CREATE TRIGGER update_onboarding_profiles_updated_at
BEFORE UPDATE ON public.onboarding_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
