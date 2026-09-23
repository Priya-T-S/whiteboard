// pdf.js needs its worker served as a plain file. Copying it into /public keeps
// it out of the bundler, which is the most portable way to load it.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
const dest = join(process.cwd(), "public", "pdf.worker.min.mjs");

mkdirSync(join(process.cwd(), "public"), { recursive: true });
copyFileSync(src, dest);
console.log(`copied pdf worker -> ${dest}`);
