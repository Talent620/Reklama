import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingRenderer } from "@/components/LandingRenderer";
import { demoLandingPages, findDemoLanding } from "@/lib/engine/demo";

/** Pre-render every demo landing page (variant A & B) at build time. */
export function generateStaticParams() {
  return [...demoLandingPages().keys()].map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const found = findDemoLanding(params.slug);
  if (!found) return { title: "Not found" };
  return {
    title: found.page.title,
    description: found.page.metaDescription,
    openGraph: { title: found.page.title, description: found.page.metaDescription },
  };
}

export default function LandingPageRoute({ params }: { params: { slug: string } }) {
  const found = findDemoLanding(params.slug);
  if (!found) notFound();
  return <LandingRenderer page={found.page} />;
}
