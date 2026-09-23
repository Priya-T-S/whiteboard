"use client";

import { nanoid } from "nanoid";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { boxesIntersect, bounds, topmostAt, translate, unionBounds } from "@/lib/geometry";
import { drawElement, prepareCanvas } from "@/lib/render";
import {
  SLIDE_H,
  SLIDE_W,
  type ShapeElement,
  type ShapeKind,
  type SlideContent,
  type SlideElement,
  type StrokeElement,
  type TextElement,
} from "@/lib/types";

export type Tool = "pen" | "eraser" | "select" | ShapeKind | "text";

/** A stroke that has been idle this long is closed off, so the next movement
 *  starts a fresh stroke instead of connecting across the gap. */
const STROKE_IDLE_MS = 600;

export type CanvasStyle = {
  color: string;
  width: number;
  fill: string | null;
  fontSize: number;
};

type Props = {
  content: SlideContent;
  tool: Tool;
  penArmed: boolean;
  style: CanvasStyle;
  selection: string[];
  onSelection: (ids: string[]) => void;
  /** `commit` marks a finished gesture, which is what lands in undo history. */
  onChange: (elements: SlideElement[], commit: boolean) => void;
  readOnly?: boolean;
};

type Draft =
  | { kind: "stroke"; el: StrokeElement }
  | { kind: "shape"; el: ShapeElement }
  | null;

export default function SlideCanvas({
  content,
  tool,
  penArmed,
  style,
  selection,
  onSelection,
  onChange,
  readOnly = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const draftRef = useRef<Draft>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressing = useRef(false);
  const dragRef = useRef<{ ids: string[]; startX: number; startY: number; dx: number; dy: number } | null>(null);
  const marqueeRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const erasedRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);

  const [editing, setEditing] = useState<{ id: string | null; x: number; y: number; value: string } | null>(null);

  // Keep the canvas locked to 16:9 inside whatever space the parent gives it.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const scale = Math.min(width / SLIDE_W, height / SLIDE_H);
      setSize({ w: Math.max(1, SLIDE_W * scale), h: Math.max(1, SLIDE_H * scale) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const drawRef = useRef<() => void>(() => {});

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current();
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const ctx = prepareCanvas(canvas, size.w, size.h);
    const drag = dragRef.current;
    const dragging = drag !== null && (drag.dx !== 0 || drag.dy !== 0);

    ctx.fillStyle = content.background || "#ffffff";
    ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

    for (const el of content.elements) {
      if (erasedRef.current.has(el.id)) continue;
      const moved = dragging && drag.ids.includes(el.id) ? translate(el, drag.dx, drag.dy) : el;
      drawElement(ctx, moved, scheduleDraw);
    }

    if (draftRef.current) drawElement(ctx, draftRef.current.el, scheduleDraw);

    if (!readOnly && selection.length > 0) {
      const selected = content.elements
        .filter((e) => selection.includes(e.id))
        .map((e) => (dragging ? translate(e, drag.dx, drag.dy) : e));
      const box = unionBounds(selected);
      if (box) {
        ctx.save();
        ctx.strokeStyle = "#6c8cff";
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(box.x - 10, box.y - 10, box.w + 20, box.h + 20);
        ctx.restore();
      }
    }

    const m = marqueeRef.current;
    if (m) {
      ctx.save();
      ctx.strokeStyle = "#6c8cff";
      ctx.fillStyle = "rgba(108,140,255,0.12)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      const x = Math.min(m.x1, m.x2);
      const y = Math.min(m.y1, m.y2);
      ctx.fillRect(x, y, Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
      ctx.strokeRect(x, y, Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
      ctx.restore();
    }
  }, [content, selection, size, readOnly, scheduleDraw]);

  drawRef.current = draw;

  useEffect(() => {
    scheduleDraw();
  }, [draw, scheduleDraw]);

  const toSlide = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SLIDE_W,
      y: ((e.clientY - rect.top) / rect.height) * SLIDE_H,
    };
  };

  const endStroke = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    const d = draftRef.current;
    if (!d || d.kind !== "stroke") return;
    draftRef.current = null;
    if (d.el.points.length < 4) {
      scheduleDraw();
      return;
    }
    onChange([...content.elements, d.el], true);
    scheduleDraw();
  }, [content.elements, onChange, scheduleDraw]);

  const endStrokeRef = useRef(endStroke);
  endStrokeRef.current = endStroke;

  // Disarming the pen (or Shift switching to the pointer) closes the stroke,
  // so the next armed movement begins a new one.
  useEffect(() => {
    if (!penArmed || tool !== "pen") endStrokeRef.current();
  }, [penArmed, tool]);

  const appendPoint = (x: number, y: number) => {
    const d = draftRef.current;
    if (d && d.kind === "stroke") {
      const p = d.el.points;
      const lx = p[p.length - 2];
      const ly = p[p.length - 1];
      if (Math.hypot(x - lx, y - ly) < 1.2) return;
      p.push(x, y);
    } else {
      draftRef.current = {
        kind: "stroke",
        el: { id: nanoid(10), type: "stroke", color: style.color, width: style.width, points: [x, y] },
      };
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => endStrokeRef.current(), STROKE_IDLE_MS);
    scheduleDraw();
  };

  const eraseAt = (x: number, y: number) => {
    const hit = topmostAt(content.elements, x, y);
    if (hit && !erasedRef.current.has(hit.id)) {
      erasedRef.current.add(hit.id);
      scheduleDraw();
    }
  };

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly || editing) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    pressing.current = true;
    const { x, y } = toSlide(e);

    if (tool === "pen") {
      endStroke();
      appendPoint(x, y);
      return;
    }
    if (tool === "eraser") {
      erasedRef.current = new Set();
      eraseAt(x, y);
      return;
    }
    if (tool === "text") {
      setEditing({ id: null, x, y, value: "" });
      pressing.current = false;
      return;
    }
    if (tool === "select") {
      const hit = topmostAt(content.elements, x, y);
      if (hit) {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        const ids = selection.includes(hit.id) ? selection : additive ? [...selection, hit.id] : [hit.id];
        if (ids !== selection) onSelection(ids);
        dragRef.current = { ids, startX: x, startY: y, dx: 0, dy: 0 };
      } else {
        onSelection([]);
        marqueeRef.current = { x1: x, y1: y, x2: x, y2: y };
      }
      scheduleDraw();
      return;
    }
    draftRef.current = {
      kind: "shape",
      el: {
        id: nanoid(10),
        type: tool,
        color: style.color,
        width: style.width,
        fill: tool === "line" || tool === "arrow" ? null : style.fill,
        x1: x,
        y1: y,
        x2: x,
        y2: y,
      },
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly || editing) return;
    const { x, y } = toSlide(e);

    if (dragRef.current) {
      dragRef.current.dx = x - dragRef.current.startX;
      dragRef.current.dy = y - dragRef.current.startY;
      scheduleDraw();
      return;
    }
    if (marqueeRef.current) {
      marqueeRef.current.x2 = x;
      marqueeRef.current.y2 = y;
      scheduleDraw();
      return;
    }
    if (tool === "pen") {
      // The heart of the pen protocol: with the pen armed, plain movement
      // draws - no button, no contact required. A press draws too, so a mouse
      // or trackpad drag still works while the pen is disarmed.
      if (penArmed || pressing.current) appendPoint(x, y);
      return;
    }
    if (tool === "eraser" && pressing.current) {
      eraseAt(x, y);
      return;
    }
    const d = draftRef.current;
    if (d && d.kind === "shape" && pressing.current) {
      let nx = x;
      let ny = y;
      if (e.altKey) {
        // Alt constrains to a square / circle / 45-degree line.
        const s = Math.max(Math.abs(x - d.el.x1), Math.abs(y - d.el.y1));
        nx = d.el.x1 + Math.sign(x - d.el.x1) * s;
        ny = d.el.y1 + Math.sign(y - d.el.y1) * s;
      }
      d.el.x2 = nx;
      d.el.y2 = ny;
      scheduleDraw();
    }
  }

  function onPointerUp() {
    if (readOnly) return;
    pressing.current = false;

    if (dragRef.current) {
      const { ids, dx, dy } = dragRef.current;
      dragRef.current = null;
      if (dx !== 0 || dy !== 0) {
        onChange(
          content.elements.map((el) => (ids.includes(el.id) ? translate(el, dx, dy) : el)),
          true,
        );
      }
      scheduleDraw();
      return;
    }
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      marqueeRef.current = null;
      const box = {
        x: Math.min(m.x1, m.x2),
        y: Math.min(m.y1, m.y2),
        w: Math.abs(m.x2 - m.x1),
        h: Math.abs(m.y2 - m.y1),
      };
      if (box.w > 6 || box.h > 6) {
        onSelection(content.elements.filter((el) => boxesIntersect(bounds(el), box)).map((el) => el.id));
      }
      scheduleDraw();
      return;
    }
    if (erasedRef.current.size > 0) {
      const gone = erasedRef.current;
      erasedRef.current = new Set();
      onChange(
        content.elements.filter((el) => !gone.has(el.id)),
        true,
      );
      return;
    }
    const d = draftRef.current;
    if (d && d.kind === "shape") {
      draftRef.current = null;
      if (Math.abs(d.el.x2 - d.el.x1) > 4 || Math.abs(d.el.y2 - d.el.y1) > 4) {
        onChange([...content.elements, d.el], true);
      }
      scheduleDraw();
      return;
    }
    // A stroke drawn by pressing ends on release; an armed stroke keeps going
    // until the pen is disarmed, Shift is held, or it goes idle.
    if (d && d.kind === "stroke" && !penArmed) endStroke();
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    const { x, y } = toSlide(e);
    const hit = topmostAt(content.elements, x, y);
    if (hit && hit.type === "text") {
      setEditing({ id: hit.id, x: hit.x, y: hit.y, value: hit.text });
      onSelection([]);
    }
  }

  function commitText() {
    if (!editing) return;
    const value = editing.value.replace(/\s+$/, "");
    const rest = content.elements.filter((el) => el.id !== editing.id);
    if (!value.trim()) {
      if (editing.id) onChange(rest, true);
    } else {
      const el: TextElement = {
        id: editing.id ?? nanoid(10),
        type: "text",
        color: style.color,
        size: style.fontSize,
        x: editing.x,
        y: editing.y,
        text: value,
      };
      onChange([...rest, el], true);
    }
    setEditing(null);
  }

  const scale = size.w / SLIDE_W || 1;
  const cursor =
    tool === "select" ? "default" : tool === "pen" && penArmed ? "crosshair" : tool === "text" ? "text" : "crosshair";

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center">
      <div className="relative shadow-2xl" style={{ width: size.w, height: size.h }}>
        <canvas
          ref={canvasRef}
          className="canvas-surface block rounded-sm"
          style={{ width: size.w, height: size.h, cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        />
        {editing && (
          <textarea
            autoFocus
            value={editing.value}
            onChange={(ev) => setEditing({ ...editing, value: ev.target.value })}
            onBlur={commitText}
            onKeyDown={(ev) => {
              ev.stopPropagation();
              if (ev.key === "Escape") {
                ev.preventDefault();
                commitText();
              }
            }}
            className="absolute resize-none border border-[var(--accent)] bg-white/90 p-0 leading-[1.25] outline-none"
            style={{
              left: editing.x * scale,
              top: editing.y * scale,
              fontSize: style.fontSize * scale,
              minWidth: 200 * scale,
              minHeight: style.fontSize * 1.3 * scale,
              color: style.color,
            }}
          />
        )}
      </div>
    </div>
  );
}
