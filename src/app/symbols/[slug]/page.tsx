import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bookmark, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { getSignipediaEngine } from "@/thor/signipedia/engine";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="signipedia-detail-section">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

async function resolveSymbol(slug: string) {
  const engine = getSignipediaEngine();
  const [detail, categories] = await Promise.all([engine.getSymbolDetailBySlug(slug), engine.listCategories()]);

  if (!detail) {
    return null;
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const relatedSymbols = await Promise.all(
    detail.relatedSymbols.map(async (relation) => {
      const symbol = await engine.getSymbolById(relation.relatedSymbolId);
      if (!symbol) {
        return null;
      }

      return {
        symbol,
        relationType: relation.relationType,
        category: categoryById.get(symbol.categoryId) || null,
      };
    })
  );

  return {
    detail,
    categoryById,
    relatedSymbols: relatedSymbols.filter(Boolean) as Array<{
      symbol: NonNullable<Awaited<ReturnType<typeof engine.getSymbolById>>>;
      relationType: (typeof detail.relatedSymbols)[number]["relationType"];
      category: { name: string } | null;
    }>,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveSymbol(slug);

  if (!resolved) {
    return {
      title: "Símbolo no encontrado | Signipedia",
    };
  }

  return {
    title: `${resolved.detail.symbol.name} | Signipedia`,
    description: resolved.detail.symbol.meaning,
  };
}

export default async function SymbolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolveSymbol(slug);

  if (!resolved) {
    notFound();
  }

  const { detail, categoryById, relatedSymbols } = resolved;
  const symbol = detail.symbol;
  const category = detail.category || categoryById.get(symbol.categoryId) || null;
  const primaryImage = symbol.imageUrl || detail.media.find((item) => item.kind === "image")?.url || null;

  return (
    <main className="signipedia-detail-shell">
      <div className="signipedia-detail-nav">
        <Link href="/" className="signipedia-back-link">
          <ArrowLeft size={16} />
          Volver al índice
        </Link>
        <div className="signipedia-detail-actions">
          <Button type="button" variant="secondary" size="sm" leftIcon={<Bookmark size={14} />}>
            Guardar
          </Button>
          <Button type="button" variant="secondary" size="sm" leftIcon={<Share2 size={14} />}>
            Compartir
          </Button>
        </div>
      </div>

      <article className="signipedia-detail-hero">
        <div>
          <span className="signipedia-tag">{category?.name || "General"}</span>
          <h1>{symbol.name}</h1>
          <p>{symbol.meaning}</p>
          <div className="signipedia-inline-meta">
            <span>Origen: {symbol.origin}</span>
            <span>Uso actual: {symbol.currentUses}</span>
          </div>
        </div>
        {primaryImage ? (
          <div className="signipedia-detail-media-preview">
            <img src={primaryImage} alt={symbol.name} loading="lazy" />
          </div>
        ) : (
          <div className="signipedia-detail-glyph">{symbol.canonicalGlyph}</div>
        )}
      </article>

      <div className="signipedia-detail-grid">
        <Section title="Significado">
          <p>{symbol.meaning}</p>
        </Section>
        <Section title="Historia">
          <p>{symbol.history}</p>
        </Section>
        <Section title="Origen">
          <p>{symbol.origin}</p>
        </Section>
        <Section title="Usos actuales">
          <p>{symbol.currentUses}</p>
        </Section>
        <Section title="Variantes">
          <ul>
            {symbol.variants.map((variant) => (
              <li key={variant}>{variant}</li>
            ))}
          </ul>
        </Section>
        <Section title="Curiosidades">
          <ul>
            {symbol.curiosities.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </Section>
        <Section title="Alias y sinónimos">
          <ul>
            {[...detail.aliases, ...detail.synonyms].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      </div>

      {detail.historicalPeriods.length > 0 ? (
        <section className="signipedia-detail-section">
          <h2>Referencias históricas</h2>
          <div className="signipedia-detail-stack">
            {detail.historicalPeriods.map((period) => (
              <article key={period.id} className="signipedia-detail-note">
                <strong>{period.label}</strong>
                <p>{period.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {detail.sources.length > 0 ? (
        <section className="signipedia-detail-section">
          <h2>Fuentes</h2>
          <div className="signipedia-detail-stack">
            {detail.sources.map((source) => (
              <article key={source.id} className="signipedia-detail-note">
                <strong>{source.title}</strong>
                {source.citation ? <p>{source.citation}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {detail.media.length > 0 ? (
        <section className="signipedia-detail-section">
          <h2>Imágenes y medios</h2>
          <div className="signipedia-detail-stack">
            {detail.media.map((item) => (
              <article key={item.id} className="signipedia-detail-note">
                <strong>{item.kind}</strong>
                {item.kind === "image" ? (
                  <div className="signipedia-detail-media-item">
                    <img src={item.url} alt={item.altText || symbol.name} loading="lazy" />
                    <p>{item.url}</p>
                  </div>
                ) : (
                  <p>{item.url}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {detail.translations.length > 0 ? (
        <section className="signipedia-detail-section">
          <h2>Traducciones</h2>
          <div className="signipedia-detail-stack">
            {detail.translations.map((translation) => (
              <article key={translation.id} className="signipedia-detail-note">
                <strong>{translation.language} / {translation.field}</strong>
                <p>{translation.value}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="signipedia-detail-section">
        <h2>Símbolos relacionados</h2>
        <div className="signipedia-related-grid">
          {relatedSymbols.map(({ symbol: related, category: relatedCategory, relationType }) => (
            <Link key={related.id} href={`/symbols/${related.slug}`} className="signipedia-related-card">
              <strong>{related.canonicalGlyph}</strong>
              <span>{related.name}</span>
              <small>{relatedCategory?.name || relationType}</small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
