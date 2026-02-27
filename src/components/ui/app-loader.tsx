import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const spinnerSizeClass = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-8 w-8",
} as const;

type SpinnerSize = keyof typeof spinnerSizeClass;

type AppSpinnerProps = {
  size?: SpinnerSize;
  className?: string;
};

type InlineLoaderProps = {
  label?: string;
  size?: SpinnerSize;
  className?: string;
  textClassName?: string;
};

type PageLoaderProps = {
  label?: string;
  className?: string;
  minHeightClassName?: string;
};

export const AppSpinner = ({ size = "md", className }: AppSpinnerProps) => (
  <Loader2
    aria-hidden
    className={cn(
      "animate-spin text-[var(--shell-accent)]",
      spinnerSizeClass[size],
      className
    )}
  />
);

export const InlineLoader = ({
  label = "Loading...",
  size = "sm",
  className,
  textClassName,
}: InlineLoaderProps) => (
  <span className={cn("inline-flex items-center gap-2", className)}>
    <AppSpinner size={size} />
    {label ? <span className={cn("text-sm text-slate-500", textClassName)}>{label}</span> : null}
  </span>
);

export const PageLoader = ({
  label = "Loading...",
  className,
  minHeightClassName = "min-h-[55vh]",
}: PageLoaderProps) => (
  <div className={cn("flex items-center justify-center", minHeightClassName, className)}>
    <InlineLoader label={label} size="lg" textClassName="font-medium text-slate-600" />
  </div>
);
