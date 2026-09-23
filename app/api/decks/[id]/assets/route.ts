import { NextResponse } from "next/server";
import { createAsset } from "@/lib/repo";

export const dynamic = "force-dynamic";

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

/** Raw image bytes in, `asset:<id>` out. Used by PDF/Word import and paste. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!ALLOWED.includes(mime)) {
    return NextResponse.json({ error: `unsupported type ${mime || "(none)"}` }, { status: 415 });
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: "empty body" }, { status: 400 });
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }
  const assetId = await createAsset(id, mime, bytes);
  return NextResponse.json({ id: assetId, src: `asset:${assetId}` }, { status: 201 });
}
