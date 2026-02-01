import React from "react";
import OnboardingPersonalizationPanel from "./OnboardingPersonalizationPanel";
import { SummaryValues } from "./OnboardingSummaryPanel";
import { ArrowRight } from "lucide-react";
import Logo from "@/components/Logo";

export default function OnboardingVideoLayout({
  content,
  summaryValues,
  summaryTotal,
  currentStep,
  completionPercentage,
  logoSrc,
  logoAlt = "EmailBridge Pro",
  videoSrc = "https://dj5ra5fp2z43j.cloudfront.net/videos/api-model-cards-3.mp4",
  onSkip,
}: {
  content: React.ReactNode;
  summaryValues: SummaryValues;
  summaryTotal: number;
  currentStep: number;
  completionPercentage?: number;
  logoSrc?: string;
  logoAlt?: string;
  videoSrc?: string;
  onSkip?: () => void;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Video Background */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src={videoSrc} type="video/mp4" />
      </video>

      {/* Blur overlay for better readability */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

      {/* Navigation bar */}
      <nav className="pointer-events-auto absolute inset-x-0 top-0 z-20">
        <div className="flex items-center justify-between px-4 py-4 md:px-6">
          {logoSrc ? (
            <img src={logoSrc} alt={logoAlt} className="h-9 w-auto" />
          ) : (
            <Logo className="text-white" textClassName="text-lg text-white" accentClassName="text-emerald-300" />
          )}

          {/* Skip button top-right */}
          {onSkip ? (
            <button
              onClick={onSkip}
              className="text-sm flex text-white items-center underline hover:text-white/80 transition-colors underline-offset-4 hover:underline"
            >
              Skip for now <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          ) : null}
        </div>
      </nav>

      {/* Main content container */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 pt-20 md:pt-24">
        <div className="w-full max-w-5xl">
          <div className="rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="p-6 sm:p-8 md:p-10">
              {/* Content and Personalization side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left side - Main form content */}
                <div className="lg:col-span-2">{content}</div>

                {/* Right side - Personalization panel inside card */}
                <div className="lg:col-span-1">
                  <OnboardingPersonalizationPanel
                    values={summaryValues}
                    total={summaryTotal}
                    currentStep={currentStep}
                    completionPercentage={completionPercentage}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
