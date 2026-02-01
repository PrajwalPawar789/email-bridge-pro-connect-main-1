import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";

export type OnboardingStatus = "missing" | "in_progress" | "completed" | "skipped";
export type OnboardingProfile = Tables<"onboarding_profiles">;
export type OnboardingProfileInsert = TablesInsert<"onboarding_profiles">;

export async function fetchOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const { data, error } = await supabase
    .from("onboarding_profiles")
    .select("completion_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return "missing";
  }

  const status = data.completion_status as OnboardingStatus | null;
  return status ?? "missing";
}

export async function fetchOnboardingProfile(userId: string): Promise<OnboardingProfile | null> {
  const { data, error } = await supabase
    .from("onboarding_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function upsertOnboardingProfile(payload: OnboardingProfileInsert) {
  const { data, error } = await supabase
    .from("onboarding_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}
