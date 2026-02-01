import React, { useEffect, useMemo, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface WalkingProgressProps {
  value: number; // 0 - 100
  fromValue?: number; // optional starting value (used on first mount)
  className?: string;
  height?: number; // px height for the bar area
  animateOnChange?: boolean; // when value increases, animate man + slow fill
}

export default function WalkingProgress({
  value,
  fromValue,
  className,
  height = 12,
  animateOnChange = true,
}: WalkingProgressProps) {
  const clamped = Math.min(100, Math.max(0, value ?? 0));
  const startRef = useRef(true);
  const prevRef = useRef(
    fromValue != null ? Math.min(100, Math.max(0, fromValue)) : clamped,
  );
  const [displayValue, setDisplayValue] = useState(prevRef.current);
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;

    // If first mount and fromValue provided, animate to current value
    if (startRef.current) {
      startRef.current = false;
      if (prev !== clamped) {
        // animate even if animateOnChange is false on first paint
        const durationMs = 1200;
        const start = performance.now();
        const delta = clamped - prev;
        setWalking(delta > 0);
        let raf = 0;
        const tick = (t: number) => {
          const elapsed = t - start;
          const p = Math.min(1, Math.max(0, elapsed / durationMs));
          const eased = 0.2 + 0.8 * (1 - Math.pow(1 - p, 2));
          const next = prev + delta * eased;
          setDisplayValue(next);
          if (p < 1) raf = requestAnimationFrame(tick);
          else {
            setWalking(false);
            prevRef.current = clamped;
          }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      } else {
        setDisplayValue(clamped);
        setWalking(false);
        prevRef.current = clamped;
        return;
      }
    }

    if (!animateOnChange) {
      setDisplayValue(clamped);
      setWalking(false);
      prevRef.current = clamped;
      return;
    }

    if (clamped === prev) return;

    const durationMs = 1200; // slow, as requested
    const start = performance.now();
    const delta = clamped - prev;

    setWalking(delta > 0);

    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = 0.2 + 0.8 * (1 - Math.pow(1 - p, 2)); // easeOutQuad, slightly delayed start
      const next = prev + delta * eased;
      setDisplayValue(next);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setWalking(false);
        prevRef.current = clamped;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clamped, animateOnChange]);

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2">
        {/* The bar with fill */}
        <div className="relative flex-1" style={{ height }}>
          <Progress value={displayValue} className="h-full" />
        </div>
      </div>
    </div>
  );
}
