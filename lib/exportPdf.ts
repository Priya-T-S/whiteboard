"use client";

import { assetUrl, renderSlide } from "./render";
import { SLIDE_H, SLIDE_W, type SlideContent } from "./types";

/** Every image on the slide must be decoded before we paint to an offscreen
 *  canvas - unlike the live editor, there is no second frame to catch up on. */
async function preloadImages(content: SlideContent) {
  const srcs = content.elements.filter((el) => el.type === "image").map((el) => el.src);
  await Promise.all(
    srcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = assetUrl(src);
        }),
    ),
  );
}

export async function exportDeckToPdf(
  title: string,
  slides: { content: SlideContent }[],
  onProgress?: (done: number, total: number) => void,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "px", format: [SLIDE_W, SLIDE_H] });

  const canvas = document.createElement("canvas");
  canvas.width = SLIDE_W;
  canvas.height = SLIDE_H;
  const ctx = canvas.getContext("2d")!;

  for (const [i, slide] of slides.entries()) {
    onProgress?.(i, slides.length);
    await preloadImages(slide.content);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SLIDE_W, SLIDE_H);
    renderSlide(ctx, slide.content);
    if (i > 0) doc.addPage([SLIDE_W, SLIDE_H], "landscape");
    doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, SLIDE_W, SLIDE_H);
  }

  onProgress?.(slides.length, slides.length);
  doc.save(`${title.replace(/[^\w\-. ]+/g, "_") || "whiteboard"}.pdf`);
}
