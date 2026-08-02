import type { MetadataRoute } from "next";
import { getSignipediaEngine } from "@/thor/signipedia/engine";

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const now = new Date();
  const engine = getSignipediaEngine();
  const symbols = await engine.listSymbols({ limit: 5000, offset: 0 });

  const urls: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  for (const item of symbols) {
    urls.push({
      url: `${baseUrl}/symbols/${item.symbol.slug}`,
      lastModified: item.symbol.updatedAt ? new Date(item.symbol.updatedAt) : now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  return urls;
}
