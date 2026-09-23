import { NextResponse } from "next/server";
import { deleteDeck, getDeck, renameDeck } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const deck = await getDeck(id);
  if (!deck) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(deck);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  await renameDeck(id, title);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteDeck(id);
  return NextResponse.json({ ok: true });
}
