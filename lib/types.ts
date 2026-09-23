/** Logical slide coordinate space. Everything is stored in these units and
 *  scaled to whatever size the canvas happens to be on screen. */
export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

/** `locked` elements are skipped by select and erase - imported PDF/Word
 *  pages use it so you can draw over them without dragging them around. */
export type ElementBase = { id: string; locked?: boolean };

export type StrokeElement = ElementBase & {
  type: "stroke";
  color: string;
  width: number;
  /** Flat [x0, y0, x1, y1, ...] — cheaper to store and to JSON round-trip. */
  points: number[];
};

export type ShapeKind = "rect" | "ellipse" | "line" | "arrow";

export type ShapeElement = ElementBase & {
  type: ShapeKind;
  color: string;
  width: number;
  fill: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TextElement = ElementBase & {
  type: "text";
  color: string;
  size: number;
  x: number;
  y: number;
  text: string;
};

export type ImageElement = ElementBase & {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Either `asset:<id>` (stored in the assets table) or a `data:` URL. */
  src: string;
};

export type SlideElement =
  | StrokeElement
  | ShapeElement
  | TextElement
  | ImageElement;

export type SlideContent = {
  elements: SlideElement[];
  background: string;
};

export type Slide = {
  id: string;
  deckId: string;
  idx: number;
  content: SlideContent;
};

export type Deck = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  slideCount?: number;
};

export const emptySlide = (): SlideContent => ({
  elements: [],
  background: "#ffffff",
});
