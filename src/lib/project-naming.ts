/**
 * Utility to extract or generate clean, professional project names from
 * prompts, user ideas, and generated code (<title>, package.json, etc.).
 */

export function generateProjectNameFromIdea(prompt: string): string {
  if (!prompt || typeof prompt !== "string") return "New Project";

  const trimmed = prompt.trim();
  if (!trimmed) return "New Project";

  // 1. Explicit naming: "named X", "called X", "name: X"
  const explicitMatch =
    trimmed.match(
      /(?:app|project|website|product)\s*(?:name|title)\s*[:=-]\s*["']?([a-zA-Z0-9_\s-]{2,35}?)["']?(?:\.|\n|$|,)/i,
    ) ||
    trimmed.match(/(?:named|called)\s*["']([a-zA-Z0-9_\s-]{2,35})["']/i) ||
    trimmed.match(/(?:named|called)\s+([A-Z][a-zA-Z0-9_-]{2,25})/i);

  if (explicitMatch && explicitMatch[1]) {
    const name = explicitMatch[1].trim();
    if (
      !["a", "an", "the", "this", "new", "devloadable", "loadable", "untitled"].includes(
        name.toLowerCase(),
      )
    ) {
      return name;
    }
  }

  // 2. Strip instructions, attachment references, and boilerplate intros
  let clean = trimmed
    .replace(/\[USER ATTACHED.*?\[END OF ATTACHED.*?\]/gis, "")
    .replace(/\[ZIP ARCHIVE.*?\]/gis, "")
    .replace(/^CRITICAL INSTRUCTION:.*$/gim, "")
    .replace(
      /^(please\s+)?(build|create|make|design|generate|develop|code|implement|construct)\s+(me\s+)?(a|an|the|one)?\s*/i,
      "",
    )
    .replace(
      /^(sleek|modern|simple|minimal|responsive|dark|light|clean|fullstack|full-stack|fast|interactive)\s+/i,
      "",
    )
    .trim();

  // 3. Cut off trailing modifiers (e.g. "with authentication and charts", "using react and tailwind")
  clean = clean
    .split(/(?:\s+(?:with|using|powered by|featuring|that has|for|in|and)\s+)|[.,;\n]/i)[0]
    .trim();

  // 4. If we have a reasonable phrase (2 to 5 words)
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.length <= 6) {
    // Title Case each word
    const titleCased = words
      .slice(0, 5)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

    if (titleCased.length >= 3 && titleCased.length <= 40) {
      return titleCased;
    }
  }

  // Fallback: take first 35 chars of clean string
  const fallback = clean.slice(0, 35).trim();
  if (fallback.length >= 3) {
    return fallback.charAt(0).toUpperCase() + fallback.slice(1);
  }

  return "New Project";
}

export function extractAppNameFromCode(content: string, filePath = "index.html"): string | null {
  if (!content) return null;

  // 1. From HTML <title> tag
  if (filePath.endsWith(".html") || content.includes("<title")) {
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      let rawTitle = titleMatch[1].trim();
      // Strip common brand suffixes: "CryptoDash - Realtime Portfolio", "FoodFleet | ZarGPT"
      rawTitle = rawTitle
        .replace(
          /(\s*[-|–—:]\s*(DevLoadable|ZarGPT|Vite \+ React|Preview|Home|Official|Website|App)).*$/i,
          "",
        )
        .replace(/^(DevLoadable|ZarGPT)\s*[-|–—:]\s*/i, "")
        .trim();

      if (
        rawTitle.length >= 2 &&
        rawTitle.length <= 40 &&
        !/^(untitled|untitled project|index|home|page|document|app|vite app|my app|react app)$/i.test(
          rawTitle,
        )
      ) {
        return rawTitle;
      }
    }
  }

  // 2. From package.json "name" or "description"
  if (
    filePath.endsWith("package.json") ||
    (content.includes('"name"') && content.includes('"version"'))
  ) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.name && typeof parsed.name === "string") {
        const pkgName = parsed.name
          .replace(/[-_]/g, " ")
          .split(/\s+/)
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
          .trim();
        if (
          pkgName.length >= 2 &&
          pkgName.length <= 40 &&
          !/^(untitled|devloadable|vite)$/i.test(pkgName)
        ) {
          return pkgName;
        }
      }
    } catch {
      // ignore json parse error
    }
  }

  return null;
}
