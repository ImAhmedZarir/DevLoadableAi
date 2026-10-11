import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type VersionItem = {
  id: string;
  projectId: string;
  runId: string | null;
  label: string;
  fileCount: number;
  createdAt: string;
  changedCount: number;
  files?: Array<{ path: string; content: string }>;
};

/**
 * Creates a snapshot of current project files (excluding uploads),
 * enforces 5MB json limit, and retains max 40 versions per project.
 */
export async function snapshotVersion(
  supabase: SupabaseClient<Database>,
  projectId: string,
  userId: string,
  label: string,
  runId?: string | null,
): Promise<string | null> {
  try {
    const { data: files } = await supabase
      .from("project_files")
      .select("path,content,is_upload")
      .eq("project_id", projectId)
      .neq("is_upload", true);

    const nonUploadFiles = (files ?? []).map((f) => ({
      path: f.path,
      content: f.content,
    }));

    // Cap files json at 5MB
    let filesJson = JSON.stringify(nonUploadFiles);
    const MAX_BYTES = 5 * 1024 * 1024;
    let safeFiles = nonUploadFiles;

    if (filesJson.length > MAX_BYTES) {
      // Exclude largest files until under 5MB
      const sorted = nonUploadFiles.slice().sort((a, b) => b.content.length - a.content.length);
      safeFiles = [];
      let currentSize = 0;
      for (const file of sorted) {
        if (currentSize + file.content.length < MAX_BYTES) {
          safeFiles.push(file);
          currentSize += file.content.length;
        }
      }
      filesJson = JSON.stringify(safeFiles);
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("project_versions")
      .insert({
        project_id: projectId,
        user_id: userId,
        run_id: runId || null,
        label,
        files: safeFiles,
        file_count: safeFiles.length,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.warn("Failed to insert snapshotVersion:", insertErr?.message);
      return null;
    }

    // Retain newest 40 versions per project; delete older ones
    const { data: olderVersions } = await supabase
      .from("project_versions")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (olderVersions && olderVersions.length > 40) {
      const idsToDelete = olderVersions.slice(40).map((v) => v.id);
      await supabase.from("project_versions").delete().in("id", idsToDelete);
    }

    return inserted.id;
  } catch (err) {
    console.error("snapshotVersion error:", err);
    return null;
  }
}

/**
 * Lists versions for a project without full file payloads.
 */
export const listVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project belongs to user or accessible
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (!proj) throw new Error("Project not found");

    const { data: versions, error } = await supabase
      .from("project_versions")
      .select("id,project_id,run_id,label,files,file_count,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to load versions (table may not exist yet):", error.message);
      return [];
    }

    const versionList = versions ?? [];
    const results: VersionItem[] = [];

    for (let i = 0; i < versionList.length; i++) {
      const v = versionList[i];
      const older = versionList[i + 1];

      let changedCount = v.file_count;
      if (older) {
        const currentFiles = (v.files as Array<{ path: string; content: string }>) || [];
        const olderFiles = (older.files as Array<{ path: string; content: string }>) || [];
        const olderMap = new Map(olderFiles.map((f) => [f.path, f.content]));

        let diffCount = 0;
        for (const cf of currentFiles) {
          const oldContent = olderMap.get(cf.path);
          if (oldContent === undefined || oldContent !== cf.content) {
            diffCount++;
          }
        }
        for (const of of olderFiles) {
          if (!currentFiles.some((f) => f.path === of.path)) {
            diffCount++;
          }
        }
        changedCount = diffCount;
      }

      results.push({
        id: v.id,
        projectId: v.project_id,
        runId: v.run_id,
        label: v.label,
        fileCount: v.file_count,
        createdAt: v.created_at,
        changedCount,
      });
    }

    return results;
  });

/**
 * Fetches single version with files for read-only preview.
 */
export const getVersionDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        versionId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: version, error } = await supabase
      .from("project_versions")
      .select("id,project_id,run_id,label,files,file_count,created_at")
      .eq("id", data.versionId)
      .maybeSingle();

    if (error || !version) throw new Error("Version not found");

    return {
      id: version.id,
      projectId: version.project_id,
      runId: version.run_id,
      label: version.label,
      fileCount: version.file_count,
      createdAt: version.created_at,
      files: (version.files as Array<{ path: string; content: string }>) || [],
    };
  });

/**
 * Reverts project files to a specified version snapshot.
 */
export const revertToVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        versionId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: version, error: vErr } = await supabase
      .from("project_versions")
      .select("id,project_id,label,files")
      .eq("id", data.versionId)
      .maybeSingle();

    if (vErr || !version) throw new Error("Version not found");

    // 1. Refuse if an active run exists
    const { data: activeRuns } = await supabase
      .from("build_runs")
      .select("id,status")
      .eq("project_id", version.project_id)
      .in("status", ["planning", "running", "waiting"]);

    if (activeRuns && activeRuns.length > 0) {
      throw new Error("Cannot restore version while a build run is active.");
    }

    // 2. Snapshot current state as "Before revert"
    await snapshotVersion(supabase, version.project_id, userId, "Before revert");

    // 3. Replace all non-upload files
    const targetFiles = (version.files as Array<{ path: string; content: string }>) || [];
    const targetPaths = new Set(targetFiles.map((f) => f.path));

    // Get current non-upload files to delete missing ones
    const { data: currentFiles } = await supabase
      .from("project_files")
      .select("id,path")
      .eq("project_id", version.project_id)
      .neq("is_upload", true);

    const filesToDelete = (currentFiles ?? []).filter((cf) => !targetPaths.has(cf.path));
    if (filesToDelete.length > 0) {
      await supabase
        .from("project_files")
        .delete()
        .in(
          "id",
          filesToDelete.map((f) => f.id),
        );
    }

    // Upsert target files
    for (const f of targetFiles) {
      const existing = (currentFiles ?? []).find((cf) => cf.path === f.path);
      if (existing) {
        await supabase
          .from("project_files")
          .update({ content: f.content, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("project_files").insert({
          project_id: version.project_id,
          user_id: userId,
          path: f.path,
          content: f.content,
          is_upload: false,
        });
      }
    }

    // 4. Write work_log
    await supabase.from("work_logs").insert({
      project_id: version.project_id,
      user_id: userId,
      kind: "status",
      label: `Restored version ${version.label}`,
    });

    return { success: true };
  });
