import type { SlideElement } from "./types";

export type Box = { x: number; y: number; w: number; h: number };

/** Rough text metrics without a canvas — good enough for hit boxes. */
function textBox(text: string, size: number, x: number, y: number): Box {
  const lines = text.split("\n");
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return { x, y, w: Math.max(size * 0.55 * longest, size), h: lines.length * size * 1.25 };
}

export function bounds(el: SlideElement): Box {
  switch (el.type) {
    case "stroke": {
      const p = el.points;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < p.length; i += 2) {
        minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
        minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
      }
      const pad = el.width / 2;
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case "rect":
    case "ellipse":
    case "line":
    case "arrow":
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        w: Math.abs(el.x2 - el.x1),
        h: Math.abs(el.y2 - el.y1),
      };
    case "text":
      return textBox(el.text, el.size, el.x, el.y);
    case "image":
      return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const inBox = (px: number, py: number, b: Box, pad = 0) =>
  px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;

export function hitTest(el: SlideElement, px: number, py: number, tolerance = 12): boolean {
  switch (el.type) {
    case "stroke": {
      const p = el.points;
      const t = tolerance + el.width / 2;
      if (p.length === 2) return Math.hypot(px - p[0], py - p[1]) <= t;
      for (let i = 0; i < p.length - 2; i += 2) {
        if (distToSegment(px, py, p[i], p[i + 1], p[i + 2], p[i + 3]) <= t) return true;
      }
      return false;
    }
    case "line":
    case "arrow":
      return distToSegment(px, py, el.x1, el.y1, el.x2, el.y2) <= tolerance + el.width / 2;
    case "rect": {
      const b = bounds(el);
      if (el.fill) return inBox(px, py, b);
      // Unfilled shapes are only grabbable by their outline, so you can click
      // through the middle of a big box to whatever is underneath.
      return inBox(px, py, b, tolerance) && !inBox(px, py, { x: b.x + tolerance, y: b.y + tolerance, w: b.w - tolerance * 2, h: b.h - tolerance * 2 });
    }
    case "ellipse": {
      const cx = (el.x1 + el.x2) / 2;
      const cy = (el.y1 + el.y2) / 2;
      const rx = Math.abs(el.x2 - el.x1) / 2 || 1;
      const ry = Math.abs(el.y2 - el.y1) / 2 || 1;
      const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
      if (el.fill) return d <= 1;
      const band = tolerance / Math.min(rx, ry);
      return d >= (1 - band) ** 2 && d <= (1 + band) ** 2;
    }
    case "text":
    case "image":
      return inBox(px, py, bounds(el));
  }
}

export function topmostAt(elements: SlideElement[], px: number, py: number): SlideElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (elements[i].locked) continue;
    if (hitTest(elements[i], px, py)) return elements[i];
  }
  return null;
}

export function boxesIntersect(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function translate(el: SlideElement, dx: number, dy: number): SlideElement {
  switch (el.type) {
    case "stroke":
      return { ...el, points: el.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    case "rect":
    case "ellipse":
    case "line":
    case "arrow":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "text":
    case "image":
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

export function unionBounds(els: SlideElement[]): Box | null {
  if (els.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of els) {
    const b = bounds(el);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
