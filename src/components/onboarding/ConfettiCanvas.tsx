import React, { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  r: number;
  c: string;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  a: number; // alpha
};

type Mode = "rain" | "blast";

type Props = {
  duration?: number;
  direction?: "down" | "up"; // kept for backwards compatibility with rain
  mode?: Mode;
  origin?: { x: number; y: number } | null; // canvas coords; if null, auto-center
};

export default function ConfettiCanvas({
  duration = 2500,
  direction = "down",
  mode = "rain",
  origin = null,
}: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const colors = ["#10B981", "#38BDF8", "#F59E0B", "#0EA5E9"];

    const parts: Particle[] = [];

    if (mode === "blast") {
      const count = 180;
      const cx = origin?.x ?? canvas.clientWidth / 2;
      const cy = origin?.y ?? canvas.clientHeight * 0.6;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 6; // strong burst
        parts.push({
          x: cx,
          y: cy,
          r: 4 + Math.random() * 6,
          c: colors[(Math.random() * colors.length) | 0],
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5, // slight upward bias
          rot: Math.random() * Math.PI,
          vr: -0.25 + Math.random() * 0.5,
          a: 1,
        });
      }
    } else {
      const isUp = direction === "up";
      for (let i = 0; i < 120; i++) {
        parts.push({
          x: Math.random() * canvas.clientWidth,
          y: isUp
            ? canvas.clientHeight + 20 + Math.random() * 60
            : -20 - Math.random() * 60,
          r: 6 + Math.random() * 6,
          c: colors[(Math.random() * colors.length) | 0],
          vx: -1 + Math.random() * 2,
          vy: isUp ? -(2 + Math.random() * 2) : 2 + Math.random() * 2,
          rot: Math.random() * Math.PI,
          vr: -0.1 + Math.random() * 0.2,
          a: 1,
        });
      }
    }

    let start = performance.now();
    let raf = 0;

    const gravity = mode === "blast" ? 0.15 : 0;
    const drag = mode === "blast" ? 0.985 : 1;

    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      parts.forEach((p) => {
        // physics
        p.vx *= drag;
        p.vy = p.vy * drag + gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;

        // wrap for rain; let blast fall off-screen
        if (mode === "rain") {
          if (direction === "up") {
            if (p.y < -20) p.y = canvas.clientHeight + 20;
          } else {
            if (p.y > canvas.clientHeight + 20) p.y = -20;
          }
        }

        // fade out near end
        if (elapsed > duration * 0.6 && p.a > 0) {
          p.a = Math.max(0, p.a - 0.02);
        }

        // draw
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.a === 1 ? p.c : withAlpha(p.c, p.a);
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
        ctx.restore();
      });

      if (elapsed < duration) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, [duration, direction, mode, origin?.x, origin?.y]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

function withAlpha(hex: string, a: number) {
  // hex like #RRGGBB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
