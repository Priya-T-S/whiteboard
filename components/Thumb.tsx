"use client";

import { useEffect, useRef } from "react";
import { prepareCanvas, renderSlide } from "@/lib/render";
import type { SlideContent } from "@/lib/types";

export default function Thumb({ content, w = 160 }: { content: SlideContent; w?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h = (w * 9) / 16;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, w, h);
    renderSlide(ctx, content, () => {
      if (ref.current) renderSlide(prepareCanvas(ref.current, w, h), content);
    });
  }, [content, w, h]);

  return <canvas ref={ref} style={{ width: w, height: h }} className="block rounded-[3px]" />;
}
