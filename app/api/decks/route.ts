import { NextResponse } from "next/server";
import { createDeck, listDecks } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listDecks());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim() || "Untitled deck";
  return NextResponse.json(await createDeck(title), { status: 201 });
}
