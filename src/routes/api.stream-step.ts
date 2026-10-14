import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { streamModel, DEFAULT_PROVIDER, DEFAULT_SYSTEM_PROMPT } from "@/lib/agent-provider.server";
import {
  AgentStreamingParser,
  validateFilePath,
  applyFileEdit,
  normalizeFilePath,
  type AgentEvent,
} from "@/lib/agent-parser.server";
import { getInjectedSkills } from "@/lib/skills.server";
import { extractAppNameFromCode, generateProjectNameFromIdea } from "@/lib/project-naming";

export const Route = createFileRoute("/api/stream-step")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader) {
          return new Response(JSON.stringify({ error: "Unauthorized: No auth header" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let bodyJson: { runId: string; idx: number };
        try {
          bodyJson = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { runId, idx } = bodyJson;
        if (!runId || typeof idx !== "number") {
          return new Response(JSON.stringify({ error: "Missing runId or idx" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response(
            JSON.stringify({ error: "Server error: missing Supabase environment variables" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) {
          return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        let userId: string | null = null;
        try {
          const { data: claimsData } = await supabase.auth.getClaims(token);
          if (claimsData?.claims?.sub) {
            userId = claimsData.claims.sub;
          }
        } catch {
          // fallback to getUser
        }

        if (!userId) {
          const {
            data: { user },
            error: userErr,
          } = await supabase.auth.getUser(token);
          if (userErr || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized: invalid user token" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          userId = user.id;
        }

        const db = supabase;

        // Fetch run
        const { data: run } = await db
          .from("build_runs")
          .select("*")
          .eq("id", runId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!run) {
          return new Response(JSON.stringify({ error: "Run not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Fetch steps
        const { data: allSteps } = await db
          .from("build_steps")
          .select("*")
          .eq("run_id", runId)
          .order("idx");

        const currentStep = (allSteps ?? []).find((s) => s.idx === idx);
        if (!currentStep) {
          return new Response(JSON.stringify({ error: "Step not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // 1. Double-execution guard: if step is already done, return existing state safely
        if (currentStep.status === "done") {
          return new Response(
            JSON.stringify({
              status: "already_completed",
              stepId: currentStep.id,
              summary: currentStep.summary || "Step already completed",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // 2. Concurrency guard: if step is already running and started recently (<90s), reject duplicate execution
        if (currentStep.status === "running" && currentStep.started_at) {
          const startedMs = new Date(currentStep.started_at).getTime();
          if (Date.now() - startedMs < 90_000) {
            return new Response(
              JSON.stringify({
                status: "already_running",
                stepId: currentStep.id,
                message: "Step is currently being processed by another stream.",
              }),
              {
                status: 409,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        }

        const doneSteps = (allSteps ?? []).filter((s) => s.status === "done");
        const remainingSteps = (allSteps ?? []).filter((s) => s.idx > idx);
        const isLastStep = idx === (allSteps ?? []).length - 1;

        // Atomic claim: Mark step running only if not already done
        const { error: claimErr } = await db
          .from("build_steps")
          .update({
            status: "running",
            started_at: new Date().toISOString(),
          })
          .eq("id", currentStep.id)
          .neq("status", "done");

        if (claimErr) {
          return new Response(JSON.stringify({ error: "Could not claim step execution" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        await db.from("build_runs").update({ status: "running" }).eq("id", run.id);

        // Fetch project notes & files
        const [{ data: proj }, { data: files }] = await Promise.all([
          db.from("projects").select("id,name,agent_notes").eq("id", run.project_id).maybeSingle(),
          db
            .from("project_files")
            .select("path,content,is_upload,updated_at")
            .eq("project_id", run.project_id),
        ]);

        let currentProjName = proj?.name || "";
        const isGenericProjName =
          !currentProjName ||
          /^(untitled|untitled project|new project)$/i.test(currentProjName.trim()) ||
          currentProjName.toLowerCase().startsWith("build ") ||
          currentProjName.toLowerCase().startsWith("create ");

        if (isGenericProjName && run.prompt) {
          try {
            const derived = generateProjectNameFromIdea(run.prompt);
            if (derived && derived !== "New Project" && derived !== "Untitled project") {
              currentProjName = derived;
              await db.from("projects").update({ name: derived }).eq("id", run.project_id);
            }
          } catch (err) {
            console.warn("Could not derive project name in stream-step:", err);
          }
        }

        const filesMap = new Map<string, string>();
        for (const f of files ?? []) {
          filesMap.set(f.path, f.content);
        }

        const encoder = new TextEncoder();

        const readableStream = new ReadableStream({
          async start(controller) {
            const sendEvent = (obj: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
            };

            sendEvent({
              type: "step_start",
              idx,
              title: currentStep.title,
              description: currentStep.description,
            });

            if (currentProjName && currentProjName !== proj?.name) {
              sendEvent({
                type: "project_renamed",
                name: currentProjName,
              });
            }

            try {
              const { prompt: skillsPrompt } = getInjectedSkills(
                `${run.prompt} ${currentStep.title} ${currentStep.description}`,
                [],
              );

              let systemPrompt = DEFAULT_SYSTEM_PROMPT;
              if (skillsPrompt) {
                systemPrompt += `\n\n${skillsPrompt}`;
              }

              const filesTree =
                (files ?? [])
                  .map((f) => `- ${f.path}${f.is_upload ? " (upload)" : ""}: ${f.content.length}b`)
                  .join("\n") || "(none)";

              const FILE_BUDGET = 120_000;
              let fileBytes = 0;
              const includedFiles: string[] = [];
              for (const f of (files ?? []).filter(
                (f) =>
                  !f.is_upload || /\.(html|css|js|jsx|ts|tsx|php|json|md|txt|svg)$/i.test(f.path),
              )) {
                if (fileBytes >= FILE_BUDGET) break;
                const remaining = FILE_BUDGET - fileBytes;
                const body =
                  f.content.length > remaining
                    ? f.content.slice(0, remaining) + "\n/* ...truncated for token budget... */"
                    : f.content;
                includedFiles.push(`--- FILE: ${f.path}\n${body}`);
                fileBytes += body.length;
              }

              const fullFiles = includedFiles.join("\n\n");

              const projectNotesContext = proj?.agent_notes
                ? `Project Notes:\n${proj.agent_notes}\n\n`
                : "";

              const appNameInstruction =
                proj?.name &&
                !["untitled project", "devloadable", "loadable"].includes(
                  proj.name.toLowerCase().trim(),
                )
                  ? `APP NAME & BRAND IDENTITY: The application being built is named "${proj.name}". Every page title, logo, header text, and UI copy MUST be branded as "${proj.name}". Never call it DevLoadable.\n\n`
                  : "";

              const stepInstruction = `${appNameInstruction}You are executing step ${idx + 1} of ${(allSteps ?? []).length}: "${currentStep.title} - ${currentStep.description}".
Original User Request: "${run.prompt}"

Steps already completed:
${doneSteps.map((s) => `- ${s.title}: ${s.summary || "completed"}`).join("\n") || "None"}

Remaining steps:
${remainingSteps.map((s) => `- ${s.title}: ${s.description}`).join("\n") || "None (this is the final step)"}

STRICT MANDATORY CODING RULES:
0. MUST OUTPUT CODE TAGS: You MUST output at least one <dl-edit>, <dl-write>, or <dl-delete> tag for this step. NEVER merely describe or claim changes in prose text. Prose does NOT modify files.
1. TARGETED EDITS VS CONVERSIONS & REWRITES:
   - For localized changes or fixes to existing files (1 to ~40 lines), use <dl-edit path="filename"><dl-old>exact code</dl-old><dl-new>replacement code</dl-new></dl-edit>. Include 2-4 lines of unique context.
   - For FILE CONVERSIONS, major refactors, or new files: use <dl-write path="filename">complete code</dl-write>. This ensures full stack/framework conversions succeed cleanly.
2. DELETING FILES:
   - To delete an obsolete or removed file: output <dl-delete path="filename"></dl-delete>.
3. LANGUAGE & FRAMEWORK FIDELITY:
   - Code in the exact language/stack requested by the user prompt (TypeScript, React, Vue, Node.js, Python, PHP, SQL, HTML/CSS, etc.). Do not force pure HTML when other languages are requested.
4. IF REQUIREMENTS ARE AMBIGUOUS:
   - Use <dl-ask options="Option A | Option B | Option C">Question</dl-ask> to ask the user.
${
  isLastStep
    ? `This is the LAST step. You MUST include <dl-notes> and after all tags, write a 2-4 sentence plain summary of what was built.`
    : `Do only this step.`
}`;

              const baseMessages = [
                { role: "system" as const, content: systemPrompt },
                {
                  role: "system" as const,
                  content: `${projectNotesContext}Existing Files:\n${filesTree}\n\nCurrent contents:\n${fullFiles || "(none)"}`,
                },
                { role: "user" as const, content: stepInstruction },
              ];

              let eventQueue = Promise.resolve();

              const checkAndApplyCodeName = async (filePath: string, fileContent: string) => {
                if (!filePath.endsWith(".html") && !filePath.endsWith("package.json")) return;
                try {
                  const extracted = extractAppNameFromCode(fileContent, filePath);
                  if (extracted) {
                    const isGeneric =
                      !currentProjName ||
                      /^(untitled|untitled project|new project)$/i.test(currentProjName.trim()) ||
                      currentProjName.toLowerCase().startsWith("build ") ||
                      currentProjName.toLowerCase().startsWith("create ");

                    if (isGeneric || currentProjName !== extracted) {
                      currentProjName = extracted;
                      await db
                        .from("projects")
                        .update({ name: extracted })
                        .eq("id", run.project_id);
                      sendEvent({
                        type: "project_renamed",
                        name: extracted,
                      });
                    }
                  }
                } catch (err) {
                  console.warn("Could not extract app name from code:", err);
                }
              };

              const handleEvent = async (event: AgentEvent) => {
                if (event.type === "status") {
                  sendEvent({ type: "status", status: event.status });
                  await db.from("work_logs").insert({
                    project_id: run.project_id,
                    user_id: userId,
                    kind: "status",
                    label: event.status,
                    run_id: run.id,
                    step_idx: idx,
                  });
                } else if (event.type === "write") {
                  const targetPath = normalizeFilePath(event.path);
                  const validation = validateFilePath(targetPath, event.content);
                  if (!validation.valid) {
                    console.warn(
                      "[stream-step] Blocked unsafe file write for " + targetPath + ":",
                      validation.error,
                    );
                    await db.from("work_logs").insert({
                      project_id: run.project_id,
                      user_id: userId,
                      kind: "error",
                      label: "Blocked unsafe file " + targetPath,
                      detail: validation.error || "File path validation failed",
                      run_id: run.id,
                      step_idx: idx,
                    });
                    return;
                  }
                  filesMap.set(targetPath, event.content);

                  sendEvent({
                    type: "file_saved",
                    path: targetPath,
                    content: event.content,
                  });

                  const { error: saveErr } = await db.from("project_files").upsert(
                    {
                      project_id: run.project_id,
                      user_id: userId,
                      path: targetPath,
                      content: event.content,
                      is_upload: false,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "project_id,path" },
                  );
                  if (saveErr) {
                    console.error(
                      `[stream-step] Failed to upsert project_file ${targetPath}:`,
                      saveErr.message,
                    );
                    await db.from("work_logs").insert({
                      project_id: run.project_id,
                      user_id: userId,
                      kind: "error",
                      label: `Failed to save ${targetPath}`,
                      detail: saveErr.message,
                      run_id: run.id,
                      step_idx: idx,
                    });
                    return;
                  }

                  await db.from("work_logs").insert({
                    project_id: run.project_id,
                    user_id: userId,
                    kind: "created",
                    label: `Created ${targetPath}`,
                    run_id: run.id,
                    step_idx: idx,
                  });

                  await checkAndApplyCodeName(targetPath, event.content);
                } else if (event.type === "edit") {
                  const targetPath = normalizeFilePath(event.path);
                  const validation = validateFilePath(targetPath);
                  if (!validation.valid) {
                    console.warn(
                      "[stream-step] Blocked unsafe file edit for " + targetPath + ":",
                      validation.error,
                    );
                    await db.from("work_logs").insert({
                      project_id: run.project_id,
                      user_id: userId,
                      kind: "error",
                      label: "Blocked unsafe edit for " + targetPath,
                      detail: validation.error || "File path validation failed",
                      run_id: run.id,
                      step_idx: idx,
                    });
                    return;
                  }
                  let currentContent = filesMap.get(targetPath);
                  if (currentContent === undefined) {
                    for (const [k, v] of filesMap.entries()) {
                      if (normalizeFilePath(k).toLowerCase() === targetPath.toLowerCase()) {
                        currentContent = v;
                        break;
                      }
                    }
                  }
                  if (currentContent === undefined) {
                    currentContent = "";
                  }

                  const editRes = applyFileEdit(currentContent, event.oldText, event.newText);
                  if (editRes.success && editRes.result !== undefined) {
                    filesMap.set(targetPath, editRes.result);

                    sendEvent({
                      type: "file_saved",
                      path: targetPath,
                      content: editRes.result,
                    });

                    const { error: editErr } = await db.from("project_files").upsert(
                      {
                        project_id: run.project_id,
                        user_id: userId,
                        path: targetPath,
                        content: editRes.result,
                        is_upload: false,
                        updated_at: new Date().toISOString(),
                      },
                      { onConflict: "project_id,path" },
                    );
                    if (editErr) {
                      console.error(
                        `[stream-step] Failed to upsert edited project_file ${targetPath}:`,
                        editErr.message,
                      );
                      await db.from("work_logs").insert({
                        project_id: run.project_id,
                        user_id: userId,
                        kind: "error",
                        label: `Failed to save ${targetPath}`,
                        detail: editErr.message,
                        run_id: run.id,
                        step_idx: idx,
                      });
                      return;
                    }

                    await db.from("work_logs").insert({
                      project_id: run.project_id,
                      user_id: userId,
                      kind: "edited",
                      label: `Edited ${targetPath}`,
                      run_id: run.id,
                      step_idx: idx,
                    });

                    await checkAndApplyCodeName(targetPath, editRes.result);
                  } else {
                    await db.from("work_logs").insert({
                      project_id: run.project_id,
                      user_id: userId,
                      kind: "error",
                      label: `Edit failed for ${targetPath}`,
                      detail: editRes.error || "Search block did not match",
                      run_id: run.id,
                      step_idx: idx,
                    });
                  }
                } else if (event.type === "ask") {
                  await db.from("messages").insert({
                    project_id: run.project_id,
                    user_id: userId,
                    role: "assistant",
                    content: event.question,
                    kind: "question",
                    meta: { options: event.options, runId: run.id },
                  });
                  await db.from("build_runs").update({ status: "waiting" }).eq("id", run.id);
                  sendEvent({
                    type: "waiting",
                    question: event.question,
                    options: event.options,
                  });
                } else if (event.type === "delete") {
                  const targetPath = normalizeFilePath(event.path);
                  filesMap.delete(targetPath);
                  sendEvent({
                    type: "file_deleted",
                    path: targetPath,
                  });
                  await db
                    .from("project_files")
                    .delete()
                    .eq("project_id", run.project_id)
                    .eq("path", targetPath);
                  await db.from("work_logs").insert({
                    project_id: run.project_id,
                    user_id: userId,
                    kind: "deleted",
                    label: `Deleted ${targetPath}`,
                    run_id: run.id,
                    step_idx: idx,
                  });
                } else if (event.type === "notes") {
                  await db
                    .from("projects")
                    .update({ agent_notes: event.notes })
                    .eq("id", run.project_id);
                }
              };

              const parser = new AgentStreamingParser({
                onEvent: (event) => {
                  eventQueue = eventQueue.then(() => handleEvent(event));
                },
              });

              const abortController = new AbortController();
              if (request.signal) {
                if (request.signal.aborted) {
                  abortController.abort();
                } else {
                  request.signal.addEventListener("abort", () => {
                    abortController.abort();
                  });
                }
              }
              const stream = streamModel({
                provider: DEFAULT_PROVIDER,
                messages: baseMessages,
                signal: abortController.signal,
              });

              for await (const delta of stream) {
                sendEvent({ type: "delta", delta });
                parser.feed(delta);
              }

              await eventQueue;
              const finishResult = parser.finish();
              await eventQueue;

              const summary = finishResult.summary || `Completed: ${currentStep.title}`;

              await db
                .from("build_steps")
                .update({
                  status: "done",
                  summary,
                  finished_at: new Date().toISOString(),
                })
                .eq("id", currentStep.id);

              if (isLastStep) {
                await db
                  .from("build_runs")
                  .update({
                    status: "done",
                    finished_at: new Date().toISOString(),
                  })
                  .eq("id", run.id);

                await db.from("messages").insert({
                  project_id: run.project_id,
                  user_id: userId,
                  role: "assistant",
                  content: summary,
                  kind: "summary",
                  meta: { runId: run.id },
                });
              }

              sendEvent({
                type: "done",
                isLastStep,
                summary,
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              sendEvent({ type: "error", error: errMsg });
              await db
                .from("build_steps")
                .update({
                  status: "error",
                  summary: errMsg,
                  finished_at: new Date().toISOString(),
                })
                .eq("id", currentStep.id);
            } finally {
              controller.close();
            }
          },
        });

        return new Response(readableStream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
