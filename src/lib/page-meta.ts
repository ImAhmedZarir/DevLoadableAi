export const CANONICAL_BASE_URL =
  (typeof process !== "undefined" && process.env?.SITE_ORIGIN) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_ORIGIN) ||
  "https://devloadable.ai.studio";

export function pageMeta(
  title: string,
  description: string,
  options?: {
    path?: string;
    noIndex?: boolean;
    image?: string;
  },
) {
  const fullTitle = title.includes("DevLoadable") ? title : `${title} — DevLoadable`;

  const canonicalUrl = options?.path
    ? `${CANONICAL_BASE_URL}${options.path.startsWith("/") ? options.path : `/${options.path}`}`
    : CANONICAL_BASE_URL;

  const socialImage = options?.image?.startsWith("http")
    ? options.image
    : `${CANONICAL_BASE_URL}${options?.image || "/faviconandlogo.png"}`;

  const metaList: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonicalUrl },
    { property: "og:image", content: socialImage },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: socialImage },
  ];

  if (options?.noIndex) {
    metaList.push({ name: "robots", content: "noindex, nofollow" });
  }

  return {
    meta: metaList,
    links: [{ rel: "canonical", href: canonicalUrl }],
  };
}
