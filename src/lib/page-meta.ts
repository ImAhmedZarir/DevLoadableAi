export function pageMeta(title: string, description: string) {
  const fullTitle = title.includes("DevLoadable")
    ? title
    : `${title} — DevLoadable · Part of ZarGPT`;
  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/faviconandlogo.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: "/faviconandlogo.png" },
      { name: "author", content: "Ahmed Ishtiaque Zarir" },
    ],
  };
}

