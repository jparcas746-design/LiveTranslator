import type { Metadata } from "next";
import { SignipediaHome } from "@/components/signipedia/SignipediaHome";
import { getSignipediaEngine } from "@/thor/signipedia/engine";

export const metadata: Metadata = {
  title: "Signipedia",
  description: "Enciclopedia interactiva de símbolos y signos del mundo.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const engine = getSignipediaEngine();
  const [categories, initialResults, featured, stats] = await Promise.all([
    engine.listCategories(),
    engine.listSymbols({ limit: 24 }),
    engine.listSymbols({ limit: 6 }),
    engine.getStats(),
  ]);

  return <SignipediaHome categories={categories} initialResults={initialResults} featured={featured} stats={stats} />;
}
