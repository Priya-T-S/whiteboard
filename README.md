# Whiteboard

Slide-deck note taking you draw instead of type. Next.js + canvas, stored in Turso (libSQL).

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
```

With no environment variables set it writes to a local SQLite file (`whiteboard.db`)
so it runs straight away. To sync to Turso instead:

```bash
turso db create whiteboard
turso db show whiteboard --url          # -> TURSO_DATABASE_URL
turso db tokens create whiteboard       # -> TURSO_AUTH_TOKEN
```

Put both in `.env.local` (see `.env.example`). The schema is created on first
connection either way — no migration step.

## The input protocol

The pen is **armed**, not pressed. Press `Space` and the pointer becomes a pen:
plain movement draws, with no button held and no finger contact needed, so a
one-finger slide on the trackpad or a nudge of the mouse leaves ink. `Space`
again disarms it. The header badge always shows which mode you are in.

Holding **Shift** suspends the pen for as long as you hold it and gives you a
plain pointer for selecting, dragging and deleting. Releasing Shift hands the
pen back and starts a *new* stroke, which is the normal way to move between
strokes without lifting a finger:

```
Space          arm the pen
move           draw
hold Shift     pointer — reposition, select, drag
release Shift  pen back, new stroke starts here
Space          disarm
```

A stroke also ends on its own after 600ms of stillness, and a plain press-drag
draws even when the pen is disarmed — so a mouse works the conventional way too.

## Importing PDF and Word

**Import PDF / Word** in the header takes a `.pdf` or `.docx` and turns every
page into its own slide, with the page rendered as a locked background image
you draw straight over. Locked means select and erase walk past it, so a stray
drag never shifts the document under your notes.

Pages render at 1.5x slide resolution and are stored as JPEGs in an `assets`
table, referenced from the slide as `asset:<id>`. That matters: slide JSON stays
around a kilobyte, so the autosave after every stroke is small no matter how
heavy the source document is.

Word files are converted with mammoth and repaginated onto A4-sized sheets, then
rasterized. Two consequences worth knowing: the original document's own page
breaks are not honoured (it reflows), and the text becomes pixels, so it is not
selectable or searchable afterwards. Complex layouts - columns, headers and
footers, floating figures - will not come through faithfully. PDF import has no
such caveat; pages render exactly as pdf.js draws them.

## Exporting

**Export PDF** renders every slide at 1920x1080 into a landscape PDF and
downloads it. Your ink, text, shapes and any imported page are flattened
together, so an annotated document exports as one file you can send on.

## Keys

| | |
|---|---|
| `Space` | arm / disarm the pen |
| `Shift` (hold) | pointer / select |
| `P` `E` `V` `R` `O` `L` `A` `T` | pen, eraser, select, rect, ellipse, line, arrow, text |
| `Alt` while dragging | constrain to square / circle / 45° |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo (per slide) |
| `Ctrl+Enter` / `Ctrl+D` | new slide / duplicate slide |
| `←` `→` `PgUp` `PgDn` | previous / next slide (nudges the selection instead when something is selected) |
| `Delete` | delete selection |
| `F5` / `Esc` | present / exit |

Double-click a text element to edit it. Paste an image to drop it on the slide.

## Layout

| | |
|---|---|
| `lib/types.ts` | slide element shapes; everything lives in a 1920×1080 logical space |
| `lib/db.ts` | libSQL client + schema, Turso or local file |
| `lib/repo.ts` | deck and slide queries |
| `lib/render.ts` | canvas painting, shared by the editor and the thumbnails |
| `lib/geometry.ts` | hit testing, bounds, translation |
| `components/SlideCanvas.tsx` | the pointer protocol and all drawing gestures |
| `components/Editor.tsx` | tools, slides, history, autosave, import/export |
| `lib/importers.ts` | PDF and Word to slide pages |
| `lib/exportPdf.ts` | deck to PDF |
| `scripts/copy-pdf-worker.mjs` | puts the pdf.js worker in `public/` (runs on install, dev and build) |

Slides are stored as one JSON document per slide, autosaved 700ms after you
stop drawing, with a `sendBeacon` flush on unload so a closed tab doesn't lose
the last strokes.
