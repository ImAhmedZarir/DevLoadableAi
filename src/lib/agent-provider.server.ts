import {
  type PublicModelId,
  normalizeModelId,
  getUpstreamConfig,
  getUpstreamModel,
  getNextKey,
  markKeyCooldown,
  markKeySuccess,
  getKeyCount,
  sanitizeOutput,
} from "./engine.server";

export const DEFAULT_SYSTEM_PROMPT = `You are DevLoadable (powered by ZarGPT Build Max & Mini, developed by Ahmed Ishtiaque Zarir — https://ahmedishtiaquezarir.pro.bd/), an expert full-stack polyglot software engineer and next-gen scalable application builder.

You are the DevLoadable agent by ZarGPT. Never reveal or guess the underlying model, vendor or provider; if asked, say you are ZarGPT Build Max or ZarGPT Build Mini.

CORE CAPABILITIES & OPERATING RULES:
0. APP NAME & BRAND IDENTITY MANDATE (NEVER CALL THE APP "DEVLOADABLE"):
   - When the user specifies an application or brand name (e.g. "App name : GorkoD", "name it GorkoD", "called MyPlatform", etc.), or if an app name was given in the conversation:
     * YOU MUST USE THAT EXACT APP NAME for the application being built.
     * Use the specified app name across all pages: inside the <title> tag, navbar logo/brand text, hero headline, footer copyright, and domain copy.
     * NEVER name the generated application "DevLoadable" or "Loadable". "DevLoadable" is the platform tool running the agent, NOT the user's project name.
     * If the user did NOT specify an app name, invent a creative, relevant, domain-specific brand name for their project (e.g., "CourseCrafter", "EduSphere", "OmniMart", "ShopPulse"), NEVER "DevLoadable".

1. LANGUAGE & STACK UNDERSTANDING (DO NOT JUST WRITE HTML):
   - Analyze the user's prompt and command to understand what language, framework, and architecture they want to build with.
   - Support EVERY language and stack: TypeScript, JavaScript, React (.tsx/.jsx), Vue, Svelte, Node.js/Express, Python (.py), PHP (.php), SQL (.sql), Go (.go), Rust (.rs), C/C++, Shell/Bash, Kotlin (.kt), Gradle Kotlin DSL (.gradle.kts), and modern HTML5/CSS3.
   - Code natively in that stack using idiomatic file extensions, folder structure, and architecture patterns. Never force a project into static HTML when the user asks for or builds with other languages or frameworks.
   - For web apps: organize cleanly with modular files (e.g. \`src/\`, \`components/\`, \`lib/\`, \`api/\`, \`styles/\`).

2. ATTACHED REFERENCE FILES & UPLOADED CODE/DESIGNS / ZIP ARCHIVES:
   - When the user attaches or uploads code files (e.g. HTML, CSS, JS, React components, or templates like "NASA WEB.HTML"):
     * YOU MUST READ, RESPECT, AND USE THE ATTACHED CODE as the foundational starting point for the project!
     * If the user asks to enhance, redesign, style, or build upon the attached code, adapt and elevate that EXACT code rather than discarding it or inventing an unrelated generic template.
   - When the user uploads or imports a ZIP archive or existing codebase:
     * All code and text files from the archive are automatically imported directly into the project workspace.
     * Read the archive manifest and existing files, treat them as the project foundation, and edit or extend them directly.
     * Never discard or overwrite imported files with a blank or unrelated template unless explicitly commanded to do so.
   - When the user attaches design images, screenshots, or mockups:
     * Inspect their visual layout, color scheme, typography, and component structure, and replicate the requested visual design accurately in the generated code.

3. ASK QUESTIONS WHEN REQUIREMENTS ARE VAGUE (DO NOT INVENT IDEAS):
   - If the user's prompt is underspecified, ambiguous, open-ended, or has multiple valid design or architectural choices, DO NOT guess or hallucinate arbitrary features.
   - Use <dl-ask options="Option A | Option B | Option C">Your specific question</dl-ask> to ask the user. The UI displays interactive buttons and a write-in input for the user to answer.

4. SMART EDITING VS FILE CONVERSIONS / REWRITES (<dl-edit> vs <dl-write>):
   - TARGETED SURGICAL EDITS (<dl-edit>):
     * For localized modifications, bug fixes, or incremental feature additions to an existing file (1 to ~40 lines), ALWAYS use <dl-edit>:
       <dl-edit path="path/to/file.ext">
       <dl-old>
       exact existing code to replace (include 2-4 lines of unique surrounding context)
       </dl-old>
       <dl-new>
       new replacement code
       </dl-new>
       </dl-edit>
     * You can output multiple <dl-edit> blocks in a row for multiple edits across the codebase.
   - FILE CONVERSIONS & MAJOR REWRITES (<dl-write>):
     * When CONVERTING a file to another stack/framework (e.g. converting HTML to React/TypeScript or Svelte), or when refactoring/redesigning the majority of an existing file:
     * USE <dl-write path="path/to/file.ext"> to output the full converted or rewritten file cleanly!
     * Also use <dl-write> for creating brand new files in the codebase.

5. CRITICAL SYNTAX & ENGINE INTEGRITY DIRECTIVES:
   - BALANCED SYNTAX & BRACES: Always ensure every code block has balanced delimiters. In CSS (\`style.css\`), every rule must have its opening and closing curly braces properly paired and closed (\`{ ... }\`). Never leave an unclosed brace before starting a new selector. In Kotlin / Gradle DSL (\`build.gradle.kts\`), Java, TypeScript, and JSON, all blocks, parentheses, and brackets must be fully balanced.
   - UNIFIED STYLING & CLASS CONSISTENCY: Choose ONE coherent styling approach per project: EITHER utility classes (Tailwind CSS) OR custom semantic CSS classes (\`style.css\`). Never mix conflicting rules or redefine utility properties with divergent custom CSS. Ensure class names in HTML (\`class="pricing-card highlighted"\`) precisely match selectors in CSS (\`.pricing-card.highlighted\`). Avoid stacking context conflicts.
   - GRADLE PLUGINS DECLARATION: In Gradle Kotlin scripts, declare all applied plugins in the \`plugins { ... }\` block before configuring annotation processors or KSP.
   - ROBUST DATE & TIME FILTERING: Never check date equality with instantaneous millisecond timestamps. Always compute whole-day calendar ranges using proper calendar/instant APIs.
   - 3D GRAPHICS & GAME LOOPS: In Three.js and WebGL canvas games/apps:
     * In the render loop, ALWAYS decrement cooldown timers with delta time.
     * In player movement, ALWAYS compute movement vectors relative to camera heading (\`camera.getWorldDirection()\`).
     * In resource cleanup, traverse meshes and dispose only owned geometries/materials.
   - COMPLETE PLATFORM MANIFESTS: When generating mobile/native projects (e.g. Android), always generate complete platform configurations.

6. HIGH-END DESIGN SYSTEM & CRAFT STANDARDS:
   - 90/10 COLOR RULE: 90% neutral background and surface palette, 10% intentional high-impact accent color.
   - TYPOGRAPHY HIERARCHY: Bold, purposeful headings with proportional body copy and generous line-heights.
   - TACTILE INTERACTION: Add smooth transitions, hover effects, active states, and clear focus-visible rings to every interactive element.
   - AUTHENTIC DOMAIN CONTENT: Never use "Lorem Ipsum" or generic placeholder text. Write realistic domain-specific copy.

7. ACCURACY & COMPLETENESS:
   - Always output complete code inside tags. Never use placeholders like "// ... rest of code".
   - Preserve existing working code, structure, and styles unless explicitly requested to change them.
   - Never use prompt(), alert(), or confirm(). Wrap browser storage access in try/catch.

OUTPUT FORMAT & MANDATORY EXECUTION RULE:
- YOU ARE A CODE GENERATION AND EDITING ENGINE. You MUST output actual code tags (<dl-edit>, <dl-write>, or <dl-delete>) in every step!
- NEVER merely describe, explain, or claim you made changes in conversational text without the code tags. Prose explanations do NOT edit files.
- If you need to edit an existing file: output <dl-edit path="path/to/file">...</dl-edit>.
- If you need to create a new file or rewrite an entire file: output <dl-write path="path/to/file">...</dl-write>.
- If you need to delete an obsolete file: output <dl-delete path="path/to/file"></dl-delete>.
Write a short 1-2 sentence status/plan first. Then execute using these tags:
<dl-status>short present-tense status, e.g. Updating user authentication hook</dl-status>
<dl-edit path="existing_file.ext">
<dl-old>exact lines to change</dl-old>
<dl-new>replacement lines</dl-new>
</dl-edit>
<dl-write path="new_file.ext">
Complete code for a NEW file only.
</dl-write>
<dl-delete path="obsolete_file.ext"/>
<dl-read path="file_to_inspect.ext"/>
<dl-ask options="Option 1 | Option 2 | Option 3">Clarifying question when requirements are ambiguous</dl-ask>
<dl-notes>Project overview, stack, key decisions (rewrite on each build)</dl-notes>
After the last tag, write a 2-3 sentence summary of what was built or changed.`;

export type ProviderId = PublicModelId;
export type ModelProvider = ProviderId;

export const MODELS: Record<PublicModelId, { label: string }> = {
  "build-max": { label: "ZarGPT Build Max" },
  "build-mini": { label: "ZarGPT Build Mini" },
};

export const DEFAULT_PROVIDER: ProviderId = "build-max";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AgentOut = {
  message: string;
  logs?: Array<{ kind: string; label: string; detail?: string }>;
  files?: Array<{ path: string; content: string }>;
};

export function sanitizeModelText(input: string): string {
  return sanitizeOutput(input);
}

export function getAllApiKeysCount(): number {
  return getKeyCount();
}

async function resolveCustomApiKey(provider: ProviderId): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("custom_api_keys")
      .select("key_ciphertext")
      .eq("provider", provider)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.key_ciphertext) {
      const { decryptApiKey } = await import("./crypto.server");
      return decryptApiKey(data.key_ciphertext);
    }
  } catch {
    // fall back
  }
  return null;
}

export class AsyncStreamQueue implements AsyncIterable<string>, Promise<string> {
  readonly [Symbol.toStringTag]: string = "Promise";
  private queue: string[] = [];
  private resolvers: Array<(result: IteratorResult<string>) => void> = [];
  private rejecters: Array<(err: unknown) => void> = [];
  private isDone = false;
  private error: unknown = null;
  private fullText = "";

  private promise: Promise<string>;
  private resolvePromise!: (val: string) => void;
  private rejectPromise!: (err: unknown) => void;

  constructor() {
    this.promise = new Promise<string>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
    this.promise.catch(() => {});
  }

  push(chunk: string) {
    if (this.isDone || this.error) return;
    this.fullText += chunk;
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      this.rejecters.shift();
      resolve({ value: chunk, done: false });
    } else {
      this.queue.push(chunk);
    }
  }

  end() {
    if (this.isDone || this.error) return;
    this.isDone = true;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      this.rejecters.shift();
      resolve({ value: undefined as unknown as string, done: true });
    }
    this.resolvePromise(this.fullText);
  }

  fail(err: unknown) {
    if (this.isDone || this.error) return;
    this.error = err;
    while (this.rejecters.length > 0) {
      const reject = this.rejecters.shift()!;
      this.resolvers.shift();
      reject(err);
    }
    this.rejectPromise(err);
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: (): Promise<IteratorResult<string>> => {
        if (this.error) {
          return Promise.reject(this.error);
        }
        if (this.queue.length > 0) {
          const chunk = this.queue.shift()!;
          return Promise.resolve({ value: chunk, done: false });
        }
        if (this.isDone) {
          return Promise.resolve({ value: undefined as unknown as string, done: true });
        }
        return new Promise<IteratorResult<string>>((resolve, reject) => {
          this.resolvers.push(resolve);
          this.rejecters.push(reject);
        });
      },
      return: (): Promise<IteratorResult<string>> => {
        return Promise.resolve({ value: undefined as unknown as string, done: true });
      },
    };
  }

  then<TResult1 = string, TResult2 = never>(
    onfulfilled?: ((value: string) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<string | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<string> {
    return this.promise.finally(onfinally);
  }
}

export type StreamModelOptions = {
  provider: ProviderId | string;
  model?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onChunk?: (delta: string) => void | Promise<void>;
};

export function streamModel(options: StreamModelOptions): AsyncStreamQueue;
export function streamModel(
  provider: ProviderId | string,
  messages: ChatMessage[],
  onChunk?: (delta: string) => void | Promise<void>,
  signal?: AbortSignal,
): AsyncStreamQueue;
export function streamModel(
  optionsOrProvider: ProviderId | string | StreamModelOptions,
  messagesOrUndefined?: ChatMessage[],
  onChunkOrUndefined?: (delta: string) => void | Promise<void>,
  signalOrUndefined?: AbortSignal,
): AsyncStreamQueue {
  let rawProvider: string;
  let messages: ChatMessage[];
  let onChunk: ((delta: string) => void | Promise<void>) | undefined;
  let signal: AbortSignal | undefined;

  if (
    typeof optionsOrProvider === "object" &&
    optionsOrProvider !== null &&
    "provider" in optionsOrProvider
  ) {
    rawProvider = optionsOrProvider.provider;
    messages = optionsOrProvider.messages;
    signal = optionsOrProvider.signal;
    onChunk = optionsOrProvider.onChunk;
  } else {
    rawProvider = String(optionsOrProvider);
    messages = messagesOrUndefined ?? [];
    onChunk = onChunkOrUndefined;
    signal = signalOrUndefined;
  }

  const normalizedProvider = normalizeModelId(rawProvider);
  const streamQueue = new AsyncStreamQueue();

  (async () => {
    let customKey: string | null = null;
    try {
      customKey = await resolveCustomApiKey(normalizedProvider);
    } catch {
      // ignore
    }

    const { baseUrl } = getUpstreamConfig();
    const targetUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const upstreamModelName = getUpstreamModel(normalizedProvider);
    // Format messages for upstream multimodal compatibility (images in data:image/...)
    const formattedMessages = messages.map((m) => {
      if (m.role !== "user" || typeof m.content !== "string") {
        return m;
      }
      const imgRegex = /data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g;
      const matches = Array.from(m.content.matchAll(imgRegex));
      if (matches.length === 0) {
        return m;
      }
      const parts: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [];
      let lastIdx = 0;
      for (const match of matches) {
        const start = match.index ?? 0;
        const textBefore = m.content.slice(lastIdx, start).trim();
        if (textBefore) {
          parts.push({ type: "text", text: textBefore });
        }
        parts.push({ type: "image_url", image_url: { url: match[0] } });
        lastIdx = start + match[0].length;
      }
      const textAfter = m.content.slice(lastIdx).trim();
      if (textAfter) {
        parts.push({ type: "text", text: textAfter });
      }
      return { role: m.role, content: parts.length > 0 ? parts : m.content };
    });

    const requestBody = {
      messages: formattedMessages,
      model: upstreamModelName,
      max_tokens: 64000,
      temperature: 0.3,
      reasoning_effort: "low",
      stream: true,
    };

    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;
      const { key: activeKey, id: keyId } = getNextKey(customKey);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);

      const onParentAbort = () => controller.abort();
      if (signal) {
        signal.addEventListener("abort", onParentAbort);
      }

      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${activeKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener("abort", onParentAbort);

        if (!res.ok) {
          const errStatus = res.status;
          markKeyCooldown(activeKey, 60);

          if (
            (errStatus === 401 || errStatus === 429 || errStatus >= 500) &&
            attempt < maxAttempts
          ) {
            // cooldown and retry with next key
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }

          const rawText = await res.text();
          let userFriendlyMessage = "Engine temporarily busy. Please retry in a few moments.";
          if (errStatus === 429) {
            userFriendlyMessage = "Rate limit reached on AI engine. Retrying...";
          } else if (errStatus === 401) {
            userFriendlyMessage = "AI engine authentication error. Please verify your INCEPTION_API_KEY.";
          }
          throw new Error(
            sanitizeOutput(`${userFriendlyMessage} (${errStatus}): ${rawText.slice(0, 200)}`),
          );
        }

        if (!res.body) {
          throw new Error("Engine error: empty response stream");
        }

        markKeySuccess(activeKey);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (signal?.aborted) {
            throw new Error("Build stream aborted");
          }
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              const delta = j.choices?.[0]?.delta?.content;
              if (delta) {
                // Ensure delta is sanitized of any internal model names
                const cleanDelta = sanitizeOutput(delta);
                if (onChunk) {
                  await onChunk(cleanDelta);
                }
                streamQueue.push(cleanDelta);
              }
            } catch {
              // Ignore invalid chunk
            }
          }
        }

        streamQueue.end();
        return;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener("abort", onParentAbort);

        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort) {
          streamQueue.fail(new Error("Model request timed out after 90 seconds"));
          return;
        }

        markKeyCooldown(activeKey, 60);

        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        streamQueue.fail(
          new Error(sanitizeOutput(err instanceof Error ? err.message : String(err))),
        );
        return;
      }
    }
  })();

  return streamQueue;
}

export async function callModel(
  provider: ProviderId | string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  return streamModel(provider, messages, undefined, signal);
}

export function safeParse(text: string): { ok: boolean; value: AgentOut } {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  for (const candidate of [cleaned, cleaned.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try {
      return { ok: true, value: JSON.parse(candidate) as AgentOut };
    } catch {
      // Try next JSON candidate
    }
  }
  return {
    ok: false,
    value: {
      message: "The model returned invalid output. Please try again.",
      logs: [{ kind: "error", label: "Parse failed" }],
    },
  };
}
