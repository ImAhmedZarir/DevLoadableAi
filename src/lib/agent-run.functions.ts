import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentEvent } from "./agent-parser.server";
import type { ModelProvider } from "./agent-provider.server";
import type { Database } from "@/integrations/supabase/types";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const startRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        prompt: z.string().min(1),
        displayPrompt: z.string().optional(),
        attachedFiles: z.array(z.string()).optional(),
        mode: z.enum(["chat", "plan", "build"]).default("build"),
        provider: z.string().optional(),
        kind: z.enum(["user", "autofix"]).default("user"),
        parentRunId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { streamModel, MODELS, DEFAULT_PROVIDER, DEFAULT_SYSTEM_PROMPT } =
      await import("./agent-provider.server");
    const { getInjectedSkills } = await import("./skills.server");
    const { AgentStreamingParser } = await import("./agent-parser.server");

    const cleanPrompt = (data.prompt || "").replace(/\0/g, "");
    const cleanDisplayPrompt = data.displayPrompt
      ? data.displayPrompt.replace(/\0/g, "")
      : cleanPrompt;

    // 1. Settings & quota check
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
      cleanPrompt,
      disabledSkills,
    );

    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    const adminMasterPrompt = (settingsMap.get("master_prompt") ?? "").trim();
    if (adminMasterPrompt) {
      systemPrompt += `\n\nAdditional instructions:\n${adminMasterPrompt}`;
    }
    if (skillsPrompt) {
      systemPrompt += `\n\n${skillsPrompt}`;
    }

    const providerId = DEFAULT_PROVIDER;
    const model = MODELS[DEFAULT_PROVIDER].model;
    const unlimitedRequests = (settingsMap.get("agent_unlimited_requests") ?? "true") === "true";

    // Autofix verification
    if (data.kind === "autofix") {
      if (!data.parentRunId) {
        throw new Error("Autofix run requires parentRunId.");
      }
      const { data: parentRun } = await supabase
        .from("build_runs")
        .select("id,user_id,status")
        .eq("id", data.parentRunId)
        .maybeSingle();

      if (!parentRun || parentRun.user_id !== userId || parentRun.status !== "done") {
        throw new Error("Invalid parent run for autofix: must be completed run owned by user.");
      }

      try {
        const { data: existingAutofix, error: autofixErr } = await supabase
          .from("build_runs")
          .select("id")
          .eq("parent_run_id", data.parentRunId)
          .eq("kind", "autofix")
          .maybeSingle();

        if (!autofixErr && existingAutofix) {
          throw new Error("An autofix run has already been executed for this build run.");
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("already been executed")) {
          throw err;
        }
        console.warn("Could not check existing autofix run, continuing:", err);
      }
    }

    // Atomic quota check & consume (autofix runs do NOT consume daily quota)
    if (data.kind !== "autofix") {
      const { data: allowed, error: quotaErr } = await supabase.rpc("consume_daily_message");
      if (quotaErr) {
        console.warn("consume_daily_message error, continuing:", quotaErr);
      } else if (allowed === false) {
        throw new Error(
          "Daily limit reached. Ask an admin to raise the limit or try again tomorrow.",
        );
      }
    }

    // 2. Check project ownership
    const { data: proj } = await supabase
      .from("projects")
      .select("id,name,agent_notes")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    const isGenericName =
      !proj.name ||
      /^(untitled|untitled project|new project)$/i.test(proj.name.trim()) ||
      proj.name.toLowerCase().startsWith("build ") ||
      proj.name.toLowerCase().startsWith("create ");

    if (isGenericName && cleanPrompt) {
      try {
        const { generateProjectNameFromIdea } = await import("./project-naming");
        const derived = generateProjectNameFromIdea(cleanPrompt);
        if (derived && derived !== "New Project" && derived !== "Untitled project") {
          await supabase.from("projects").update({ name: derived }).eq("id", data.projectId);
          proj.name = derived;
        }
      } catch (err) {
        console.warn("Could not auto-name project from prompt:", err);
      }
    }

    // Load recent history + current files summary
    const [{ data: history }, { data: files }] = await Promise.all([
      supabase
        .from("messages")
        .select("role,content,kind")
        .eq("project_id", data.projectId)
        .neq("kind", "plan")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("project_files")
        .select("path,content,is_upload")
        .eq("project_id", data.projectId),
    ]);

    const recentHistory = (history ?? [])
      .slice()
      .reverse()
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.kind !== "plan")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content.slice(0, 6000),
      }));

    const projectNotesContext = proj.agent_notes ? `Project Notes:\n${proj.agent_notes}\n\n` : "";

    // 3. Handle CHAT mode (no run created, answered directly)
    if (data.mode === "chat") {
      await supabase.from("messages").insert({
        project_id: data.projectId,
        user_id: userId,
        role: "user",
        content: cleanDisplayPrompt,
        kind: "text",
        meta: {
          attachedFiles: data.attachedFiles,
        },
      });

      const filesSummary =
        (files ?? []).map((f) => `- ${f.path}: ${f.content.length}b`).join("\n") || "(none)";

      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content: `${projectNotesContext}Files:\n${filesSummary}\n\nCHAT MODE: Do not use dl-write, dl-edit or dl-delete. Answer in plain text. Answer the user's question helpfully.`,
        },
        ...recentHistory,
        { role: "user", content: cleanPrompt },
      ];

      let replyText = "";
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 90_000);
      try {
        const stream = streamModel({
          provider: providerId,
          model,
          messages: chatMessages,
          signal: abortController.signal,
        });
        for await (const delta of stream) {
          replyText += delta;
        }
      } finally {
        clearTimeout(timeoutId);
      }

      await supabase.from("messages").insert({
        project_id: data.projectId,
        user_id: userId,
        role: "assistant",
        content: replyText.trim() || "I've reviewed your request.",
        kind: "text",
      });

      return { mode: "chat" as const, message: replyText.trim(), steps: [] };
    }

    // 4. PLAN or BUILD mode
    // Snapshot state before run (modes plan and build only, not autofix)
    if (data.mode !== "chat" && data.kind !== "autofix") {
      const { snapshotVersion } = await import("./version.functions");
      await snapshotVersion(
        supabase,
        data.projectId,
        userId,
        `Before: ${cleanDisplayPrompt.slice(0, 60)}`,
      );
    }

    // Insert user message
    await supabase.from("messages").insert({
      project_id: data.projectId,
      user_id: userId,
      role: "user",
      content: cleanDisplayPrompt,
      kind: data.kind || "text",
      meta: {
        kind: data.kind,
        attachedFiles: data.attachedFiles,
      },
    });

    // Create build_runs row (status 'planning')
    let run = null;
    const initialRunPayload: Record<string, unknown> = {
      project_id: data.projectId,
      user_id: userId,
      prompt: cleanPrompt,
      mode: data.mode,
      kind: data.kind,
      parent_run_id: data.parentRunId || null,
      status: "planning",
    };

    let { data: insertedRun, error: runErr } = await supabase
      .from("build_runs")
      .insert(initialRunPayload as unknown as Database["public"]["Tables"]["build_runs"]["Insert"])
      .select()
      .single();

    if (
      runErr &&
      (runErr.message?.includes("kind") ||
        runErr.message?.includes("parent_run_id") ||
        runErr.message?.includes("schema cache"))
    ) {
      console.warn(
        "Retrying build_runs insert without kind/parent_run_id due to schema cache mismatch:",
        runErr.message,
      );
      const fallbackPayload: Record<string, unknown> = {
        project_id: data.projectId,
        user_id: userId,
        prompt: data.prompt,
        mode: data.mode,
        status: "planning",
      };
      const retryResult = await supabase
        .from("build_runs")
        .insert(fallbackPayload as unknown as Database["public"]["Tables"]["build_runs"]["Insert"])
        .select()
        .single();
      insertedRun = retryResult.data;
      runErr = retryResult.error;
    }

    if (runErr || !insertedRun) {
      throw new Error("Failed to create build run: " + (runErr?.message || "Unknown error"));
    }
    run = insertedRun;

    await supabase.from("work_logs").insert({
      project_id: data.projectId,
      user_id: userId,
      kind: "info",
      label: "Planning build",
      detail: `Mode: ${data.mode} | Model: ${model}${data.kind === "autofix" ? " | Auto-fix" : ""}`,
      run_id: run.id,
    });

    // Full codebase context for planner (up to 400KB budget)
    const PLAN_FILE_BUDGET = 400_000;
    let totalPlanFileBytes = 0;
    const includedPlanFiles: string[] = [];
    const treeLines: string[] = [];

    for (const f of files ?? []) {
      const isCode =
        !f.is_upload ||
        /\.(html|htm|css|js|jsx|ts|tsx|json|svg|sql|php|py|md|txt|yaml|yml|xml|csv)$/i.test(f.path);
      if (isCode && totalPlanFileBytes + f.content.length <= PLAN_FILE_BUDGET) {
        includedPlanFiles.push(`--- FILE: ${f.path}\n${f.content}`);
        totalPlanFileBytes += f.content.length;
      }
      treeLines.push(`- ${f.path}${f.is_upload ? " (upload)" : ""}: ${f.content.length}b`);
    }

    const filesTree = treeLines.join("\n") || "(none)";
    const filesContext = `Files Tree:\n${filesTree}\n\nCurrent contents:\n${includedPlanFiles.join("\n\n") || "(no existing files)"}`;

    const autofixPlanRule =
      data.kind === "autofix"
        ? "\n- AUTO-FIX: This run MUST contain exactly 1 step titled 'Fix runtime errors'."
        : "";

    const appNamePlanInstruction =
      proj?.name &&
      !["untitled project", "devloadable", "loadable"].includes(proj.name.toLowerCase().trim())
        ? `APP NAME & BRAND IDENTITY: The application being planned is named "${proj.name}". Plan all steps and features branded as "${proj.name}". Never name it DevLoadable.\n\n`
        : "";

    const planSystemMsg = `${appNamePlanInstruction}PLANNING INSTRUCTIONS:
You are in the PLANNING phase for user request: "${data.prompt}".

CRITICAL PLANNING PRINCIPLES:
1. ASK QUESTIONS INSTEAD OF GUESSING (DO NOT INVENT IDEAS):
   - If the request is underspecified, ambiguous, open-ended, or lacks clear specifications (e.g. choice of language, database, visual style, or specific features), DO NOT GUESS OR INVENT ARBITRARY IDEAS!
   - Reply ONLY with: <dl-ask options="Option A | Option B | Option C">Your specific clarifying question</dl-ask> instead of a plan. The user will select an option.

2. LANGUAGE & ARCHITECTURE FIDELITY (DO NOT DEFAULT TO HTML):
   - Detect the exact language and stack requested in the user prompt (TypeScript, React, Vue, Node.js, Python, PHP, SQL, Go, Rust, or modern web standards).
   - Plan steps tailored to that architecture. Do NOT force HTML scaffold steps if building a backend, script, React app, or database!

3. TARGETED EDITING FOR EXISTING CODEBASES:
   - When modifying an existing project, steps must target specific edits to existing files using dl-edit, not rewriting them from scratch.

Reply ONLY with:
1. A concise one-sentence intro acknowledging what will be built or changed.
2. Followed by:
<dl-plan>
<dl-step>Title | specific actionable description</dl-step>
...
</dl-plan>

Rules for steps:${autofixPlanRule}
- For a new project or major feature: 2 to 6 steps.
- For a small change (feature addition, edit, bug fix): exactly 1 step.
- Do NOT output dl-write, dl-edit, dl-delete. Do NOT write code fences.`;

    const planMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "system", content: `${projectNotesContext}${filesContext}\n\n${planSystemMsg}` },
      ...recentHistory,
      { role: "user", content: data.prompt },
    ];

    // Call model to generate plan
    let planQueue = Promise.resolve();
    const handlePlanEvent = async (event: import("./agent-parser.server").AgentEvent) => {
      if (event.type === "status") {
        await supabase.from("work_logs").insert({
          project_id: data.projectId,
          user_id: userId,
          kind: "status",
          label: event.status,
          run_id: run.id,
        });
      }
    };

    const planParser = new AgentStreamingParser({
      onEvent: (event) => {
        planQueue = planQueue
          .then(() => handlePlanEvent(event))
          .catch(async (err) => {
            console.error("Plan event error:", err);
            try {
              await supabase.from("work_logs").insert({
                project_id: data.projectId,
                user_id: userId,
                kind: "error",
                label: "Planning event error",
                detail: err instanceof Error ? err.message : String(err),
                run_id: run.id,
              });
            } catch {
              // ignore db insert failure
            }
          });
      },
    });
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 90_000);
    let planRaw = "";

    try {
      const stream = streamModel({
        provider: providerId,
        model,
        messages: planMessages,
        signal: abortController.signal,
      });
      for await (const delta of stream) {
        planRaw += delta;
        planParser.feed(delta);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Await plan queue before finish() results are used
    await planQueue;
    const planResult = planParser.finish();

    // Check if dl-ask was produced
    const askEvent = planResult.events.find((e) => e.type === "ask");
    if (askEvent && askEvent.type === "ask") {
      await supabase.from("messages").insert({
        project_id: data.projectId,
        user_id: userId,
        role: "assistant",
        content: askEvent.question,
        kind: "question",
        meta: { options: askEvent.options, runId: run.id },
      });
      await supabase.from("build_runs").update({ status: "waiting" }).eq("id", run.id);

      return {
        runId: run.id,
        steps: [],
        waiting: true,
        question: askEvent.question,
        options: askEvent.options,
        mode: data.mode,
      };
    }

    // Extract steps
    let extractedSteps: Array<{ title: string; description: string }> = [];
    const planEvent = planResult.events.find((e) => e.type === "plan");
    if (planEvent && planEvent.type === "plan" && planEvent.steps.length > 0) {
      extractedSteps = planEvent.steps;
    } else {
      const stepEvents = planResult.events.filter((e) => e.type === "step");
      if (stepEvents.length > 0) {
        extractedSteps = stepEvents.map((e) => {
          if (e.type === "step") return { title: e.title, description: e.description };
          return { title: "Step", description: "Implementation" };
        });
      }
    }

    // Fallback if model didn't use tags
    if (extractedSteps.length === 0) {
      const lines = planRaw.split("\n").filter((l) => /^\s*(\d+[.)]|-|\*)\s+/.test(l));
      if (lines.length > 0) {
        extractedSteps = lines.slice(0, 8).map((l, i) => {
          const clean = l.replace(/^\s*(\d+[.)]|-|\*)\s+/, "").trim();
          const parts = clean.split(/[-–—:|]/);
          return {
            title: parts[0]?.trim() || `Step ${i + 1}`,
            description: parts.slice(1).join(" ").trim() || clean,
          };
        });
      }
    }

    if (extractedSteps.length === 0) {
      extractedSteps = [
        {
          title: "Build Project",
          description: "Implement the requested changes according to specifications",
        },
      ];
    }

    // Save steps to build_steps table
    const stepRows = extractedSteps.map((s, idx) => ({
      run_id: run.id,
      project_id: data.projectId,
      user_id: userId,
      idx,
      title: s.title,
      description: s.description,
      status: "pending",
    }));

    const { data: insertedSteps, error: stepInsertErr } = await supabase
      .from("build_steps")
      .insert(stepRows)
      .select();

    if (stepInsertErr) {
      console.error("Failed to insert steps:", stepInsertErr);
    }

    // Intro text
    let introText = planResult.plan.trim();
    if (!introText) {
      introText = "Here is the build plan for your request:";
    }

    // Insert assistant message with kind='plan'
    await supabase.from("messages").insert({
      project_id: data.projectId,
      user_id: userId,
      role: "assistant",
      content: introText,
      kind: "plan",
      meta: { runId: run.id },
    });

    const nextStatus = data.mode === "plan" ? "planned" : "running";
    await supabase.from("build_runs").update({ status: nextStatus }).eq("id", run.id);

    return {
      runId: run.id,
      steps: insertedSteps ?? stepRows,
      mode: data.mode,
      intro: introText,
    };
  });

export const runStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
        idx: z.number().int().min(0),
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

    // 1. Fetch build_runs and verify ownership
    const { data: run } = await supabase
      .from("build_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!run) throw new Error("Build run not found");

    if (run.status === "cancelled") {
      await supabase
        .from("build_steps")
        .update({ status: "skipped" })
        .eq("run_id", data.runId)
        .eq("idx", data.idx);
      return { cancelled: true };
    }

    // 2. Fetch all steps for this run
    const { data: allSteps } = await supabase
      .from("build_steps")
      .select("*")
      .eq("run_id", data.runId)
      .order("idx");

    const currentStep = (allSteps ?? []).find((s) => s.idx === data.idx);
    if (!currentStep) throw new Error(`Step index ${data.idx} not found`);

    const doneSteps = (allSteps ?? []).filter((s) => s.status === "done");
    const remainingSteps = (allSteps ?? []).filter((s) => s.idx > data.idx);
    const isLastStep = data.idx === (allSteps ?? []).length - 1;

    // Mark step running
    await supabase
      .from("build_steps")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", currentStep.id);

    await supabase.from("build_runs").update({ status: "running" }).eq("id", run.id);

    await supabase.from("work_logs").insert({
      project_id: run.project_id,
      user_id: userId,
      kind: "status",
      label: `Starting step ${data.idx + 1}: ${currentStep.title}`,
      detail: currentStep.description,
      run_id: run.id,
      step_idx: data.idx,
    });

    // 3. Settings & provider
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key,value")
      .in("key", ["master_prompt", "agent_provider", "disabled_skills"]);
    const settingsMap = new Map<string, string>(
      (settings ?? []).map((s: { key: string; value: string }) => [s.key, s.value]),
    );

    let disabledSkills: string[] = [];
    try {
      disabledSkills = JSON.parse(settingsMap.get("disabled_skills") || "[]");
    } catch {
      disabledSkills = [];
    }

    const { prompt: skillsPrompt } = getInjectedSkills(
      `${run.prompt} ${currentStep.title} ${currentStep.description}`,
      disabledSkills,
    );

    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    const adminMasterPrompt = (settingsMap.get("master_prompt") ?? "").trim();
    if (adminMasterPrompt) {
      systemPrompt += `\n\nAdditional instructions:\n${adminMasterPrompt}`;
    }
    if (skillsPrompt) {
      systemPrompt += `\n\n${skillsPrompt}`;
    }

    const providerId = DEFAULT_PROVIDER;
    const model = MODELS[DEFAULT_PROVIDER].model;

    // 4. Load project & files
    const [{ data: proj }, { data: files }, { data: history }] = await Promise.all([
      supabase.from("projects").select("id,name,agent_notes").eq("id", run.project_id).maybeSingle(),
      supabase
        .from("project_files")
        .select("path,content,is_upload,updated_at")
        .eq("project_id", run.project_id),
      supabase
        .from("messages")
        .select("role,content,kind")
        .eq("project_id", run.project_id)
        .neq("kind", "plan")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const recentHistory = (history ?? [])
      .slice()
      .reverse()
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.kind !== "plan")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 6000) }));

    const FILE_BUDGET = 400_000;
    let fileChars = 0;
    const includedFiles: string[] = [];
    const treeLines: string[] = [];

    // Sort full files by updated_at desc so recently edited ones come first
    const sortedFiles = [...(files ?? [])].sort((a, b) => {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTime - aTime;
    });

    for (const f of sortedFiles) {
      const isAllowedCode =
        !f.is_upload ||
        /\.(html|htm|css|js|jsx|ts|tsx|json|svg|sql|php|py|md|txt|yaml|yml|xml|csv)$/i.test(f.path);
      const fits = isAllowedCode && fileChars + f.content.length <= FILE_BUDGET;
      if (fits) {
        includedFiles.push(`--- FILE: ${f.path}\n${f.content}`);
        fileChars += f.content.length;
        treeLines.push(`- ${f.path}${f.is_upload ? " (upload)" : ""}: ${f.content.length}b`);
      } else {
        treeLines.push(
          `- ${f.path}${f.is_upload ? " (upload)" : ""}: ${f.content.length}b (not shown, use dl-read)`,
        );
      }
    }

    const filesSummary = treeLines.join("\n") || "(none)";
    const fullFiles = includedFiles.join("\n\n");
    const projectNotesContext = proj?.agent_notes ? `Project Notes:\n${proj.agent_notes}\n\n` : "";

    const appNameInstruction =
      proj?.name &&
      !["untitled project", "devloadable", "loadable"].includes(proj.name.toLowerCase().trim())
        ? `APP NAME & BRAND IDENTITY: The application being built is named "${proj.name}". Every page title, logo, header text, and UI copy MUST be branded as "${proj.name}". Never call it DevLoadable.\n\n`
        : "";

    const stepInstruction = `${appNameInstruction}You are executing step ${data.idx + 1} of ${(allSteps ?? []).length}: "${currentStep.title} - ${currentStep.description}".
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
   - Code in the exact language/framework required by the user prompt (TypeScript, React, Vue, Node.js, Python, PHP, SQL, HTML/CSS, etc.). Never force pure HTML if another language was requested.
4. IF REQUIREMENTS ARE AMBIGUOUS:
   - Output <dl-ask options="Option A | Option B | Option C">Clarifying question</dl-ask> to ask the user.

IMPORTANT: Do only this step.
${
  isLastStep
    ? `This is the LAST step. You MUST include <dl-notes> and after all tags, write a 2-4 sentence plain summary of what was built and what to try next.`
    : `Do NOT write the final summary unless this is the last step.`
}`;

    const baseMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `${projectNotesContext}Files:\n${filesSummary}\n\nCurrent contents:\n${fullFiles || "(none)"}`,
      },
      ...recentHistory,
      { role: "user", content: stepInstruction },
    ];

    // Execution with up to 1 retry if an error occurs
    let attempt = 0;
    const MAX_ATTEMPTS = 2;
    let stepError: Error | null = null;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        const result = await executeStepRounds({
          supabase,
          userId,
          projectId: run.project_id,
          runId: run.id,
          stepIdx: data.idx,
          providerId,
          model,
          baseMessages,
          isLastStep,
        });

        if (result.cancelled) {
          await supabase
            .from("build_steps")
            .update({ status: "skipped", finished_at: new Date().toISOString() })
            .eq("id", currentStep.id);
          return { cancelled: true };
        }

        if (result.waiting) {
          return { waiting: true, question: result.question, options: result.options };
        }

        // Step completed successfully
        const summary = result.summary || `Step ${data.idx + 1} completed: ${currentStep.title}`;
        await supabase
          .from("build_steps")
          .update({
            status: "done",
            summary,
            finished_at: new Date().toISOString(),
          })
          .eq("id", currentStep.id);

        if (isLastStep) {
          // Final assistant message
          const finalMessage =
            result.summary ||
            `Done! I have completed all ${allSteps?.length ?? 1} steps of the build plan. Check out the preview!`;
          await supabase.from("messages").insert({
            project_id: run.project_id,
            user_id: userId,
            role: "assistant",
            content: finalMessage,
            kind: "summary",
            meta: { runId: run.id },
          });

          await supabase
            .from("build_runs")
            .update({
              status: "done",
              finished_at: new Date().toISOString(),
            })
            .eq("id", run.id);

          const { snapshotVersion } = await import("./version.functions");
          await snapshotVersion(
            supabase,
            run.project_id,
            userId,
            `After: ${run.prompt.slice(0, 60)}`,
            run.id,
          );
        }

        return { done: true, isLastStep, summary };
      } catch (err) {
        stepError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Step ${data.idx} attempt ${attempt} failed:`, stepError.message);
        if (attempt < MAX_ATTEMPTS) {
          // Wait 1.5s before retry
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    // Step failed after retry
    const errorMsg = stepError?.message || "Step execution failed";
    await supabase
      .from("build_steps")
      .update({
        status: "error",
        summary: errorMsg,
        finished_at: new Date().toISOString(),
      })
      .eq("id", currentStep.id);

    await supabase
      .from("build_runs")
      .update({
        status: "error",
        error: errorMsg,
      })
      .eq("id", run.id);

    await supabase.from("work_logs").insert({
      project_id: run.project_id,
      user_id: userId,
      kind: "error",
      label: `Step ${data.idx + 1} failed`,
      detail: errorMsg,
      run_id: run.id,
      step_idx: data.idx,
    });

    return { error: true, message: errorMsg };
  });

async function executeStepRounds({
  supabase,
  userId,
  projectId,
  runId,
  stepIdx,
  providerId,
  model,
  baseMessages,
  isLastStep,
}: {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  runId: string;
  stepIdx: number;
  providerId: ModelProvider;
  model: string;
  baseMessages: ChatMessage[];
  isLastStep: boolean;
}): Promise<{
  cancelled?: boolean;
  waiting?: boolean;
  question?: string;
  options?: string[];
  summary?: string;
}> {
  const { streamModel } = await import("./agent-provider.server");
  const { AgentStreamingParser, validateFilePath, applyFileEdit } =
    await import("./agent-parser.server");

  // Keep live files map
  const { data: currentFiles } = await supabase
    .from("project_files")
    .select("path,content")
    .eq("project_id", projectId);

  const filesMap = new Map<string, string>();
  for (const f of currentFiles ?? []) {
    filesMap.set(f.path, f.content);
  }

  const conversationMessages: ChatMessage[] = [...baseMessages];
  const MAX_ROUNDS = 3;
  const STEP_BUDGET_MS = 60_000;
  const startTime = Date.now();
  let finalSummary = "";

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (Date.now() - startTime > STEP_BUDGET_MS) {
      break;
    }

    // Check cancellation before round
    const { data: runCheck } = await supabase
      .from("build_runs")
      .select("status")
      .eq("id", runId)
      .maybeSingle();
    if (runCheck?.status === "cancelled") {
      return { cancelled: true };
    }

    const readPaths: string[] = [];
    const editErrors: string[] = [];
    let roundRaw = "";
    let askedQuestion: { question: string; options: string[] } | null = null;

    let eventQueue = Promise.resolve();

    const handleStepEvent = async (event: AgentEvent) => {
      if (event.type === "status") {
        await supabase.from("work_logs").insert({
          project_id: projectId,
          user_id: userId,
          kind: "status",
          label: event.status,
          run_id: runId,
          step_idx: stepIdx,
        });
      } else if (event.type === "write") {
        const val = validateFilePath(event.path, event.content);
        if (!val.valid) {
          await supabase.from("work_logs").insert({
            project_id: projectId,
            user_id: userId,
            kind: "error",
            label: `Rejected ${event.path}`,
            detail: val.error,
            run_id: runId,
            step_idx: stepIdx,
          });
          return;
        }
        const isEdit = filesMap.has(event.path);
        const { error: saveErr } = await supabase.from("project_files").upsert(
          {
            project_id: projectId,
            user_id: userId,
            path: event.path,
            content: event.content,
            is_upload: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,path" },
        );
        if (saveErr) {
          await supabase.from("work_logs").insert({
            project_id: projectId,
            user_id: userId,
            kind: "error",
            label: `Failed to save ${event.path}`,
            detail: saveErr.message,
            run_id: runId,
            step_idx: stepIdx,
          });
          return;
        }
        filesMap.set(event.path, event.content);
        await supabase.from("work_logs").insert({
          project_id: projectId,
          user_id: userId,
          kind: isEdit ? "edited" : "created",
          label: `${isEdit ? "Edited" : "Created"} ${event.path}`,
          run_id: runId,
          step_idx: stepIdx,
        });
      } else if (event.type === "edit") {
        const val = validateFilePath(event.path);
        if (!val.valid) {
          editErrors.push(`Edit error on ${event.path}: ${val.error}`);
          return;
        }
        let currentContent = filesMap.get(event.path);
        if (currentContent === undefined) {
          currentContent = "";
        }
        const editRes = applyFileEdit(currentContent, event.oldText, event.newText);
        if (!editRes.success || editRes.result === undefined) {
          editErrors.push(`Edit error on ${event.path}: ${editRes.error}`);
          return;
        }
        const { error: editSaveErr } = await supabase.from("project_files").upsert(
          {
            project_id: projectId,
            user_id: userId,
            path: event.path,
            content: editRes.result,
            is_upload: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,path" },
        );
        if (editSaveErr) {
          await supabase.from("work_logs").insert({
            project_id: projectId,
            user_id: userId,
            kind: "error",
            label: `Failed to save ${event.path}`,
            detail: editSaveErr.message,
            run_id: runId,
            step_idx: stepIdx,
          });
          return;
        }
        filesMap.set(event.path, editRes.result);
        await supabase.from("work_logs").insert({
          project_id: projectId,
          user_id: userId,
          kind: "edited",
          label: `Edited ${event.path}`,
          run_id: runId,
          step_idx: stepIdx,
        });
      } else if (event.type === "delete") {
        filesMap.delete(event.path);
        await supabase
          .from("project_files")
          .delete()
          .eq("project_id", projectId)
          .eq("path", event.path);
        await supabase.from("work_logs").insert({
          project_id: projectId,
          user_id: userId,
          kind: "deleted",
          label: `Deleted ${event.path}`,
          run_id: runId,
          step_idx: stepIdx,
        });
      } else if (event.type === "read") {
        readPaths.push(event.path);
      } else if (event.type === "ask") {
        askedQuestion = { question: event.question, options: event.options };
      } else if (event.type === "notes") {
        await supabase.from("projects").update({ agent_notes: event.notes }).eq("id", projectId);
      }
    };

    const parser = new AgentStreamingParser({
      onEvent: (event) => {
        eventQueue = eventQueue
          .then(() => handleStepEvent(event))
          .catch(async (err) => {
            console.error("Step event handling error:", err);
            try {
              await supabase.from("work_logs").insert({
                project_id: projectId,
                user_id: userId,
                kind: "error",
                label: `Event handling error`,
                detail: err instanceof Error ? err.message : String(err),
                run_id: runId,
                step_idx: stepIdx,
              });
            } catch {
              // ignore db insert failure
            }
          });
      },
    });

    const abortController = new AbortController();
    const timeoutRemaining = Math.max(10_000, STEP_BUDGET_MS - (Date.now() - startTime));
    const timeoutId = setTimeout(() => abortController.abort(), timeoutRemaining);

    // Periodic cancellation check during streaming
    let isCancelled = false;
    const cancelInterval = setInterval(async () => {
      try {
        const { data: cCheck } = await supabase
          .from("build_runs")
          .select("status")
          .eq("id", runId)
          .maybeSingle();
        if (cCheck?.status === "cancelled") {
          isCancelled = true;
          abortController.abort();
        }
      } catch {
        // ignore cancellation check error
      }
    }, 2000);

    try {
      const stream = streamModel({
        provider: providerId,
        model,
        messages: conversationMessages,
        signal: abortController.signal,
      });

      for await (const delta of stream) {
        roundRaw += delta;
        parser.feed(delta);
      }
    } catch (streamErr: unknown) {
      await eventQueue;
      if (isCancelled) {
        return { cancelled: true };
      }
      throw streamErr;
    } finally {
      clearInterval(cancelInterval);
      clearTimeout(timeoutId);
    }

    // Await all queued DB writes and logs before checking cancellation, calling finish(), or returning
    await eventQueue;

    if (isCancelled) {
      return { cancelled: true };
    }

    const finishResult = parser.finish();
    if (finishResult.summary) {
      finalSummary = finishResult.summary;
    }

    if (askedQuestion) {
      await eventQueue;
      await supabase.from("messages").insert({
        project_id: projectId,
        user_id: userId,
        role: "assistant",
        content: askedQuestion.question,
        kind: "question",
        meta: { options: askedQuestion.options, runId },
      });
      await supabase.from("build_runs").update({ status: "waiting" }).eq("id", runId);

      return {
        waiting: true,
        question: askedQuestion.question,
        options: askedQuestion.options,
      };
    }

    // Check truncation
    if (finishResult.truncated) {
      await supabase.from("work_logs").insert({
        project_id: projectId,
        user_id: userId,
        kind: "info",
        label: `File ${finishResult.truncated.path} was cut off`,
        detail: "Requesting continuation for truncated file",
        run_id: runId,
        step_idx: stepIdx,
      });

      conversationMessages.push({ role: "assistant", content: roundRaw });
      conversationMessages.push({
        role: "user",
        content: `File ${finishResult.truncated.path} was cut off before closing tag. Please rewrite only ${finishResult.truncated.path} more compactly using <dl-write path="${finishResult.truncated.path}">...</dl-write>.`,
      });
      continue;
    }

    // Check if tools were requested or edit errors occurred
    if (readPaths.length > 0 || editErrors.length > 0) {
      const toolResults: string[] = [];
      for (const p of readPaths) {
        const c = filesMap.get(p);
        if (c !== undefined) {
          toolResults.push(`[File ${p}]:\n${c}`);
        } else {
          toolResults.push(`[File ${p}]: file not found`);
        }
      }
      for (const err of editErrors) {
        toolResults.push(`[Edit Error]: ${err}`);
      }

      conversationMessages.push({ role: "assistant", content: roundRaw });
      conversationMessages.push({
        role: "user",
        content: `[tool results]\n${toolResults.join("\n\n")}`,
      });
      continue;
    }

    // Finished round cleanly
    break;
  }

  return { summary: finalSummary };
}

export const cancelRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: run } = await supabase
      .from("build_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!run) throw new Error("Build run not found");

    await supabase
      .from("build_runs")
      .update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
      })
      .eq("id", data.runId);

    await supabase
      .from("build_steps")
      .update({
        status: "skipped",
        summary: "Cancelled by user",
      })
      .eq("run_id", data.runId)
      .in("status", ["pending", "running"]);

    await supabase.from("work_logs").insert({
      project_id: run.project_id,
      user_id: userId,
      kind: "info",
      label: "Build stopped by user",
      run_id: data.runId,
    });

    return { success: true };
  });

export const retryStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
        idx: z.number().int().min(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: run } = await supabase
      .from("build_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!run) throw new Error("Build run not found");

    await supabase
      .from("build_steps")
      .update({
        status: "pending",
        summary: null,
        started_at: null,
        finished_at: null,
      })
      .eq("run_id", data.runId)
      .eq("idx", data.idx);

    await supabase
      .from("build_runs")
      .update({
        status: "running",
        error: null,
      })
      .eq("id", data.runId);

    return { success: true };
  });

export const skipStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
        idx: z.number().int().min(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: run } = await supabase
      .from("build_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!run) throw new Error("Build run not found");

    await supabase
      .from("build_steps")
      .update({
        status: "skipped",
        summary: "Skipped by user",
        finished_at: new Date().toISOString(),
      })
      .eq("run_id", data.runId)
      .eq("idx", data.idx);

    return { success: true };
  });

export const executeRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: run } = await supabase
      .from("build_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!run) throw new Error("Build run not found");

    await supabase.from("build_runs").update({ status: "running" }).eq("id", data.runId);

    const { data: steps } = await supabase
      .from("build_steps")
      .select("*")
      .eq("run_id", data.runId)
      .order("idx");

    return { runId: data.runId, steps: steps ?? [] };
  });
