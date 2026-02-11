import { useEffect, useRef, useState } from "react";

interface Bounds {
  width: number;
  height: number;
}

export const useMeasure = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBounds({ width, height });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, bounds };
};
