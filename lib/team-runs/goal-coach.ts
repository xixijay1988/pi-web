import type { GoalSpec } from "./goal-spec";
import { parseGoalSpecMarkdown, validateGoalSpec } from "./goal-spec";
import type { RoleTemplate } from "./types";

export const GOAL_COACH_ROLE_ID = "goal_coach";

/** Sticky coach role — not part of the default feature DAG. */
export const GOAL_COACH_ROLE: RoleTemplate = {
  roleId: GOAL_COACH_ROLE_ID,
  name: "Goal Coach",
  description: "Interviews the user to produce a strong Goal Spec before a Team Run starts.",
  systemPrompt: [
    "You are the Goal Coach for a multi-role Team Run product.",
    "Your only job is to help the human write a strong Goal Spec before work starts.",
    "A strong Goal Spec has:",
    "1) Outcome — what exists when done",
    "2) Primary Path — exactly how a HUMAN opens/uses the result (not only a developer server)",
    "3) At least 3 observable acceptance checks",
    "4) Optional constraints / out of scope",
    "",
    "Critical anti-false-green rules (from real failures):",
    "- Always pin the human Primary Path (e.g. double-click index.html / file:// vs npx serve / npm run dev).",
    "- If ES modules, static assets, or localStorage are involved, call out environment risks.",
    "- Acceptance checks must be things a human can verify without reading code.",
    "- Prefer fewer clear checks over vague 'works well' language.",
    "",
    "Workflow:",
    "- Ask short, focused questions when details are missing.",
    "- You may inspect the project with read-only tools when helpful.",
    "- When the Goal Spec is ready enough to start a Team Run, emit a fenced block:",
    "```goal_spec",
    "## Outcome",
    "...",
    "## Primary Path",
    "...",
    "## Acceptance Checks",
    "1. ...",
    "2. ...",
    "3. ...",
    "## Constraints",
    "...",
    "## Out of Scope",
    "...",
    "```",
    "Only emit that fenced block when ready; otherwise keep interviewing.",
    "Do not implement the feature. Do not edit project files.",
  ].join("\n"),
  provider: "",
  modelId: "",
  toolPreset: "readonly",
};

export function buildGoalCoachKickoffMessage(
  idea?: string,
  opts?: { skillNames?: string[] },
): string {
  const trimmed = idea?.trim();
  const skills = (opts?.skillNames ?? []).map((s) => s.trim()).filter(Boolean);
  const skillLine = skills.length
    ? `Attached Skills to follow: ${skills.join(", ")}.`
    : "No extra Skills attached — still produce a strong Goal Spec.";
  if (!trimmed) {
    return [
      "Help me write a strong Goal Spec for a Team Run in this project.",
      skillLine,
      "Interview me about Outcome, Primary Path (how a human opens/uses it), and ≥3 acceptance checks.",
      "When ready, emit a ```goal_spec fenced block.",
    ].join("\n");
  }
  return [
    "Help me turn this idea into a strong Goal Spec for a Team Run.",
    skillLine,
    "",
    "## Raw idea",
    trimmed,
    "",
    "Interview me only where needed. Pin the human Primary Path carefully.",
    "When ready, emit a ```goal_spec fenced block with Outcome, Primary Path, ≥3 Acceptance Checks,",
    "and optional Constraints / Out of Scope.",
  ].join("\n");
}

export function buildGoalCoachFollowUpMessage(text: string): string {
  return text.trim();
}

const FENCE_RE = /```(?:goal_spec|goal-spec|goalspec)\s*\n([\s\S]*?)```/i;

/** Extract Goal Spec draft from coach assistant text (fenced block preferred). */
export function extractGoalSpecFromCoachText(text: string): {
  draft?: GoalSpec;
  rawBlock?: string;
  errors: string[];
  warnings: string[];
} {
  const source = text ?? "";
  const fence = source.match(FENCE_RE);
  const rawBlock = fence?.[1]?.trim();
  if (rawBlock) {
    const draft = parseGoalSpecMarkdown(`# Goal Spec\n\n${rawBlock}`);
    const validated = validateGoalSpec(draft, { requireStrong: true });
    return {
      draft,
      rawBlock,
      errors: validated.errors,
      warnings: validated.warnings,
    };
  }

  // Fallback: whole message looks like a Goal Spec markdown doc
  if (/##\s*Primary Path/i.test(source) && /##\s*Acceptance/i.test(source)) {
    const draft = parseGoalSpecMarkdown(source);
    const validated = validateGoalSpec(draft, { requireStrong: true });
    return {
      draft,
      rawBlock: source.trim(),
      errors: validated.errors,
      warnings: validated.warnings,
    };
  }

  return { errors: [], warnings: [] };
}

export function goalCoachSessionName(): string {
  return "Team Goal Coach";
}
