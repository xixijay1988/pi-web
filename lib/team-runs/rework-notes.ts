import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { projectNotesPath } from "./paths";
import type { LastRework, TeamRun } from "./types";

export type ApplyReworkInput = {
  text?: string;
  failedChecks?: string[];
  resetFrom?: string;
  at?: string;
};

/** Normalize rework body: free text + failed Goal Spec checklist items. */
export function normalizeReworkInput(input: ApplyReworkInput): {
  text: string;
  failedChecks: string[];
  at: string;
  resetFrom?: string;
} {
  const failedChecks = uniqueNonEmpty(input.failedChecks ?? []);
  const text = (input.text ?? "").trim();
  const at = input.at ?? new Date().toISOString();
  const resetFrom = input.resetFrom?.trim() || undefined;
  return { text, failedChecks, at, resetFrom };
}

export function formatReworkNoteText(input: {
  text: string;
  failedChecks: string[];
}): string {
  const parts: string[] = [];
  if (input.failedChecks.length) {
    parts.push("Failed Goal Spec checks:");
    for (const c of input.failedChecks) parts.push(`- ${c}`);
  }
  if (input.text) parts.push(input.text);
  return parts.join("\n").trim();
}

export function formatStructuredReworkMarkdown(last: LastRework): string {
  const lines = [
    `## Rework ${last.at}`,
    ``,
    `### Failed Goal Spec checks`,
  ];
  if (last.failedChecks.length) {
    for (const c of last.failedChecks) lines.push(`- ${c}`);
  } else {
    lines.push(`- (none marked)`);
  }
  lines.push(``);
  lines.push(`### Feedback`);
  lines.push(last.text.trim() || "(no free-form text)");
  if (last.resetFrom) {
    lines.push(``);
    lines.push(`### Reset from`);
    lines.push(last.resetFrom);
  }
  lines.push(``);
  return lines.join("\n");
}

/** Append a structured rework block to `<cwd>/.team/notes.md`. */
export function appendProjectReworkNotes(cwd: string, last: LastRework): string {
  const path = projectNotesPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const block = formatStructuredReworkMarkdown(last);
  const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
  const header = prev.trim() ? prev.replace(/\s*$/, "\n\n") : "# Team notes\n\n";
  writeFileSync(path, `${header}${block}`, "utf8");
  return path;
}

/**
 * Apply structured rework onto a TeamRun:
 * - set lastRework
 * - append humanNotes line
 * - append project .team/notes.md block
 */
export function applyStructuredRework(
  run: TeamRun,
  input: ApplyReworkInput,
): { run: TeamRun; lastRework: LastRework; noteText: string; notesPath: string } {
  const norm = normalizeReworkInput(input);
  if (!norm.text && norm.failedChecks.length === 0) {
    throw new Error("rework requires feedback text and/or failedChecks");
  }
  const noteText = formatReworkNoteText(norm);
  const lastRework: LastRework = {
    at: norm.at,
    text: norm.text,
    failedChecks: norm.failedChecks,
    resetFrom: norm.resetFrom,
  };
  const notesPath = appendProjectReworkNotes(run.cwd, lastRework);
  const next: TeamRun = {
    ...run,
    lastRework,
    humanNotes: [
      ...run.humanNotes,
      { at: lastRework.at, text: `Rework requested: ${noteText}` },
    ],
  };
  return { run: next, lastRework, noteText, notesPath };
}

function uniqueNonEmpty(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
