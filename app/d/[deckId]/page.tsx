import { notFound } from "next/navigation";
import Editor from "@/components/Editor";
import { getDeck } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  const data = await getDeck(deckId);
  if (!data) notFound();
  return <Editor deck={data.deck} slides={data.slides} />;
}
