import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateWithImageProps = {
  title: string;
  description?: string;
  imageSrc?: string;
  imageAlt?: string;
  action?: ReactNode;
  className?: string;
};

type CountWithFallbackProps = {
  value: number | null | undefined;
  formatter?: (value: number) => string;
  zeroLabel?: string;
  imageSrc?: string;
  className?: string;
};

const defaultImage = "/placeholder.svg";

export const isEmptyCountValue = (value: number | null | undefined) =>
  !Number.isFinite(Number(value ?? 0)) || Number(value ?? 0) <= 0;

export const EmptyStateWithImage = ({
  title,
  description,
  imageSrc = defaultImage,
  imageAlt = "No data available",
  action,
  className,
}: EmptyStateWithImageProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-8 text-center",
      className
    )}
  >
    <img
      src={imageSrc}
      alt={imageAlt}
      loading="lazy"
      className="mb-3 h-12 w-12 rounded object-cover opacity-80"
    />
    <p className="text-sm font-semibold text-slate-700">{title}</p>
    {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const CountWithFallback = ({
  value,
  formatter,
  zeroLabel = "No data",
  imageSrc = defaultImage,
  className,
}: CountWithFallbackProps) => {
  if (!isEmptyCountValue(value)) {
    const normalized = Number(value);
    return (
      <span className={className}>
        {formatter ? formatter(normalized) : normalized.toLocaleString()}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-slate-500", className)}>
      <img src={imageSrc} alt="" aria-hidden className="h-4 w-4 rounded object-cover opacity-80" />
      <span>{zeroLabel}</span>
    </span>
  );
};
