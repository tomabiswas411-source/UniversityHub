import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

/**
 * Sitemap over the PUBLIC surfaces: the portal landing page and each
 * active university's public department pages. Authenticated app views
 * (?view=dashboard, scan, attend…) are intentionally excluded — they
 * require a session and would just waste crawl budget.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://universityhub-rho.vercel.app";

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/?view=pricing`, changeFrequency: "monthly", priority: 0.7 },
  ];

  try {
    const universities = await db.university.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
      take: 100,
    });
    const uniEntries: MetadataRoute.Sitemap = universities.map((u) => ({
      url: `${base}/?uni=${encodeURIComponent(u.slug)}`,
      lastModified: u.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
    return [...staticEntries, ...uniEntries];
  } catch {
    // DB unavailable at build time — ship the static entries rather than fail
    return staticEntries;
  }
}
