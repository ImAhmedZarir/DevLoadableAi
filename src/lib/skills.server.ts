import manifest from "./skills/_manifest.json";

// Load skills at build time using Vite import.meta.glob with raw query
const skillModules = import.meta.glob("./skills/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * Strip lines that mention:
 * - /mnt/skills
 * - present_files
 * - computer tools
 * - file paths (or file path)
 */
const PROHIBITED_SUBSTRINGS = [
  "/mnt/skills",
  "present_files",
  "computer tools",
  "file paths",
  "file path",
  "scripts/",
  "bash ",
  "init-artifact",
  "bundle-artifact",
  "parcel",
  "shadcn",
  "theme-showcase",
  "screenshot",
  "confirm with the client",
  "brainstorm a short design plan",
];

export function stripProhibitedLines(text: string): string {
  const lines = text.split("\n");
  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase();
    for (const sub of PROHIBITED_SUBSTRINGS) {
      if (lower.includes(sub)) return false;
    }
    return true;
  });
  return filtered.join("\n");
}

export type SkillMeta = {
  name: string;
  type: "always" | "optional" | "ignored";
  size: number;
  cleanedContent: string;
  keywords: string[];
};

const SKILLS_REGISTRY = new Map<string, SkillMeta>();

const KEYWORDS_BY_SKILL: Record<string, string[]> = {
  "brand-guidelines": [
    "brand",
    "branding",
    "guidelines",
    "identity",
    "colors",
    "typography",
    "corporate",
    "logo",
    "palette",
  ],
  "canvas-design": [
    "canvas",
    "poster",
    "art",
    "artwork",
    "graphic",
    "flyer",
    "banner",
    "print",
    "visual design",
  ],
  "algorithmic-art": [
    "algorithmic",
    "generative",
    "generative art",
    "p5",
    "p5.js",
    "particle",
    "particles",
    "flow field",
    "seeded randomness",
    "noise field",
  ],
  "mcp-builder": ["mcp", "model context protocol", "mcp server", "fastmcp", "protocol server"],
  "design-system": [
    "design",
    "ui",
    "craft",
    "devloadable",
    "tailwind",
    "theme",
    "layout",
    "component",
    "buttons",
    "cards",
    "typography",
    "styling",
    "aesthetic",
    "colors",
    "dark mode",
  ],
};

const allowedManifestSkills = new Set([...manifest.always, ...manifest.optional]);

for (const [rawPath, rawContent] of Object.entries(skillModules)) {
  const match = rawPath.match(/\.\/skills\/(.+)\.md$/);
  if (!match) continue;
  const name = match[1];
  if (!allowedManifestSkills.has(name)) continue;

  const isAlways = manifest.always.includes(name);
  const isOptional = manifest.optional.includes(name);
  const type: "always" | "optional" | "ignored" = isAlways
    ? "always"
    : isOptional
      ? "optional"
      : "ignored";

  const cleaned = stripProhibitedLines(rawContent);

  // Extract keywords from markdown or fallback map
  let keywords: string[] = KEYWORDS_BY_SKILL[name] ? [...KEYWORDS_BY_SKILL[name]] : [];
  const kwMatch = rawContent.match(/\*\*Keywords\*\*:\s*([^\n]+)/i);
  if (kwMatch) {
    const parsed = kwMatch[1]
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    keywords.push(...parsed);
  }
  // Add hyphenated fragments of name
  name.split("-").forEach((part) => {
    if (part.length > 2) keywords.push(part.toLowerCase());
  });
  keywords = Array.from(new Set(keywords));

  SKILLS_REGISTRY.set(name, {
    name,
    type,
    size: cleaned.length,
    cleanedContent: cleaned,
    keywords,
  });
}

export function listAdminSkills(): Array<{
  name: string;
  type: "always" | "optional" | "ignored";
  size: number;
}> {
  // Only surface "always" and "optional" skills in admin per manifest requirements
  const result: Array<{
    name: string;
    type: "always" | "optional" | "ignored";
    size: number;
  }> = [];

  for (const name of manifest.always) {
    const skill = SKILLS_REGISTRY.get(name);
    result.push({
      name,
      type: "always",
      size: skill ? skill.size : 0,
    });
  }

  for (const name of manifest.optional) {
    const skill = SKILLS_REGISTRY.get(name);
    result.push({
      name,
      type: "optional",
      size: skill ? skill.size : 0,
    });
  }

  return result;
}

export function getInjectedSkills(
  userPrompt: string,
  disabledSkills: string[] = [],
): { prompt: string; loadedSkillNames: string[] } {
  const disabledSet = new Set(disabledSkills);
  const promptLower = userPrompt.toLowerCase();
  const selected: SkillMeta[] = [];

  // Inject "always" skills on every run
  for (const name of manifest.always) {
    if (disabledSet.has(name)) continue;
    const skill = SKILLS_REGISTRY.get(name);
    if (skill && skill.type === "always") {
      selected.push(skill);
    }
  }

  // Inject "optional" skills only on keyword match
  for (const name of manifest.optional) {
    if (disabledSet.has(name)) continue;
    const skill = SKILLS_REGISTRY.get(name);
    if (!skill || skill.type !== "optional") continue;

    const matches = skill.keywords.some((kw) => promptLower.includes(kw));
    if (matches) {
      selected.push(skill);
    }
  }

  // All other skills are ignored per requirement

  if (selected.length === 0) {
    return { prompt: "", loadedSkillNames: [] };
  }

  const loadedSkillNames = selected.map((s) => s.name);
  let combined = selected
    .map((s) => `### Skill: ${s.name}\n${s.cleanedContent}`)
    .join("\n\n---\n\n");

  const MAX_CHARS = 40_000;
  if (combined.length > MAX_CHARS) {
    combined = combined.slice(0, MAX_CHARS);
  }

  const prompt = `## Injected Skills:\n${combined}`;
  return { prompt, loadedSkillNames };
}
