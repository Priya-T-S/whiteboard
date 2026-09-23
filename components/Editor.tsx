"use client";

import { nanoid } from "nanoid";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SlideCanvas, { type CanvasStyle, type Tool } from "./SlideCanvas";
import Thumb from "./Thumb";
import { exportDeckToPdf } from "@/lib/exportPdf";
import { importerFor } from "@/lib/importers";
import { emptySlide, type Deck, type Slide, type SlideElement } from "@/lib/types";

const TOOLS: { id: Tool; label: string; key: string; glyph: string }[] = [
  { id: "pen", label: "Pen", key: "P", glyph: "✎" },
  { id: "eraser", label: "Eraser", key: "E", glyph: "⌫" },
  { id: "select", label: "Select", key: "V", glyph: "⬈" },
  { id: "rect", label: "Rectangle", key: "R", glyph: "▭" },
  { id: "ellipse", label: "Ellipse", key: "O", glyph: "◯" },
  { id: "line", label: "Line", key: "L", glyph: "╱" },
  { id: "arrow", label: "Arrow", key: "A", glyph: "→" },
  { id: "text", label: "Text", key: "T", glyph: "T" },
];

const COLORS = ["#111827", "#ef4444", "#2563eb", "#16a34a", "#f59e0b", "#a855f7", "#ffffff"];
const WIDTHS = [3, 6, 12, 24];
const SAVE_DEBOUNCE_MS = 700;

type Props = { deck: Deck; slides: Slide[] };

type History = { past: SlideElement[][]; future: SlideElement[][] };

export default function Editor({ deck, slides: initialSlides }: Props) {
  const [slides, setSlides] = useState<Slide[]>(initialSlides);
  const [idx, setIdx] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [penArmed, setPenArmed] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [presenting, setPresenting] = useState(false);
  const [title, setTitle] = useState(deck.title);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [style, setStyle] = useState<CanvasStyle>({
    color: "#111827",
    width: 6,
    fill: null,
    fontSize: 48,
  });

  const history = useRef<Map<string, History>>(new Map());
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dragSlide = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Slide id -> last body we tried to save, cleared once the server confirms. */
  const pending = useRef<Map<string, string>>(new Map());

  const slide = slides[idx];
  // Holding Shift always gives a plain pointer, whatever tool is selected.
  const effectiveTool: Tool = shiftHeld ? "select" : tool;

  /* ---------------------------------------------------------------- saving */

  const queueSave = useCallback((slideId: string, elements: SlideElement[], background: string) => {
    const timers = saveTimers.current;
    const existing = timers.get(slideId);
    if (existing) clearTimeout(existing);
    const body = JSON.stringify({ elements, background });
    pending.current.set(slideId, body);
    setSaveState("saving");
    timers.set(
      slideId,
      setTimeout(async () => {
        timers.delete(slideId);
        try {
          const res = await fetch(`/api/slides/${slideId}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body,
          });
          if (res.ok && pending.current.get(slideId) === body) pending.current.delete(slideId);
          setSaveState(res.ok ? "saved" : "error");
        } catch {
          setSaveState("error");
        }
      }, SAVE_DEBOUNCE_MS),
    );
  }, []);

  // Closing the tab mid-debounce would otherwise drop the last few strokes.
  useEffect(() => {
    const flush = () => {
      for (const [slideId, body] of pending.current) {
        navigator.sendBeacon(`/api/slides/${slideId}`, new Blob([body], { type: "application/json" }));
      }
      pending.current.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // State updaters must stay pure (StrictMode runs them twice), so the ref is
  // the source of truth for reads and every mutation goes through here.
  const slidesRef = useRef(slides);
  const commitSlides = useCallback((next: Slide[]) => {
    slidesRef.current = next;
    setSlides(next);
  }, []);

  const applyElements = useCallback(
    (slideId: string, elements: SlideElement[], commit: boolean) => {
      const current = slidesRef.current.find((s) => s.id === slideId);
      if (!current) return;
      if (commit) {
        const h = history.current.get(slideId) ?? { past: [], future: [] };
        h.past = [...h.past.slice(-49), current.content.elements];
        h.future = [];
        history.current.set(slideId, h);
      }
      commitSlides(
        slidesRef.current.map((s) => (s.id === slideId ? { ...s, content: { ...s.content, elements } } : s)),
      );
      queueSave(slideId, elements, current.content.background);
    },
    [commitSlides, queueSave],
  );

  const setBackground = useCallback(
    (slideId: string, background: string) => {
      const current = slidesRef.current.find((s) => s.id === slideId);
      if (!current) return;
      commitSlides(
        slidesRef.current.map((s) => (s.id === slideId ? { ...s, content: { ...s.content, background } } : s)),
      );
      queueSave(slideId, current.content.elements, background);
    },
    [commitSlides, queueSave],
  );

  const onCanvasChange = useCallback(
    (elements: SlideElement[], commit: boolean) => {
      if (!slide) return;
      applyElements(slide.id, elements, commit);
    },
    [applyElements, slide],
  );

  /* -------------------------------------------------------------- history */

  const undo = useCallback(() => {
    if (!slide) return;
    const h = history.current.get(slide.id);
    if (!h || h.past.length === 0) return;
    const prevElements = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [slide.content.elements, ...h.future].slice(0, 50);
    setSelection([]);
    applyElements(slide.id, prevElements, false);
  }, [applyElements, slide]);

  const redo = useCallback(() => {
    if (!slide) return;
    const h = history.current.get(slide.id);
    if (!h || h.future.length === 0) return;
    const nextElements = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, slide.content.elements];
    setSelection([]);
    applyElements(slide.id, nextElements, false);
  }, [applyElements, slide]);

  /* --------------------------------------------------------- slide actions */

  const goto = useCallback(
    (n: number) => {
      setIdx((cur) => {
        const next = Math.max(0, Math.min(slides.length - 1, n));
        if (next !== cur) setSelection([]);
        return next;
      });
    },
    [slides.length],
  );

  const addSlide = useCallback(
    async (duplicate = false) => {
      const content = duplicate && slide ? structuredClone(slide.content) : emptySlide();
      if (duplicate) {
        // Fresh ids, so undo history and hit-testing stay per-slide.
        content.elements = content.elements.map((el) => ({ ...el, id: nanoid(10) }));
      }
      const res = await fetch(`/api/decks/${deck.id}/slides`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ afterIdx: idx, content }),
      });
      const created: Slide = await res.json();
      const next = [...slidesRef.current];
      next.splice(idx + 1, 0, { ...created, content });
      commitSlides(next.map((s, i) => ({ ...s, idx: i })));
      setSelection([]);
      setIdx(idx + 1);
    },
    [commitSlides, deck.id, idx, slide],
  );

  const removeSlide = useCallback(async () => {
    if (!slide || slides.length <= 1) return;
    const res = await fetch(`/api/slides/${slide.id}`, { method: "DELETE" });
    if (!res.ok) return;
    commitSlides(slidesRef.current.filter((s) => s.id !== slide.id).map((s, i) => ({ ...s, idx: i })));
    setIdx((cur) => Math.max(0, cur - 1));
    setSelection([]);
  }, [commitSlides, slide, slides.length]);

  const moveSlide = useCallback(
    async (from: number, to: number) => {
      if (from === to || to < 0 || to >= slides.length) return;
      const next = [...slides];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const renumbered = next.map((s, i) => ({ ...s, idx: i }));
      commitSlides(renumbered);
      setIdx(to);
      await fetch(`/api/decks/${deck.id}/slides`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: renumbered.map((s) => s.id) }),
      });
    },
    [commitSlides, deck.id, slides],
  );

  /* ------------------------------------------------------- import / export */

  const importFile = useCallback(
    async (file: File) => {
      const run = importerFor(file);
      if (!run) {
        window.alert("Import understands .pdf and .docx files.");
        return;
      }
      try {
        setBusy({ label: "Reading file", done: 0, total: 1 });
        const pages = await run(deck.id, file, (done, total, label) => setBusy({ label, done, total }));
        if (pages.length === 0) return;

        // A brand-new deck opens on one blank slide; reuse it for page 1 rather
        // than leaving an empty sheet in front of the document.
        const reuseBlank =
          slidesRef.current.length === 1 && slidesRef.current[0].content.elements.length === 0;
        let cursor = reuseBlank ? 0 : idx;
        let start = 0;
        if (reuseBlank) {
          applyElements(slidesRef.current[0].id, pages[0].elements, true);
          start = 1;
        }

        for (let i = start; i < pages.length; i++) {
          setBusy({ label: "Adding slides", done: i, total: pages.length });
          const res = await fetch(`/api/decks/${deck.id}/slides`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ afterIdx: cursor, content: pages[i] }),
          });
          if (!res.ok) throw new Error("could not add slide");
          const created: Slide = await res.json();
          const next = [...slidesRef.current];
          next.splice(cursor + 1, 0, { ...created, content: pages[i] });
          commitSlides(next.map((s, k) => ({ ...s, idx: k })));
          cursor++;
        }
        setSelection([]);
        setIdx(cursor);
      } catch (err) {
        window.alert(`Import failed: ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [applyElements, commitSlides, deck.id, idx],
  );

  const exportPdf = useCallback(async () => {
    try {
      setBusy({ label: "Exporting PDF", done: 0, total: slidesRef.current.length });
      await exportDeckToPdf(title, slidesRef.current, (done, total) =>
        setBusy({ label: "Exporting PDF", done, total }),
      );
    } catch (err) {
      window.alert(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [title]);

  const deleteSelection = useCallback(() => {
    if (!slide || selection.length === 0) return;
    applyElements(slide.id, slide.content.elements.filter((el) => !selection.includes(el.id)), true);
    setSelection([]);
  }, [applyElements, selection, slide]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!slide || selection.length === 0) return false;
      applyElements(
        slide.id,
        slide.content.elements.map((el) =>
          selection.includes(el.id)
            ? el.type === "stroke"
              ? { ...el, points: el.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) }
              : el.type === "text" || el.type === "image"
                ? { ...el, x: el.x + dx, y: el.y + dy }
                : { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy }
            : el,
        ),
        true,
      );
      return true;
    },
    [applyElements, selection, slide],
  );

  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    // Only text entry should swallow shortcuts. A focused file button must not
    // stop Space from arming the pen.
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable ||
        t.tagName === "TEXTAREA" ||
        (t instanceof HTMLInputElement && !["file", "button", "checkbox", "radio", "range"].includes(t.type)));

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftHeld(true);
      if (isTyping(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (e.code === "Space") {
        // The pen toggle: armed means bare movement draws.
        e.preventDefault();
        setTool("pen");
        setPenArmed((v) => !v);
        setSelection([]);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key === "Enter") {
        e.preventDefault();
        void addSlide(false);
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void addSlide(true);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection.length > 0) {
          e.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (e.key === "Escape") {
        if (presenting) setPresenting(false);
        else if (penArmed) setPenArmed(false);
        else setSelection([]);
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        setPresenting((v) => !v);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        const step = e.shiftKey ? 40 : 8;
        const d =
          e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
        if (selection.length > 0 && nudge(d[0], d[1])) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        goto(idx + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1));
        return;
      }
      if (e.key === "PageUp") return goto(idx - 1);
      if (e.key === "PageDown") return goto(idx + 1);

      if (!mod) {
        const hit = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
        if (hit) {
          setTool(hit.id);
          if (hit.id !== "pen") setPenArmed(false);
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftHeld(false);
    }
    function onBlur() {
      setShiftHeld(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [addSlide, deleteSelection, goto, idx, nudge, penArmed, presenting, redo, selection.length, undo]);

  /* ---------------------------------------------------------- image paste */

  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.type.startsWith("image/"))
        ?.getAsFile();
      if (!file || !slide) return;
      e.preventDefault();
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 900 / bitmap.width, 600 / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      bitmap.close();

      // Upload to the asset table so the slide JSON stays small; fall back to
      // an inline data URL for formats the endpoint will not take.
      let src: string;
      const up = await fetch(`/api/decks/${deck.id}/assets`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      if (up.ok) {
        src = (await up.json()).src;
      } else {
        src = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(file);
        });
      }

      applyElements(
        slide.id,
        [
          ...slide.content.elements,
          { id: nanoid(10), type: "image", src, x: (1920 - w) / 2, y: (1080 - h) / 2, w, h },
        ],
        true,
      );
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [applyElements, deck.id, slide]);

  /* ----------------------------------------------------------- deck title */

  async function saveTitle(next: string) {
    const clean = next.trim();
    if (!clean || clean === deck.title) return;
    await fetch(`/api/decks/${deck.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: clean }),
    });
  }

  const canUndo = useMemo(() => (slide ? (history.current.get(slide.id)?.past.length ?? 0) > 0 : false), [slide, slides]);
  const canRedo = useMemo(() => (slide ? (history.current.get(slide.id)?.future.length ?? 0) > 0 : false), [slide, slides]);

  if (!slide) return null;

  /* ------------------------------------------------------------ presenting */

  if (presenting) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="min-h-0 flex-1 p-2">
          <SlideCanvas
            content={slide.content}
            tool={effectiveTool}
            penArmed={penArmed}
            style={style}
            selection={selection}
            onSelection={setSelection}
            onChange={onCanvasChange}
          />
        </div>
        <div className="flex items-center justify-center gap-4 pb-3 text-xs text-white/40">
          <button onClick={() => goto(idx - 1)} className="rounded px-2 py-1 hover:bg-white/10">
            ←
          </button>
          <span>
            {idx + 1} / {slides.length}
          </span>
          <button onClick={() => goto(idx + 1)} className="rounded px-2 py-1 hover:bg-white/10">
            →
          </button>
          <span className="ml-6">Space = pen {penArmed ? "ON" : "off"} · Shift = pointer · Esc to exit</span>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- editing */

  return (
    <div className="flex h-screen flex-col">
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-80 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
            <div className="text-sm font-medium">{busy.label}</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
              <div
                className="h-full bg-[var(--accent)] transition-[width]"
                style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-[var(--muted)]">
              {busy.done} / {busy.total}
            </div>
          </div>
        </div>
      )}
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← Decks
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => saveTitle(e.target.value)}
          className="w-64 rounded-md bg-transparent px-2 py-1 text-sm font-medium outline-none hover:bg-[var(--panel-2)] focus:bg-[var(--panel-2)]"
        />
        <span className="text-xs text-[var(--muted)]">
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <PenBadge armed={penArmed} shift={shiftHeld} />
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              e.target.blur();
              if (file) void importFile(file);
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--panel-2)] disabled:opacity-40"
          >
            Import PDF / Word
          </button>
          <button
            onClick={() => void exportPdf()}
            disabled={busy !== null}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--panel-2)] disabled:opacity-40"
          >
            Export PDF
          </button>
          <button
            onClick={() => setPresenting(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--panel-2)]"
          >
            Present
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Slide strip */}
        <aside className="flex w-[200px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ul className="space-y-2">
              {slides.map((s, i) => (
                <li
                  key={s.id}
                  draggable
                  onDragStart={() => (dragSlide.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragSlide.current !== null) void moveSlide(dragSlide.current, i);
                    dragSlide.current = null;
                  }}
                  onClick={() => goto(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-1 ${
                    i === idx ? "border-[var(--accent)] bg-[var(--panel-2)]" : "border-transparent hover:bg-[var(--panel-2)]"
                  }`}
                >
                  <span className="w-4 text-right text-[10px] text-[var(--muted)]">{i + 1}</span>
                  <Thumb content={s.content} w={150} />
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-3 gap-1 border-t border-[var(--border)] p-2 text-xs">
            <button onClick={() => void addSlide(false)} className="rounded bg-[var(--panel-2)] py-1.5 hover:bg-[var(--border)]">
              Add
            </button>
            <button onClick={() => void addSlide(true)} className="rounded bg-[var(--panel-2)] py-1.5 hover:bg-[var(--border)]">
              Copy
            </button>
            <button
              onClick={() => void removeSlide()}
              disabled={slides.length <= 1}
              className="rounded bg-[var(--panel-2)] py-1.5 hover:bg-[var(--border)] disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </aside>

        {/* Canvas */}
        <main className="min-w-0 flex-1 bg-[#0e1016] p-6">
          <SlideCanvas
            content={slide.content}
            tool={effectiveTool}
            penArmed={penArmed && !shiftHeld}
            style={style}
            selection={selection}
            onSelection={setSelection}
            onChange={onCanvasChange}
          />
        </main>

        {/* Tools */}
        <aside className="w-[188px] shrink-0 space-y-5 overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] p-3">
          <div className="grid grid-cols-4 gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                title={`${t.label} (${t.key})`}
                onClick={() => {
                  setTool(t.id);
                  if (t.id !== "pen") setPenArmed(false);
                }}
                className={`aspect-square rounded-md text-base ${
                  effectiveTool === t.id ? "bg-[var(--accent)] text-white" : "bg-[var(--panel-2)] hover:bg-[var(--border)]"
                }`}
              >
                {t.glyph}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setTool("pen");
              setPenArmed((v) => !v);
            }}
            className={`w-full rounded-md px-3 py-2 text-xs font-medium ${
              penArmed ? "bg-red-500 text-white" : "bg-[var(--panel-2)] hover:bg-[var(--border)]"
            }`}
          >
            {penArmed ? "Pen armed — Space to stop" : "Arm pen (Space)"}
          </button>

          <Section label="Color">
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setStyle((s) => ({ ...s, color: c }))}
                  style={{ background: c }}
                  className={`h-6 w-6 rounded-full border-2 ${
                    style.color === c ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                />
              ))}
            </div>
          </Section>

          <Section label="Stroke">
            <div className="flex gap-1.5">
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => setStyle((s) => ({ ...s, width: w }))}
                  className={`flex h-8 flex-1 items-center justify-center rounded-md ${
                    style.width === w ? "bg-[var(--accent)]" : "bg-[var(--panel-2)] hover:bg-[var(--border)]"
                  }`}
                >
                  <span className="block rounded-full bg-white" style={{ width: w / 1.5 + 3, height: w / 1.5 + 3 }} />
                </button>
              ))}
            </div>
          </Section>

          <Section label="Shape fill">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setStyle((s) => ({ ...s, fill: null }))}
                className={`h-6 w-6 rounded-full border-2 bg-[var(--panel-2)] text-[10px] ${
                  style.fill === null ? "border-[var(--accent)]" : "border-[var(--border)]"
                }`}
              >
                ∅
              </button>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setStyle((s) => ({ ...s, fill: c }))}
                  style={{ background: c }}
                  className={`h-6 w-6 rounded-full border-2 ${
                    style.fill === c ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                />
              ))}
            </div>
          </Section>

          <Section label={`Text size · ${style.fontSize}`}>
            <input
              type="range"
              min={16}
              max={140}
              value={style.fontSize}
              onChange={(e) => setStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))}
              className="w-full"
            />
          </Section>

          <Section label="Slide background">
            <div className="flex flex-wrap gap-1.5">
              {["#ffffff", "#111827", "#fef9c3", "#e0f2fe"].map((c) => (
                <button
                  key={c}
                  onClick={() => setBackground(slide.id, c)}
                  style={{ background: c }}
                  className={`h-6 w-6 rounded-md border-2 ${
                    slide.content.background === c ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                />
              ))}
            </div>
          </Section>

          <div className="flex gap-1.5">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="flex-1 rounded-md bg-[var(--panel-2)] py-1.5 text-xs hover:bg-[var(--border)] disabled:opacity-40"
            >
              Undo
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="flex-1 rounded-md bg-[var(--panel-2)] py-1.5 text-xs hover:bg-[var(--border)] disabled:opacity-40"
            >
              Redo
            </button>
          </div>

          <div className="space-y-1 border-t border-[var(--border)] pt-3 text-[11px] leading-relaxed text-[var(--muted)]">
            <div>
              <b className="text-[var(--text)]">Space</b> arm / disarm pen
            </div>
            <div>
              <b className="text-[var(--text)]">Shift</b> hold for pointer
            </div>
            <div>
              <b className="text-[var(--text)]">Alt</b> constrain shape
            </div>
            <div>
              <b className="text-[var(--text)]">F5</b> present · <b className="text-[var(--text)]">Esc</b> exit
            </div>
            <div>
              <b className="text-[var(--text)]">Ctrl+Enter</b> new slide
            </div>
            <div>Paste an image to drop it in</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      {children}
    </div>
  );
}

function PenBadge({ armed, shift }: { armed: boolean; shift: boolean }) {
  const label = shift ? "Pointer" : armed ? "Pen live" : "Pen off";
  const tone = shift ? "bg-[var(--accent)]" : armed ? "bg-red-500" : "bg-[var(--panel-2)] text-[var(--muted)]";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium text-white ${tone}`}>
      {label}
    </span>
  );
}
