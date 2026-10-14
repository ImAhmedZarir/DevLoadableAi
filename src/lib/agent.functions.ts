import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { ModelProvider } from "./agent-provider.server";

type AgentOut = {
  message: string;
  logs?: Array<{ kind: string; label: string; detail?: string }>;
  files?: Array<{ path: string; content: string }>;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const sendAgentMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        prompt: z.string().min(1),
        mode: z.enum(["chat", "plan", "build"]).default("build"),
        provider: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { streamModel, MODELS, DEFAULT_PROVIDER, DEFAULT_SYSTEM_PROMPT } =
      await import("./agent-provider.server");
    const { getInjectedSkills } = await import("./skills.server");
    const { AgentStreamingParser, validateFilePath, applyFileEdit } =
      await import("./agent-parser.server");

    const { data: settings } = await supabase
      .from("app_settings")
      .select("key,value")
      .in("key", [
        "master_prompt",
        "agent_unlimited_requests",
        "agent_provider",
        "disabled_skills",
      ]);
    const settingsMap = new Map<string, string>(
      (settings ?? []).map((s: { key: string; value: string }) => [s.key, s.value]),
    );

    let disabledSkills: string[] = [];
    try {
      disabledSkills = JSON.parse(settingsMap.get("disabled_skills") || "[]");
    } catch {
      disabledSkills = [];
    }

    const { prompt: skillsPrompt, loadedSkillNames } = getInjectedSkills(
      data.prompt,
      disabledSkills,
    );

    // Prompt precedence: DEFAULT_SYSTEM_PROMPT + admin master_prompt appended as "Additional instructions" (if set) + injected skills
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    const adminMasterPrompt = (settingsMap.get("master_prompt") ?? "").trim();
    if (adminMasterPrompt) {
      systemPrompt += `\n\nAdditional instructions:\n${adminMasterPrompt}`;
    }
    if (skillsPrompt) {
      systemPrompt += `\n\n${skillsPrompt}`;
    }

    const requestedProvider = data.provider;
    const providerId: ModelProvider =
      requestedProvider === "build-mini" || requestedProvider === "build-max"
        ? requestedProvider
        : DEFAULT_PROVIDER;
    const model = MODELS[providerId].model;

    // Unified fail-closed daily quota check
    const { checkAndConsumeMessageQuota } = await import("./quota-policy.server");
    await checkAndConsumeMessageQuota({
      supabase,
      userId,
      isAutofix: false,
      idempotencyKey: `${data.projectId}:${data.prompt}`,
    });

    // Verify project ownership
    const { data: proj } = await supabase
      .from("projects")
      .select("id,name,agent_notes")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found or unauthorized");

    // Load latest 20 messages (descending, then reversed for chronological context) + current files
    const [{ data: historyRaw }, { data: files }] = await Promise.all([
      supabase
        .from("messages")
        .select("role,content")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("project_files")
        .select("path,content,is_upload")
        .eq("project_id", data.projectId),
    ]);

    const history = (historyRaw ?? []).slice().reverse();

    const filesSummary =
      (files ?? [])
        .map((f) => `- ${f.path}${f.is_upload ? " (upload)" : ""}: ${f.content.length}b`)
        .join("\n") || "(none)";
    const FILE_BUDGET = 120_000;
    let fileBytes = 0;
    const includedFiles: string[] = [];
    for (const f of (files ?? []).filter(
      (f) => !f.is_upload || /\.(html|css|js|php|json|md|txt|svg)$/i.test(f.path),
    )) {
      if (fileBytes >= FILE_BUDGET) break;
      const remaining = FILE_BUDGET - fileBytes;
      const body =
        f.content.length > remaining
          ? f.content.slice(0, remaining) + "\n/* ...truncated... */"
          : f.content;
      includedFiles.push(`--- FILE: ${f.path}\n${body}`);
      fileBytes += body.length;
    }

    const fullFiles = includedFiles.join("\n\n");

    const recentHistory = (history ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }));

    const projectNotesContext = proj.agent_notes ? `Project Notes:\n${proj.agent_notes}\n\n` : "";

    const appNameInstruction =
      proj?.name &&
      !["untitled project", "devloadable", "loadable"].includes(proj.name.toLowerCase().trim())
        ? `APP NAME & BRAND IDENTITY: The application being built is named "${proj.name}". Every page title, logo, header text, and UI copy MUST be branded as "${proj.name}". Never call it DevLoadable.\n\n`
        : "";

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `${appNameInstruction}${projectNotesContext}Files:\n${filesSummary}\n\nCurrent contents:\n${fullFiles || "(none)"}`,
      },
      ...(data.mode !== "build"
        ? [
            {
              role: "system" as const,
              content:
                data.mode === "plan"
                  ? "PLAN MODE: Do not use dl-write, dl-edit or dl-delete. Answer in plain text. Give a concise numbered implementation plan (pages, files, features, steps)."
                  : "CHAT MODE: Do not use dl-write, dl-edit or dl-delete. Answer in plain text. Answer the user's question helpfully.",
            },
          ]
        : []),
      ...recentHistory,
      { role: "user", content: data.prompt.slice(0, 8000) },
    ];

    // Insert user message + log
    await supabase.from("messages").insert({
      project_id: data.projectId,
      user_id: userId,
      role: "user",
      content: data.prompt,
      kind: "text",
    });
    await supabase.from("work_logs").insert({
      project_id: data.projectId,
      user_id: userId,
      kind: "info",
      label: "Planning build",
      detail: `Model: ${model} | Skills: ${loadedSkillNames.length ? loadedSkillNames.join(", ") : "none"} | System prompt length: ${systemPrompt.length} chars`,
    });

    const conversationMessages: ChatMessage[] = [...messages];
    const filesMap = new Map<string, string>();
    for (const f of files ?? []) {
      filesMap.set(f.path, f.content);
    }

    let filesWritten = 0;
    let askedQuestion = false;
    let finalSummary = "";
    const MAX_ROUNDS = 6;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const readPaths: string[] = [];
      const editErrors: string[] = [];
      let roundRaw = "";

      const parser = new AgentStreamingParser({
        onEvent: async (event) => {
          if (event.type === "status") {
            await supabase.from("work_logs").insert({
              project_id: data.projectId,
              user_id: userId,
              kind: "status",
              label: event.status.slice(0, 200),
            });
          } else if (event.type === "write") {
            if (data.mode !== "build") return;
            const val = validateFilePath(event.path, event.content);
            if (!val.valid) {
              await supabase.from("work_logs").insert({
                project_id: data.projectId,
                user_id: userId,
                kind: "error",
                label: `Rejected ${event.path.slice(0, 100)}`,
                detail: val.error,
              });
              return;
            }
            const existing = filesMap.has(event.path);
            filesMap.set(event.path, event.content);
            filesWritten++;
            const { error: upErr } = await supabase.from("project_files").upsert(
              {
                project_id: data.projectId,
                user_id: userId,
                path: event.path,
                content: event.content,
                is_upload: false,
              },
              { onConflict: "project_id,path" },
            );
            if (upErr) {
              await supabase.from("work_logs").insert({
                project_id: data.projectId,
                user_id: userId,
                kind: "error",
                label: `Failed ${event.path}`,
                detail: upErr.message,
              });
            } else {
              await supabase.from("work_logs").insert({
                project_id: data.projectId,
                user_id: userId,
                kind: existing ? "edited" : "created",
                label: `${existing ? "Edited" : "Created"} ${event.path}`,
              });
            }
          } else if (event.type === "edit") {
            if (data.mode !== "build") return;
            const val = validateFilePath(event.path);
            if (!val.valid) {
              editErrors.push(`Error editing ${event.path}: ${val.error}`);
              await supabase.from("work_logs").insert({
                project_id: data.projectId,
                user_id: userId,
                kind: "error",
                label: `Rejected edit ${event.path.slice(0, 100)}`,
                detail: val.error,
              });
              return;
            }
            const current = filesMap.get(event.path);
            if (current === undefined) {
              editErrors.push(`Error editing ${event.path}: file does not exist.`);
              await supabase.from("work_logs").insert({
                project_id: data.projectId,
                user_id: userId,
                kind: "error",
                label: `Failed edit ${event.path}`,
                detail: "File does not exist",
              });
              return;
            }
            const editRes = applyFileEdit(current, event.oldText, event.newText);
            if (!editRes.success || editRes.result === undefined) {
              editErrors.push(`Error editing ${event.path}: ${editRes.error}`);
              await supabase.from("work_logs").insert({
                project_id: data.projectId,
                user_id: userId,
                kind: "error",
                label: `Failed edit ${event.path}`,
                detail: editRes.error,
              });
              return;
            }
            filesMap.set(event.path, editRes.result);
            filesWritten++;
            await supabase.from("project_files").upsert(
              {
                project_id: data.projectId,
                user_id: userId,
                path: event.path,
                content: editRes.result,
                is_upload: false,
              },
              { onConflict: "project_id,path" },
            );
            await supabase.from("work_logs").insert({
              project_id: data.projectId,
              user_id: userId,
              kind: "edited",
              label: `Edited ${event.path}`,
            });
          } else if (event.type === "delete") {
            if (data.mode !== "build") return;
            filesMap.delete(event.path);
            await supabase
              .from("project_files")
              .delete()
              .eq("project_id", data.projectId)
              .eq("path", event.path);
            await supabase.from("work_logs").insert({
              project_id: data.projectId,
              user_id: userId,
              kind: "deleted",
              label: `Deleted ${event.path}`,
            });
          } else if (event.type === "read") {
            readPaths.push(event.path);
          } else if (event.type === "notes") {
            await supabase
              .from("projects")
              .update({ agent_notes: event.notes })
              .eq("id", data.projectId);
          } else if (event.type === "ask") {
            askedQuestion = true;
            await supabase.from("messages").insert({
              project_id: data.projectId,
              user_id: userId,
              role: "assistant",
              content: event.question,
              kind: "question",
              meta: { options: event.options },
            });
          }
        },
      });

      try {
        roundRaw = await streamModel(providerId, conversationMessages, async (chunk) => {
          parser.feed(chunk);
        });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await supabase.from("work_logs").insert({
          project_id: data.projectId,
          user_id: userId,
          kind: "error",
          label: "Agent error",
          detail: err,
        });
        await supabase.from("messages").insert({
          project_id: data.projectId,
          user_id: userId,
          role: "assistant",
          content: `Build failed: ${err}`,
          kind: "text",
        });
        throw new Error(err);
      }

      const parseResult = parser.finish();
      if (parseResult.summary) {
        finalSummary = parseResult.summary;
      } else if (parseResult.plan && !finalSummary) {
        finalSummary = parseResult.plan;
      }

      if (askedQuestion) {
        break;
      }

      if (parseResult.truncated) {
        const trunc = parseResult.truncated;
        await supabase.from("work_logs").insert({
          project_id: data.projectId,
          user_id: userId,
          kind: "error",
          label: `File ${trunc.path} was cut off`,
          detail: "Stream ended before file tag closed; requesting compact rewrite",
        });
        conversationMessages.push({
          role: "assistant",
          content: roundRaw,
        });
        conversationMessages.push({
          role: "user",
          content: `[tool results]\nFile ${trunc.path} was cut off. Please rewrite only ${trunc.path} using <dl-write path="${trunc.path}">, more compactly.`,
        });
        continue;
      }

      if (readPaths.length > 0 || editErrors.length > 0) {
        const toolResults: string[] = [];
        for (const rPath of readPaths) {
          const content = filesMap.get(rPath);
          if (content !== undefined) {
            toolResults.push(`--- FILE: ${rPath}\n${content}`);
          } else {
            toolResults.push(`--- FILE: ${rPath}\nfile not found`);
          }
        }
        for (const err of editErrors) {
          toolResults.push(err);
        }

        conversationMessages.push({
          role: "assistant",
          content: roundRaw,
        });
        conversationMessages.push({
          role: "user",
          content: `[tool results]\n${toolResults.join("\n\n")}`,
        });
        continue;
      }

      // No reads, no edit errors, no truncation -> done
      break;
    }

    if (!askedQuestion) {
      const summaryMsg =
        finalSummary ||
        (filesWritten > 0
          ? `Changes applied successfully across ${filesWritten} file${filesWritten === 1 ? "" : "s"}.`
          : "Done.");
      await supabase.from("messages").insert({
        project_id: data.projectId,
        user_id: userId,
        role: "assistant",
        content: summaryMsg,
        kind: "summary",
      });
      finalSummary = summaryMsg;
    }

    // Bump project updated_at
    await supabase
      .from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.projectId);

    return { message: finalSummary, filesWritten };
  });

export {
  startRun,
  runStep,
  cancelRun,
  retryStep,
  skipStep,
  executeRun,
} from "./agent-run.functions";

export const publishProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        slug: z
          .string()
          .min(3)
          .max(40)
          .regex(
            /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{3,}$/,
            "lowercase letters, numbers, hyphens (3-40 characters)",
          ),
        showBadge: z.boolean().default(true).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");
    const { data: files } = await supabase
      .from("project_files")
      .select("path")
      .eq("project_id", data.projectId);
    if (!files?.some((f) => f.path === "index.html"))
      throw new Error("Project must have an index.html to publish");

    const { data: existing } = await supabase
      .from("publications")
      .select("slug,project_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (existing && existing.project_id !== data.projectId)
      throw new Error("Slug is already taken");

    const pubPayload: Record<string, unknown> = {
      project_id: data.projectId,
      user_id: userId,
      slug: data.slug,
      entry_path: "index.html",
      show_badge: data.showBadge ?? true,
      published_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from("publications")
      .upsert(pubPayload as unknown as Database["public"]["Tables"]["publications"]["Insert"], {
        onConflict: "project_id",
      });

    if (error && (error.message.includes("show_badge") || error.message.includes("schema cache"))) {
      const fallbackPayload = {
        project_id: data.projectId,
        user_id: userId,
        slug: data.slug,
        entry_path: "index.html",
        published_at: new Date().toISOString(),
      };
      const retry = await supabase
        .from("publications")
        .upsert(
          fallbackPayload as unknown as Database["public"]["Tables"]["publications"]["Insert"],
          { onConflict: "project_id" },
        );
      error = retry.error;
    }

    if (error) throw new Error(error.message);
    return { slug: data.slug };
  });

export const checkSlugAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        slug: z.string().min(3).max(40),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("publications")
      .select("slug,project_id")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!existing || existing.project_id === data.projectId) {
      return { available: true };
    }
    return { available: false };
  });

export const unpublishProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("publications").delete().eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const uploadProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        path: z.string().min(1).max(500),
        content: z.string().max(10_000_000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project ownership
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found or unauthorized");

    const { validateFilePath, normalizeFilePath } = await import("./agent-parser.server");
    const cleanPath = normalizeFilePath(data.path.replace(/^\/+/, ""));
    const val = validateFilePath(cleanPath, data.content);
    if (!val.valid) {
      throw new Error(`Invalid file upload: ${val.error || "Blocked by path sandbox"}`);
    }

    const { error } = await supabase.from("project_files").upsert(
      {
        project_id: data.projectId,
        user_id: userId,
        path: cleanPath,
        content: data.content,
        is_upload: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,path" },
    );
    if (error) throw new Error(error.message);
    await supabase.from("work_logs").insert({
      project_id: data.projectId,
      user_id: userId,
      kind: "info",
      label: `Uploaded ${cleanPath}`,
    });
    return { ok: true, path: cleanPath };
  });

export const bulkUploadProjectFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        files: z
          .array(
            z.object({
              path: z.string().min(1).max(500),
              content: z.string().max(10_000_000),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project ownership
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found or unauthorized");

    const { validateFilePath, normalizeFilePath } = await import("./agent-parser.server");

    // Aggregate size check: max 25MB total across bulk upload batch
    let totalBatchBytes = 0;
    const MAX_BATCH_BYTES = 25_000_000;

    const validatedRecords: Array<{
      project_id: string;
      user_id: string;
      path: string;
      content: string;
      is_upload: boolean;
      updated_at: string;
    }> = [];

    for (const f of data.files) {
      totalBatchBytes += f.content.length;
      if (totalBatchBytes > MAX_BATCH_BYTES) {
        throw new Error("Bulk archive upload exceeds aggregate limit (25MB).");
      }
      const cleanPath = normalizeFilePath(f.path.replace(/^\/+/, ""));
      const val = validateFilePath(cleanPath, f.content);
      if (val.valid) {
        validatedRecords.push({
          project_id: data.projectId,
          user_id: userId,
          path: cleanPath,
          content: f.content,
          is_upload: true,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (validatedRecords.length === 0) {
      throw new Error("No safe files found in upload batch.");
    }

    const { error } = await supabase
      .from("project_files")
      .upsert(validatedRecords, { onConflict: "project_id,path" });
    if (error) throw new Error(error.message);

    await supabase.from("work_logs").insert({
      project_id: data.projectId,
      user_id: userId,
      kind: "info",
      label: `Imported ${validatedRecords.length} files from archive`,
    });
    return { ok: true, count: validatedRecords.length };
  });

export const downloadProjectZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project ownership
    const { data: proj } = await supabase
      .from("projects")
      .select("id,name")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found or unauthorized");

    const { data: files, error } = await supabase
      .from("project_files")
      .select("path,content")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const f of files ?? []) zip.file(f.path, f.content);
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    // Efficient base64 stringification via Node Buffer without string-concatenation memory explosion
    const b64 = Buffer.isBuffer(buf) ? buf.toString("base64") : Buffer.from(buf).toString("base64");

    const safeProjName = (proj.name || `project-${data.projectId}`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "");

    return { base64: b64, filename: `${safeProjName || "project"}.zip` };
  });

export const saveProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        path: z.string().min(1).max(500),
        content: z.string().max(10_000_000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const path = data.path.replace(/^\/+/, "");
    const { error } = await supabase.from("project_files").upsert(
      {
        project_id: data.projectId,
        user_id: userId,
        path,
        content: data.content,
        is_upload: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,path" },
    );
    if (error) throw new Error(error.message);
    await supabase.from("work_logs").insert({
      project_id: data.projectId,
      user_id: userId,
      kind: "edited",
      label: `Saved ${path}`,
    });
    return { ok: true };
  });

export const deleteProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        path: z.string().min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const path = data.path.replace(/^\/+/, "");
    const { error } = await supabase
      .from("project_files")
      .delete()
      .eq("project_id", data.projectId)
      .eq("path", path);
    if (error) throw new Error(error.message);
    await supabase.from("work_logs").insert({
      project_id: data.projectId,
      user_id: userId,
      kind: "deleted",
      label: `Deleted ${path}`,
    });
    return { ok: true };
  });
