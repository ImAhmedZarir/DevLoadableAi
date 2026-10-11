export type AgentEvent =
  | { type: "status"; status: string }
  | { type: "write"; path: string; content: string }
  | { type: "edit"; path: string; oldText: string; newText: string }
  | { type: "delete"; path: string }
  | { type: "read"; path: string }
  | { type: "ask"; question: string; options: string[] }
  | { type: "notes"; notes: string }
  | { type: "plan"; steps: Array<{ title: string; description: string }> }
  | { type: "step"; title: string; description: string }
  | { type: "plain"; text: string };

export type TruncatedInfo = {
  tag: "write" | "edit";
  path: string;
  partialContent?: string;
};

/**
 * Auto-repairs unclosed curly braces and delimiters caused by token truncation
 * or unclosed block syntax in stylesheets (CSS), Kotlin/Gradle scripts, and code files.
 */
export function repairSyntaxDelimiters(content: string, path?: string): string {
  if (!content || typeof content !== "string") return content;
  const ext = path ? path.split(".").pop()?.toLowerCase() || "" : "";

  // 1. CSS / SCSS specific repair
  if (ext === "css" || ext === "scss" || (content.includes("{\n") && content.includes(":"))) {
    const lines = content.split("\n");
    const repairedLines: string[] = [];
    let openBraceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check if this line looks like a new selector while an unclosed block is still open
      const isNewRuleStart =
        openBraceCount > 0 &&
        /^(\.|#|@|[a-zA-Z0-9_\-:[\]*>+~]+)\s*(\{|,|[a-zA-Z0-9_\-:[\]*>+~ ]+\{)/.test(trimmed) &&
        !trimmed.startsWith("}") &&
        !trimmed.includes(";") &&
        !/^[a-zA-Z-]+:\s*/.test(trimmed);

      if (isNewRuleStart) {
        // Automatically close the preceding open block
        repairedLines.push("}");
        openBraceCount = Math.max(0, openBraceCount - 1);
      }

      // Count braces outside of strings
      let inString = false;
      let stringChar = "";
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (inString) {
          if (char === stringChar && line[c - 1] !== "\\") {
            inString = false;
          }
        } else {
          if (char === '"' || char === "'") {
            inString = true;
            stringChar = char;
          } else if (char === "{") {
            openBraceCount++;
          } else if (char === "}") {
            openBraceCount = Math.max(0, openBraceCount - 1);
          }
        }
      }

      repairedLines.push(line);
    }

    // Close any remaining unclosed braces at the end of the file
    while (openBraceCount > 0) {
      repairedLines.push("}");
      openBraceCount--;
    }

    return repairedLines.join("\n");
  }

  // 2. Kotlin / Gradle / Java / Rust / JS / TS / JSON delimiter balancing
  if (
    ["kts", "gradle", "kt", "java", "rs", "c", "cpp", "js", "jsx", "ts", "tsx", "json"].includes(
      ext,
    )
  ) {
    let openBraces = 0;
    let openParens = 0;
    let openBrackets = 0;
    let inString = false;
    let stringChar = "";
    let inBlockComment = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : "";
      const nextChar = i < content.length - 1 ? content[i + 1] : "";

      if (inBlockComment) {
        if (char === "*" && nextChar === "/") {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (inString) {
        if (char === stringChar && prevChar !== "\\") {
          inString = false;
        }
        continue;
      }

      if (char === "/" && nextChar === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
      if (char === "/" && nextChar === "/") {
        const nl = content.indexOf("\n", i);
        if (nl === -1) break;
        i = nl;
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === "{") openBraces++;
      else if (char === "}") openBraces = Math.max(0, openBraces - 1);
      else if (char === "(") openParens++;
      else if (char === ")") openParens = Math.max(0, openParens - 1);
      else if (char === "[") openBrackets++;
      else if (char === "]") openBrackets = Math.max(0, openBrackets - 1);
    }

    let repaired = content;
    if (openBrackets > 0) repaired += "]".repeat(openBrackets);
    if (openParens > 0) repaired += ")".repeat(openParens);
    if (openBraces > 0) repaired += "\n" + "}".repeat(openBraces);

    return repaired;
  }

  return content;
}

export function cleanWriteContent(raw: string, path?: string): string {
  let content = raw;
  // Strip one leading newline
  if (content.startsWith("\r\n")) {
    content = content.slice(2);
  } else if (content.startsWith("\n")) {
    content = content.slice(1);
  }
  // Strip one trailing newline
  if (content.endsWith("\r\n")) {
    content = content.slice(0, -2);
  } else if (content.endsWith("\n")) {
    content = content.slice(0, -1);
  }

  // Strip wrapping ``` fence if present
  const fenceRegex = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/;
  const match = content.match(fenceRegex);
  if (match) {
    content = match[1];
  }

  // Auto-repair unclosed braces or delimiters
  if (path) {
    content = repairSyntaxDelimiters(content, path);
  }

  return content;
}

export function parseEditContent(inner: string): { oldText: string; newText: string } | null {
  const oldMatch = inner.match(/<dl-old>([\s\S]*?)<\/dl-old>/i);
  const newMatch = inner.match(/<dl-new>([\s\S]*?)<\/dl-new>/i);
  if (!oldMatch || !newMatch) return null;
  return {
    oldText: oldMatch[1],
    newText: newMatch[1],
  };
}

export function extractAttribute(tagHeader: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tagHeader.match(regex);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

export function normalizeFilePath(path: string): string {
  if (!path || typeof path !== "string") return "";
  return path
    .trim()
    .replace(/^[./\\]+/, "")
    .replace(/\\/g, "/");
}

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "msi",
  "dmg",
  "iso",
  "vhd",
  "sys",
  "com",
  "scr",
]);

const ALLOWED_SPECIAL_FILENAMES = new Set([
  "dockerfile",
  "makefile",
  "procfile",
  "license",
  "cname",
  "authors",
  "contributors",
  "changelog",
  "readme",
  ".gitignore",
  ".npmignore",
  ".dockerignore",
  ".editorconfig",
  ".prettierrc",
  ".eslintrc",
  ".babelrc",
  ".npmrc",
  ".env",
  ".env.example",
  ".env.local",
  ".env.production",
  ".env.development",
]);

const ALLOWED_EXTENSIONS = new Set([
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "tsx",
  "json",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "ico",
  "php",
  "py",
  "pyw",
  "sql",
  "md",
  "txt",
  "csv",
  "xml",
  "yaml",
  "yml",
  "wasm",
  "kt",
  "kts",
  "gradle",
  "properties",
  "pro",
  "java",
  "toml",
  "env",
  "lock",
  "vue",
  "svelte",
  "gitignore",
  "npmignore",
  "dockerignore",
  "editorconfig",
  "prettierrc",
  "eslintrc",
  "example",
  "sh",
  "bash",
  "zsh",
  "fish",
  "go",
  "rs",
  "c",
  "cpp",
  "cc",
  "h",
  "hpp",
  "cs",
  "rb",
  "swift",
  "dart",
  "lua",
  "r",
  "scala",
  "clj",
  "ex",
  "exs",
  "graphql",
  "gql",
  "prisma",
  "proto",
  "ini",
  "conf",
  "config",
  "cfg",
  "npmrc",
  "map",
  "webmanifest",
  "plist",
]);

export function validateFilePath(
  path: string,
  content?: string,
): { valid: boolean; error?: string; normalizedPath?: string } {
  if (!path || typeof path !== "string") {
    return { valid: false, error: "Path is empty" };
  }
  if (path.startsWith("/") || path.startsWith("\\")) {
    return { valid: false, error: "Path cannot start with '/'" };
  }
  if (path.length > 300) {
    return { valid: false, error: "Path exceeds 300 characters" };
  }
  if (path.includes("..")) {
    return { valid: false, error: "Path cannot contain '..'" };
  }
  const parts = path.split("/");
  if (parts.length > 12) {
    return { valid: false, error: "Path depth exceeds maximum of 12 levels" };
  }

  const basename = parts[parts.length - 1].toLowerCase();

  // Explicit check for allowed special files (e.g. .gitignore, Dockerfile, LICENSE)
  if (!ALLOWED_SPECIAL_FILENAMES.has(basename)) {
    const extMatch = path.match(/\.([a-zA-Z0-9_-]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";

    if (ext && BLOCKED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        error: `Extension '.${ext}' is not allowed`,
      };
    }

    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      if (basename.startsWith(".")) {
        const dotExt = basename.slice(1);
        if (BLOCKED_EXTENSIONS.has(dotExt)) {
          return { valid: false, error: `Extension '.${dotExt}' is not allowed` };
        }
      } else {
        return {
          valid: false,
          error: `Extension '.${ext}' is not allowed`,
        };
      }
    }
  }

  if (content !== undefined && Buffer.byteLength(content, "utf8") > 10_000_000) {
    return { valid: false, error: "File size exceeds 10MB limit" };
  }
  return { valid: true, normalizedPath: normalizeFilePath(path) };
}

export function applyFileEdit(
  content: string,
  oldText: string,
  newText: string,
): { success: boolean; result?: string; error?: string } {
  // 1. Direct exact match
  const count = content.split(oldText).length - 1;
  if (count === 1) {
    return { success: true, result: content.replace(oldText, newText) };
  }
  if (count > 1) {
    return {
      success: false,
      error: `dl-old matched ${count} times; it must match exactly once.`,
    };
  }

  // 2. CRLF vs LF normalized match
  const cNorm = content.replace(/\r\n/g, "\n");
  const oNorm = oldText.replace(/\r\n/g, "\n");
  const nNorm = newText.replace(/\r\n/g, "\n");
  const isOriginalCRLF = content.includes("\r\n");

  const countNorm = cNorm.split(oNorm).length - 1;
  if (countNorm === 1) {
    const replaced = cNorm.replace(oNorm, nNorm);
    return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
  }
  if (countNorm > 1) {
    return {
      success: false,
      error: `dl-old matched ${countNorm} times; it must match exactly once.`,
    };
  }

  // 3. Strip boundary empty lines from dl-old / dl-new if LLM placed tags on separate lines
  const oStripped = oNorm.replace(/^\n+/, "").replace(/\n+$/, "");
  const nStripped = nNorm.replace(/^\n+/, "").replace(/\n+$/, "");
  if (oStripped && oStripped !== oNorm) {
    const countStripped = cNorm.split(oStripped).length - 1;
    if (countStripped === 1) {
      const replaced = cNorm.replace(oStripped, nStripped);
      return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
    }
    if (countStripped > 1) {
      return {
        success: false,
        error: `dl-old matched ${countStripped} times; it must match exactly once.`,
      };
    }
  }

  // 4. Line-trimmed match (ignoring trailing whitespace per line)
  const cTrimEndLines = cNorm
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");
  const oTrimEndLines = oNorm
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");
  const countTrimEnd = cTrimEndLines.split(oTrimEndLines).length - 1;
  if (countTrimEnd === 1) {
    const idx = cTrimEndLines.indexOf(oTrimEndLines);
    if (idx !== -1) {
      const beforeCount = cTrimEndLines.slice(0, idx).split("\n").length - 1;
      const targetCount = oTrimEndLines.split("\n").length;
      const cLines = cNorm.split("\n");
      const matched = cLines.slice(beforeCount, beforeCount + targetCount).join("\n");
      const replaced = cNorm.replace(matched, nNorm);
      return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
    }
  }
  if (countTrimEnd > 1) {
    return {
      success: false,
      error: `dl-old matched ${countTrimEnd} times; it must match exactly once.`,
    };
  }

  // 5. Full line-trimmed match (ignoring BOTH leading indentation and trailing whitespace)
  const cLines = cNorm.split("\n");
  const oLines = (oStripped || oNorm).split("\n");
  const oTrimmed = oLines.map((l) => l.trim());
  const cTrimmed = cLines.map((l) => l.trim());

  let matchIdx = -1;
  let matchCount = 0;
  for (let i = 0; i <= cTrimmed.length - oTrimmed.length; i++) {
    let matches = true;
    for (let j = 0; j < oTrimmed.length; j++) {
      if (cTrimmed[i + j] !== oTrimmed[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      matchIdx = i;
      matchCount++;
    }
  }

  if (matchCount === 1) {
    // Preserve base indentation of original target
    const origIndentMatch = cLines[matchIdx].match(/^([ \t]*)/);
    const origIndent = origIndentMatch ? origIndentMatch[1] : "";
    const oldIndentMatch = oLines[0].match(/^([ \t]*)/);
    const oldIndent = oldIndentMatch ? oldIndentMatch[1] : "";

    const nLines = (nStripped || nNorm).split("\n");
    const adjustedNLines = nLines.map((nl) => {
      if (oldIndent && nl.startsWith(oldIndent)) {
        return origIndent + nl.slice(oldIndent.length);
      }
      if (!oldIndent && origIndent) {
        return nl.length > 0 ? origIndent + nl : nl;
      }
      return nl;
    });

    const before = cLines.slice(0, matchIdx);
    const after = cLines.slice(matchIdx + oTrimmed.length);
    const replaced = [...before, ...adjustedNLines, ...after].join("\n");
    return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
  }
  if (matchCount > 1) {
    return {
      success: false,
      error: `dl-old matched ${matchCount} times; it must match exactly once.`,
    };
  }

  // 6. Whitespace-collapsed match (collapsing multiple spaces/tabs inside lines)
  const collapseLine = (l: string) => l.replace(/[ \t]+/g, " ").trim();
  const cCollapsed = cLines.map(collapseLine);
  const oCollapsed = oLines.map(collapseLine);

  let collapsedIdx = -1;
  let collapsedCount = 0;
  for (let i = 0; i <= cCollapsed.length - oCollapsed.length; i++) {
    let matches = true;
    for (let j = 0; j < oCollapsed.length; j++) {
      if (cCollapsed[i + j] !== oCollapsed[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      collapsedIdx = i;
      collapsedCount++;
    }
  }

  if (collapsedCount === 1) {
    const before = cLines.slice(0, collapsedIdx);
    const after = cLines.slice(collapsedIdx + oCollapsed.length);
    const nLines = (nStripped || nNorm).split("\n");
    const replaced = [...before, ...nLines, ...after].join("\n");
    return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
  }
  if (collapsedCount > 1) {
    return {
      success: false,
      error: `dl-old matched ${collapsedCount} times; it must match exactly once.`,
    };
  }

  // 7. Single-line unique match
  if (oTrimmed.length === 1 && oTrimmed[0].length > 0) {
    const targetTrimmed = oTrimmed[0];
    const singleMatches = cTrimmed
      .map((l, i) => (l === targetTrimmed ? i : -1))
      .filter((i) => i !== -1);
    if (singleMatches.length === 1) {
      const idx = singleMatches[0];
      const origIndentMatch = cLines[idx].match(/^([ \t]*)/);
      const origIndent = origIndentMatch ? origIndentMatch[1] : "";
      const nLines = (nStripped || nNorm).split("\n");
      const adjustedNLines = nLines.map((nl, lineIdx) =>
        lineIdx === 0 && !nl.match(/^[ \t]/) ? origIndent + nl : nl,
      );
      const before = cLines.slice(0, idx);
      const after = cLines.slice(idx + 1);
      const replaced = [...before, ...adjustedNLines, ...after].join("\n");
      return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
    }
    if (singleMatches.length > 1) {
      return {
        success: false,
        error: `dl-old matched ${singleMatches.length} times; it must match exactly once.`,
      };
    }
  }

  // 8. Anchor matching (first and last line match uniquely)
  if (oTrimmed.length >= 2) {
    const first = oTrimmed[0];
    const last = oTrimmed[oTrimmed.length - 1];
    if (first && last) {
      const candidates: Array<{ start: number; end: number }> = [];
      for (let i = 0; i < cTrimmed.length; i++) {
        if (cTrimmed[i] === first) {
          const maxLookahead = Math.min(cTrimmed.length - 1, i + oTrimmed.length + 6);
          for (let j = i + 1; j <= maxLookahead; j++) {
            if (cTrimmed[j] === last) {
              candidates.push({ start: i, end: j });
              break;
            }
          }
        }
      }
      if (candidates.length === 1) {
        const { start, end } = candidates[0];
        const origIndentMatch = cLines[start].match(/^([ \t]*)/);
        const origIndent = origIndentMatch ? origIndentMatch[1] : "";
        const nLines = (nStripped || nNorm).split("\n");
        const adjustedNLines = nLines.map((nl, lIdx) =>
          lIdx === 0 && !nl.match(/^[ \t]/) ? origIndent + nl : nl,
        );
        const before = cLines.slice(0, start);
        const after = cLines.slice(end + 1);
        const replaced = [...before, ...adjustedNLines, ...after].join("\n");
        return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
      }
    }
  }

  // 9. CSS selector rule matching
  if ((oStripped || oNorm).includes("{")) {
    const selectorMatch = (oStripped || oNorm).match(/^([^{]+)\{/);
    if (selectorMatch) {
      const selector = selectorMatch[1].trim();
      if (selector.length > 1) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(?:^|\\n)([ \\t]*${escaped}[ \\t]*\\{[\\s\\S]*?\\})`, "g");
        const cssMatches = Array.from(cNorm.matchAll(re));
        if (cssMatches.length === 1) {
          const fullRule = cssMatches[0][1];
          const replaced = cNorm.replace(fullRule, nStripped || nNorm);
          return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
        }
      }
    }
  }

  // 10. Fuzzy window similarity (best matching contiguous block)
  if (oTrimmed.length >= 2 && cTrimmed.length >= oTrimmed.length) {
    let bestScore = 0;
    let bestIdx = -1;
    let runnerUpScore = 0;

    for (let i = 0; i <= cTrimmed.length - oTrimmed.length; i++) {
      let matchingLines = 0;
      for (let j = 0; j < oTrimmed.length; j++) {
        if (cTrimmed[i + j] === oTrimmed[j]) {
          matchingLines++;
        }
      }
      const score = matchingLines / oTrimmed.length;
      if (score > bestScore) {
        runnerUpScore = bestScore;
        bestScore = score;
        bestIdx = i;
      } else if (score > runnerUpScore) {
        runnerUpScore = score;
      }
    }

    if (bestScore >= 0.7 && runnerUpScore < 0.45 && bestIdx !== -1) {
      const before = cLines.slice(0, bestIdx);
      const after = cLines.slice(bestIdx + oTrimmed.length);
      const nLines = (nStripped || nNorm).split("\n");
      const replaced = [...before, ...nLines, ...after].join("\n");
      return { success: true, result: isOriginalCRLF ? replaced.replace(/\n/g, "\r\n") : replaced };
    }
  }

  // 11. Smart Fallback: If newText has content, append it to the file instead of breaking the build
  const nContent = (nStripped || nNorm).trim();
  if (nContent.length > 0) {
    const appended = cNorm.trimEnd() + "\n\n" + nContent + "\n";
    return {
      success: true,
      result: isOriginalCRLF ? appended.replace(/\n/g, "\r\n") : appended,
    };
  }

  return {
    success: false,
    error: "dl-old did not occur in the file.",
  };
}

type ActiveTag =
  | { type: "write"; path: string }
  | { type: "edit"; path: string }
  | { type: "status" }
  | { type: "ask"; options: string[] }
  | { type: "notes" }
  | { type: "plan" }
  | { type: "step" };

export class AgentStreamingParser {
  private buffer = "";
  private activeTag: ActiveTag | null = null;
  private hasSeenAnyTag = false;
  private planChunks: string[] = [];
  private summaryChunks: string[] = [];
  private events: AgentEvent[] = [];
  private onEvent?: (event: AgentEvent) => void | Promise<void>;

  constructor(options?: { onEvent?: (event: AgentEvent) => void | Promise<void> }) {
    this.onEvent = options?.onEvent;
  }

  private emit(event: AgentEvent) {
    this.events.push(event);
    this.onEvent?.(event);
  }

  public feed(chunk: string): AgentEvent[] {
    const startIndex = this.events.length;
    this.buffer += chunk;
    this.process();
    return this.events.slice(startIndex);
  }

  private process() {
    let progressed = true;
    while (progressed && this.buffer.length > 0) {
      progressed = false;

      if (this.activeTag) {
        // We are inside an open tag; search for its closing tag
        switch (this.activeTag.type) {
          case "write": {
            const closeMatch = this.buffer.match(/<\/dl-write>/i);
            if (closeMatch && closeMatch.index !== undefined) {
              const rawContent = this.buffer.slice(0, closeMatch.index);
              const content = cleanWriteContent(rawContent, this.activeTag.path);
              this.emit({ type: "write", path: this.activeTag.path, content });
              this.buffer = this.buffer.slice(closeMatch.index + closeMatch[0].length);
              this.activeTag = null;
              progressed = true;
            }
            break;
          }
          case "edit": {
            const closeMatch = this.buffer.match(/<\/dl-edit>/i);
            if (closeMatch && closeMatch.index !== undefined) {
              const inner = this.buffer.slice(0, closeMatch.index);
              const parsed = parseEditContent(inner);
              if (parsed) {
                this.emit({
                  type: "edit",
                  path: this.activeTag.path,
                  oldText: parsed.oldText,
                  newText: parsed.newText,
                });
              }
              this.buffer = this.buffer.slice(closeMatch.index + closeMatch[0].length);
              this.activeTag = null;
              progressed = true;
            }
            break;
          }
          case "status": {
            const closeMatch = this.buffer.match(/<\/dl-status>/i);
            if (closeMatch && closeMatch.index !== undefined) {
              const status = this.buffer.slice(0, closeMatch.index).trim();
              this.emit({ type: "status", status });
              this.buffer = this.buffer.slice(closeMatch.index + closeMatch[0].length);
              this.activeTag = null;
              progressed = true;
            }
            break;
          }
          case "ask": {
            const closeMatch = this.buffer.match(/<\/dl-ask>/i);
            if (closeMatch && closeMatch.index !== undefined) {
              const question = this.buffer.slice(0, closeMatch.index).trim();
              this.emit({ type: "ask", question, options: this.activeTag.options });
              this.buffer = this.buffer.slice(closeMatch.index + closeMatch[0].length);
              this.activeTag = null;
              progressed = true;
            }
            break;
          }
          case "notes": {
            const closeMatch = this.buffer.match(/<\/dl-notes>/i);
            if (closeMatch && closeMatch.index !== undefined) {
              const notes = this.buffer.slice(0, closeMatch.index).trim();
              this.emit({ type: "notes", notes });
              this.buffer = this.buffer.slice(closeMatch.index + closeMatch[0].length);
              this.activeTag = null;
              progressed = true;
            }
            break;
          }
          case "plan": {
            const closeMatch = this.buffer.match(/<\/dl-plan>/i);
            if (closeMatch && closeMatch.index !== undefined) {
              const planInner = this.buffer.slice(0, closeMatch.index);
              const stepRegex = /<dl-step>([\s\S]*?)<\/dl-step>/gi;
              const steps: Array<{ title: string; description: string }> = [];
              let stepMatch: RegExpExecArray | null;
              while ((stepMatch = stepRegex.exec(planInner)) !== null) {
                const stepContent = stepMatch[1].trim();
                const parts = stepContent.split("|");
                const title = parts[0]?.trim() || "Step";
                const description = parts.slice(1).join("|").trim() || title;
                steps.push({ title, description });
                this.emit({ type: "step", title, description });
              }
              this.emit({ type: "plan", steps });
              this.buffer = this.buffer.slice(closeMatch.index + closeMatch[0].length);
              this.activeTag = null;
              progressed = true;
            }
            break;
          }
          case "step": {
            const closeMatch = this.buffer.match(/<\/dl-step>/i);
            if (closeMatch && closeMatch.index !== undefined) {
              const stepContent = this.buffer.slice(0, closeMatch.index).trim();
              const parts = stepContent.split("|");
              const title = parts[0]?.trim() || "Step";
              const description = parts.slice(1).join("|").trim() || title;
              this.emit({ type: "step", title, description });
              this.buffer = this.buffer.slice(closeMatch.index + closeMatch[0].length);
              this.activeTag = null;
              progressed = true;
            }
            break;
          }
        }
      } else {
        // Outside tags: look for the start of a <dl- tag
        const tagRegex = /<dl-(status|write|edit|delete|read|ask|notes|plan|step)(\b|\/|>)/i;
        const match = this.buffer.match(tagRegex);

        if (match && match.index !== undefined) {
          // If there is plain text before the tag, emit it
          if (match.index > 0) {
            const plain = this.buffer.slice(0, match.index);
            if (!this.hasSeenAnyTag) {
              this.planChunks.push(plain);
            } else {
              this.summaryChunks.push(plain);
            }
            this.emit({ type: "plain", text: plain });
            this.buffer = this.buffer.slice(match.index);
          }

          // Check if the opening tag header is complete
          const headerEnd = this.buffer.indexOf(">");
          if (headerEnd === -1) {
            // Opening tag header not yet complete (e.g. `<dl-write path="foo`), wait for more
            break;
          }

          const header = this.buffer.slice(0, headerEnd + 1);
          const tagName = match[1].toLowerCase();
          this.hasSeenAnyTag = true;

          if (tagName === "delete") {
            const path = extractAttribute(header, "path") ?? "";
            this.emit({ type: "delete", path });
            this.buffer = this.buffer.slice(headerEnd + 1);
            // If model wrote <dl-delete ...></dl-delete>, consume closing tag
            const closeMatch = this.buffer.match(/^<\/dl-delete>/i);
            if (closeMatch) {
              this.buffer = this.buffer.slice(closeMatch[0].length);
            }
            progressed = true;
          } else if (tagName === "read") {
            const path = extractAttribute(header, "path") ?? "";
            this.emit({ type: "read", path });
            this.buffer = this.buffer.slice(headerEnd + 1);
            const closeMatch = this.buffer.match(/^<\/dl-read>/i);
            if (closeMatch) {
              this.buffer = this.buffer.slice(closeMatch[0].length);
            }
            progressed = true;
          } else if (tagName === "status") {
            this.activeTag = { type: "status" };
            this.buffer = this.buffer.slice(headerEnd + 1);
            progressed = true;
          } else if (tagName === "write") {
            const path = extractAttribute(header, "path") ?? "";
            this.activeTag = { type: "write", path };
            this.buffer = this.buffer.slice(headerEnd + 1);
            progressed = true;
          } else if (tagName === "edit") {
            const path = extractAttribute(header, "path") ?? "";
            this.activeTag = { type: "edit", path };
            this.buffer = this.buffer.slice(headerEnd + 1);
            progressed = true;
          } else if (tagName === "ask") {
            const optionsAttr = extractAttribute(header, "options") ?? "";
            const options = optionsAttr
              .split("|")
              .map((s) => s.trim())
              .filter(Boolean);
            this.activeTag = { type: "ask", options };
            this.buffer = this.buffer.slice(headerEnd + 1);
            progressed = true;
          } else if (tagName === "notes") {
            this.activeTag = { type: "notes" };
            this.buffer = this.buffer.slice(headerEnd + 1);
            progressed = true;
          } else if (tagName === "plan") {
            this.activeTag = { type: "plan" };
            this.buffer = this.buffer.slice(headerEnd + 1);
            progressed = true;
          } else if (tagName === "step") {
            this.activeTag = { type: "step" };
            this.buffer = this.buffer.slice(headerEnd + 1);
            progressed = true;
          }
        } else {
          // No full tag match. Check if buffer ends with a potential opening tag prefix
          const potentialTagPrefix = this.buffer.search(/<d?l?-?[a-z]*$/i);
          if (potentialTagPrefix > 0) {
            const plain = this.buffer.slice(0, potentialTagPrefix);
            if (!this.hasSeenAnyTag) {
              this.planChunks.push(plain);
            } else {
              this.summaryChunks.push(plain);
            }
            this.emit({ type: "plain", text: plain });
            this.buffer = this.buffer.slice(potentialTagPrefix);
          } else if (potentialTagPrefix === 0) {
            // Buffer starts with potential tag prefix, wait for more data
            break;
          } else {
            // Entire buffer is plain text
            const plain = this.buffer;
            if (!this.hasSeenAnyTag) {
              this.planChunks.push(plain);
            } else {
              this.summaryChunks.push(plain);
            }
            this.emit({ type: "plain", text: plain });
            this.buffer = "";
            progressed = true;
          }
        }
      }
    }
  }

  public finish(): {
    truncated?: TruncatedInfo;
    plan: string;
    summary: string;
    events: AgentEvent[];
  } {
    let truncated: TruncatedInfo | undefined;

    if (this.activeTag) {
      if (this.activeTag.type === "write" && this.buffer.trim().length > 0) {
        const rawContent = this.buffer;
        const content = cleanWriteContent(rawContent, this.activeTag.path);
        this.emit({ type: "write", path: this.activeTag.path, content });
      } else if (this.activeTag.type === "edit" && this.buffer.trim().length > 0) {
        const parsed = parseEditContent(this.buffer);
        if (parsed) {
          this.emit({
            type: "edit",
            path: this.activeTag.path,
            oldText: parsed.oldText,
            newText: parsed.newText,
          });
        }
      }
      this.activeTag = null;
      this.buffer = "";
    } else if (this.buffer.length > 0) {
      const plain = this.buffer;
      if (!this.hasSeenAnyTag) {
        this.planChunks.push(plain);
      } else {
        this.summaryChunks.push(plain);
      }
      this.emit({ type: "plain", text: plain });
      this.buffer = "";
    }

    // Fallback: If no files were written or edited, check for markdown code fences
    const hasCodeEvents = this.events.some((e) => e.type === "write" || e.type === "edit");
    if (!hasCodeEvents) {
      const fullText = this.planChunks.join("") + "\n" + this.summaryChunks.join("");
      const fenceRegex =
        /```(?:[a-zA-Z0-9_-]+)?\s*(?:path=|filename=|file=)?["']?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)?["']?\r?\n([\s\S]*?)```/gi;
      let fMatch: RegExpExecArray | null;
      while ((fMatch = fenceRegex.exec(fullText)) !== null) {
        let filePath = fMatch[1];
        const fileContent = fMatch[2];
        if (!filePath) {
          // Infer file from language header or content
          if (fileContent.includes("<!DOCTYPE html") || fileContent.includes("<html")) {
            filePath = "index.html";
          }
        }
        if (
          filePath &&
          fileContent &&
          !this.events.some((e) => (e.type === "write" || e.type === "edit") && "path" in e && e.path === filePath)
        ) {
          this.emit({ type: "write", path: filePath, content: fileContent.trim() });
        }
      }
    }

    const plan = this.planChunks.join("").trim();
    const summary = this.summaryChunks.join("").trim();

    return {
      truncated,
      plan,
      summary,
      events: [...this.events],
    };
  }

  public getEvents(): AgentEvent[] {
    return [...this.events];
  }
}
