import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import OnboardingVideoLayout from "@/components/onboarding/OnboardingVideoLayout";
import StepProgress from "@/components/onboarding/StepProgress";
import OnboardingSummaryPanel, { SummaryValues } from "@/components/onboarding/OnboardingSummaryPanel";
import {
  fetchOnboardingProfile,
  fetchOnboardingStatus,
  upsertOnboardingProfile,
} from "@/lib/onboarding";

const questions = [
  {
    key: "role",
    title: "What's your role?",
    subtitle: "We tailor default views, prompts, and analytics to your role.",
    options: [
      "Founder / CEO",
      "Marketing",
      "Sales",
      "RevOps / Operations",
      "Agency / Consultant",
    ],
  },
  {
    key: "useCase",
    title: "What is your primary goal?",
    subtitle: "This helps us recommend the right sequences and templates.",
    options: [
      "Launch outbound campaigns",
      "Improve deliverability",
      "Track replies and pipeline",
      "Scale existing sequences",
      "Centralize inbox management",
    ],
  },
  {
    key: "experience",
    title: "How experienced is your team with outreach?",
    subtitle: "We adapt the onboarding depth based on experience.",
    options: ["Just getting started", "Some experience", "Advanced", "Expert"],
  },
  {
    key: "targetIndustry",
    title: "Which industry do you work in?",
    subtitle: "So we can tailor examples and benchmarks.",
    options: [
      "SaaS",
      "Ecommerce",
      "Agencies",
      "Professional services",
      "Other",
    ],
  },
  {
    key: "productCategory",
    title: "What do you sell?",
    subtitle: "This tunes templates, language, and positioning.",
    options: [
      "B2B software",
      "Services",
      "Physical products",
      "Marketplaces",
      "Other",
    ],
  },
] as const;

type QuestionKey = (typeof questions)[number]["key"];

const totalQuestions = questions.length;
const totalSteps = totalQuestions + 1; // review step

const buildProfilePayload = (userId: string, values: SummaryValues) => ({
  user_id: userId,
  role: values.role ?? null,
  use_case: values.useCase ?? null,
  experience: values.experience ?? null,
  target_industry: values.targetIndustry ?? null,
  product_category: values.productCategory ?? null,
});

const findFirstMissingIndex = (values: SummaryValues) =>
  questions.findIndex((q) => !values[q.key as keyof SummaryValues]);

const Onboarding = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<SummaryValues>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);

  const completionPercentage = useMemo(() => {
    const answered = Object.values(values).filter(Boolean).length;
    return Math.min(100, Math.round((answered / totalQuestions) * 100));
  }, [values]);

  useEffect(() => {
    let active = true;
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    const load = async () => {
      try {
        const status = await fetchOnboardingStatus(user.id);
        if (!active) return;
        if (status === "completed" || status === "skipped") {
          navigate("/dashboard", { replace: true });
          return;
        }

        const profile = await fetchOnboardingProfile(user.id);
        if (!active) return;

        if (profile) {
          const nextValues: SummaryValues = {
            role: profile.role ?? undefined,
            useCase: profile.use_case ?? undefined,
            experience: profile.experience ?? undefined,
            targetIndustry: profile.target_industry ?? undefined,
            productCategory: profile.product_category ?? undefined,
          };
          setValues(nextValues);

          const firstMissing = findFirstMissingIndex(nextValues);
          setStepIndex(firstMissing === -1 ? totalQuestions : firstMissing);
        }
      } catch (err: any) {
        toast({
          title: "Unable to load onboarding",
          description: err?.message || String(err),
          variant: "destructive",
        });
      } finally {
        if (active) setInitializing(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [loading, user, navigate]);

  const handleSaveProgress = async (nextValues: SummaryValues) => {
    if (!user) return;
    try {
      await upsertOnboardingProfile({
        ...buildProfilePayload(user.id, nextValues),
        completion_status: "in_progress",
      });
    } catch (err: any) {
      toast({
        title: "Unable to save progress",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const handleSelect = async (key: QuestionKey, option: string) => {
    const nextValues = { ...values, [key]: option };
    setValues(nextValues);
    await handleSaveProgress(nextValues);
  };

  const handleNext = async () => {
    if (stepIndex < totalQuestions) {
      setStepIndex((prev) => Math.min(totalQuestions, prev + 1));
      return;
    }

    if (!user) return;
    setSaving(true);
    try {
      await upsertOnboardingProfile({
        ...buildProfilePayload(user.id, values),
        completion_status: "completed",
        completed_at: new Date().toISOString(),
      });
      toast({ title: "You're all set!", description: "Welcome to EmailBridge Pro." });
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast({
        title: "Unable to finish onboarding",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleSkip = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await upsertOnboardingProfile({
        ...buildProfilePayload(user.id, values),
        completion_status: "skipped",
        completed_at: new Date().toISOString(),
      });
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast({
        title: "Unable to skip onboarding",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isReviewStep = stepIndex >= totalQuestions;
  const currentQuestion = questions[stepIndex as number];
  const currentValue = currentQuestion
    ? values[currentQuestion.key as keyof SummaryValues]
    : undefined;

  const content = isReviewStep ? (
    <div className="space-y-6">
      <StepProgress
        current={totalSteps}
        total={totalSteps}
        title="Review and launch"
        subtitle="Confirm your personalization details before entering EmailBridge Pro."
        hidePercent
      />

      <OnboardingSummaryPanel values={values} total={totalQuestions} />

      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <Button variant="outline" onClick={handleBack} disabled={saving}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          className="bg-emerald-500 hover:bg-emerald-600 text-slate-900"
          disabled={saving}
        >
          {saving ? "Finishing..." : "Finish onboarding"}
        </Button>
      </div>
    </div>
  ) : (
    <div className="space-y-6">
      <StepProgress
        current={stepIndex + 1}
        total={totalSteps}
        title={currentQuestion.title}
        subtitle={currentQuestion.subtitle}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {currentQuestion.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleSelect(currentQuestion.key, option)}
            className={cn(
              "rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
              currentValue === option
                ? "border-emerald-400 bg-emerald-50 text-slate-900 shadow-sm"
                : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/60",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <Button variant="outline" onClick={handleBack} disabled={stepIndex === 0 || saving}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          className="bg-emerald-500 hover:bg-emerald-600 text-slate-900"
          disabled={!currentValue || saving}
        >
          Continue
        </Button>
      </div>
    </div>
  );

  return (
    <OnboardingVideoLayout
      content={content}
      summaryValues={values}
      summaryTotal={totalQuestions}
      currentStep={Math.min(stepIndex + 1, totalSteps)}
      completionPercentage={completionPercentage}
      onSkip={handleSkip}
    />
  );
};

export default Onboarding;
