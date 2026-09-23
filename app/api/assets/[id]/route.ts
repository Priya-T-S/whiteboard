import { getAsset } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) return new Response("not found", { status: 404 });
  return new Response(asset.bytes as unknown as BodyInit, {
    headers: {
      "content-type": asset.mime,
      // Asset ids are never reused, so this can cache hard.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
