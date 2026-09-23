import { NextResponse } from "next/server";
import { deleteSlide, saveSlide } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.elements)) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  await saveSlide(id, { elements: body.elements, background: body.background ?? "#ffffff" });
  return NextResponse.json({ ok: true });
}

/** Same as PUT, for `navigator.sendBeacon` flushes on page unload (beacons
 *  can only POST). */
export const POST = PUT;

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const ok = await deleteSlide(id);
  if (!ok) return NextResponse.json({ error: "cannot delete the only slide" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
