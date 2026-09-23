import { SLIDE_H, SLIDE_W, type SlideContent, type SlideElement } from "./types";

const imageCache = new Map<string, HTMLImageElement>();

/** `asset:<id>` refs are served by the API; `data:` URLs load as-is. */
export function assetUrl(src: string) {
  return src.startsWith("asset:") ? `/api/assets/${src.slice(6)}` : src;
}

/** Images decode asynchronously; `onReady` lets the caller schedule a redraw. */
export function getImage(src: string, onReady?: () => void): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.onload = () => onReady?.();
  img.src = assetUrl(src);
  imageCache.set(src, img);
  return null;
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: SlideElement,
  onImageReady?: () => void,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (el.type) {
    case "stroke": {
      const p = el.points;
      if (p.length < 2) break;
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      if (p.length <= 4) {
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[p.length - 2], p[p.length - 1]);
      } else {
        // Quadratic curve through the midpoints of consecutive samples —
        // cheap smoothing that hides pointer jitter.
        ctx.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length - 2; i += 2) {
          const mx = (p[i] + p[i + 2]) / 2;
          const my = (p[i + 1] + p[i + 3]) / 2;
          ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
        }
        ctx.lineTo(p[p.length - 2], p[p.length - 1]);
      }
      ctx.stroke();
      break;
    }
    case "rect": {
      const x = Math.min(el.x1, el.x2);
      const y = Math.min(el.y1, el.y2);
      const w = Math.abs(el.x2 - el.x1);
      const h = Math.abs(el.y2 - el.y1);
      if (el.fill) {
        ctx.fillStyle = el.fill;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      const cx = (el.x1 + el.x2) / 2;
      const cy = (el.y1 + el.y2) / 2;
      const rx = Math.abs(el.x2 - el.x1) / 2;
      const ry = Math.abs(el.y2 - el.y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (el.fill) {
        ctx.fillStyle = el.fill;
        ctx.fill();
      }
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.stroke();
      break;
    }
    case "line":
    case "arrow": {
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      if (el.type === "arrow") {
        const a = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
        const len = Math.max(18, el.width * 4);
        const spread = Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(el.x2, el.y2);
        ctx.lineTo(el.x2 - len * Math.cos(a - spread), el.y2 - len * Math.sin(a - spread));
        ctx.lineTo(el.x2 - len * Math.cos(a + spread), el.y2 - len * Math.sin(a + spread));
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "text": {
      ctx.fillStyle = el.color;
      ctx.font = `${el.size}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
      ctx.textBaseline = "top";
      const lines = el.text.split("\n");
      lines.forEach((line, i) => ctx.fillText(line, el.x, el.y + i * el.size * 1.25));
      break;
    }
    case "image": {
      const img = getImage(el.src, onImageReady);
      if (img) ctx.drawImage(img, el.x, el.y, el.w, el.h);
      break;
    }
  }
  ctx.restore();
}

export function renderSlide(
  ctx: CanvasRenderingContext2D,
  content: SlideContent,
  onImageReady?: () => void,
) {
  ctx.fillStyle = content.background || "#ffffff";
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  for (const el of content.elements) drawElement(ctx, el, onImageReady);
}

/** Sets up a canvas so that drawing happens in slide coordinates at DPR sharpness. */
export function prepareCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(w / SLIDE_W, 0, 0, h / SLIDE_H, 0, 0);
  return ctx;
}
