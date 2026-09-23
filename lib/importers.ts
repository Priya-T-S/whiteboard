"use client";

import { nanoid } from "nanoid";
import { SLIDE_H, SLIDE_W, type ImageElement, type SlideContent } from "./types";

/** Rendered-page resolution relative to the slide. 1.5x keeps text crisp when
 *  you zoom in without ballooning what we store. */
const OVERSAMPLE = 1.5;
const JPEG_QUALITY = 0.82;

export type ImportProgress = (done: number, total: number, label: string) => void;

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas encode failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

async function uploadCanvas(deckId: string, canvas: HTMLCanvasElement): Promise<string> {
  const blob = await canvasToBlob(canvas);
  const res = await fetch(`/api/decks/${deckId}/assets`, {
    method: "POST",
    headers: { "content-type": blob.type },
    body: blob,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "upload failed");
  return (await res.json()).src as string;
}

/** Centres a page of the given aspect inside the slide, as a locked image. */
export function pageSlide(src: string, pageW: number, pageH: number): SlideContent {
  const scale = Math.min(SLIDE_W / pageW, SLIDE_H / pageH);
  const w = pageW * scale;
  const h = pageH * scale;
  const el: ImageElement = {
    id: nanoid(10),
    type: "image",
    locked: true,
    src,
    x: (SLIDE_W - w) / 2,
    y: (SLIDE_H - h) / 2,
    w,
    h,
  };
  return { background: "#ffffff", elements: [el] };
}

/* ----------------------------------------------------------------- PDF */

export async function importPdf(
  deckId: string,
  file: File,
  onProgress: ImportProgress,
): Promise<SlideContent[]> {
  const pdfjs = await import("pdfjs-dist");
  // The worker is copied into /public by scripts/copy-pdf-worker.mjs, which
  // keeps it out of the bundler's hands entirely.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages: SlideContent[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    onProgress(n - 1, doc.numPages, `Rendering page ${n} of ${doc.numPages}`);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const fit = Math.min(SLIDE_W / base.width, SLIDE_H / base.height);
    const viewport = page.getViewport({ scale: fit * OVERSAMPLE });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    pages.push(pageSlide(await uploadCanvas(deckId, canvas), base.width, base.height));
    page.cleanup();
  }

  await task.destroy();
  onProgress(doc.numPages, doc.numPages, "Done");
  return pages;
}

/* ---------------------------------------------------------------- DOCX */

// A4 at 96dpi. Word documents are laid out for paper, so we paginate the same way.
const PAGE_W = 794;
const PAGE_H = 1123;
const PAGE_PAD = 64;

/** Styles scoped to the offscreen pages. They also shield html2canvas from the
 *  app's own CSS, which it cannot always parse. */
const PAGE_CSS = `
.wb-page { width:${PAGE_W}px; min-height:${PAGE_H}px; padding:${PAGE_PAD}px;
  background:#ffffff; box-sizing:border-box; overflow:hidden; }
.wb-page, .wb-page * { color:#111827; background-color:transparent;
  border-color:#d1d5db; font-family:Georgia,"Times New Roman",serif;
  box-sizing:border-box; line-height:1.5; }
.wb-page h1 { font-size:30px; margin:0 0 16px; font-weight:700; }
.wb-page h2 { font-size:24px; margin:22px 0 10px; font-weight:700; }
.wb-page h3 { font-size:19px; margin:18px 0 8px; font-weight:700; }
.wb-page p, .wb-page li { font-size:16px; margin:0 0 12px; }
.wb-page ul, .wb-page ol { margin:0 0 12px; padding-left:28px; }
.wb-page table { border-collapse:collapse; width:100%; margin:0 0 12px; }
.wb-page td, .wb-page th { border:1px solid #d1d5db; padding:6px 8px; font-size:15px; }
.wb-page img { max-width:100%; height:auto; }
`;

export async function importDocx(
  deckId: string,
  file: File,
  onProgress: ImportProgress,
): Promise<SlideContent[]> {
  onProgress(0, 1, "Reading document");
  const [{ default: mammoth }, { default: html2canvas }] = await Promise.all([
    import("mammoth"),
    import("html2canvas"),
  ]);

  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;";
  const style = document.createElement("style");
  style.textContent = PAGE_CSS;
  host.appendChild(style);

  const source = document.createElement("div");
  source.className = "wb-page";
  source.innerHTML = html;
  host.appendChild(source);
  document.body.appendChild(host);

  try {
    await waitForImages(source);

    // Move block elements onto fresh pages whenever the current one overflows.
    const blocks = Array.from(source.children);
    const pageEls: HTMLElement[] = [];
    let page = newPage(host);
    pageEls.push(page);
    for (const block of blocks) {
      page.appendChild(block);
      if (page.scrollHeight > PAGE_H && page.children.length > 1) {
        page.removeChild(block);
        page = newPage(host);
        pageEls.push(page);
        page.appendChild(block);
      }
    }
    source.remove();

    const pages: SlideContent[] = [];
    for (const [i, el] of pageEls.entries()) {
      onProgress(i, pageEls.length, `Rendering page ${i + 1} of ${pageEls.length}`);
      const scale = (SLIDE_H / PAGE_H) * OVERSAMPLE;
      const canvas = await html2canvas(el, { scale, backgroundColor: "#ffffff", logging: false });
      pages.push(pageSlide(await uploadCanvas(deckId, canvas), PAGE_W, PAGE_H));
    }
    onProgress(pageEls.length, pageEls.length, "Done");
    return pages;
  } finally {
    host.remove();
  }
}

function newPage(host: HTMLElement) {
  const el = document.createElement("div");
  el.className = "wb-page";
  host.appendChild(el);
  return el;
}

/** html2canvas paints whatever is decoded at call time, so wait for the
 *  document's own images first. */
async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  );
}

export function importerFor(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return importPdf;
  if (name.endsWith(".docx")) return importDocx;
  return null;
}
