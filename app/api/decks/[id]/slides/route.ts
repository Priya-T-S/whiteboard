import { NextResponse } from "next/server";
import { addSlide, reorderSlides } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const afterIdx = Number.isFinite(body.afterIdx) ? Number(body.afterIdx) : -1;
  const slide = await addSlide(id, afterIdx, body.content);
  return NextResponse.json(slide, { status: 201 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.order)) {
    return NextResponse.json({ error: "order required" }, { status: 400 });
  }
  await reorderSlides(id, body.order.map(String));
  return NextResponse.json({ ok: true });
}
