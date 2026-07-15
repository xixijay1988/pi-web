export type GoalSpec = {
  outcome: string;
  primaryPath: string;
  acceptanceChecks: string[];
  constraints?: string;
  outOfScope?: string;
  notes?: string;
};

export type GoalSpecValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  spec?: GoalSpec;
};

const MIN_CHECKS = 3;

/** Normalize freeform UI / API input into a GoalSpec. */
export function buildGoalSpec(input: {
  outcome?: string;
  primaryPath?: string;
  acceptanceChecks?: string[] | string;
  constraints?: string;
  outOfScope?: string;
  notes?: string;
  /** Backward compat: plain goal string only */
  goal?: string;
}): GoalSpec {
  const outcome = (input.outcome ?? input.goal ?? "").trim();
  const primaryPath = (input.primaryPath ?? "").trim();
  const checks = normalizeChecks(input.acceptanceChecks);
  return {
    outcome,
    primaryPath,
    acceptanceChecks: checks,
    constraints: emptyToUndef(input.constraints),
    outOfScope: emptyToUndef(input.outOfScope),
    notes: emptyToUndef(input.notes),
  };
}

export function validateGoalSpec(
  input: GoalSpec,
  opts?: { requireStrong?: boolean },
): GoalSpecValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requireStrong = opts?.requireStrong !== false;

  if (!input.outcome.trim()) errors.push("Outcome / goal is required");
  if (requireStrong) {
    if (!input.primaryPath.trim()) {
      errors.push("Primary Path is required (how a human opens/uses the result)");
    }
    if (input.acceptanceChecks.length < MIN_CHECKS) {
      errors.push(`At least ${MIN_CHECKS} acceptance checks are required (got ${input.acceptanceChecks.length})`);
    }
  } else {
    if (!input.primaryPath.trim()) warnings.push("Primary Path missing — team may test the wrong environment");
    if (input.acceptanceChecks.length < MIN_CHECKS) {
      warnings.push(`Fewer than ${MIN_CHECKS} acceptance checks — higher rework risk`);
    }
  }

  for (const c of input.acceptanceChecks) {
    if (c.length < 4) errors.push(`Acceptance check too short: "${c}"`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    spec: input,
  };
}

export function renderGoalSpecMarkdown(spec: GoalSpec): string {
  const lines = [
    `# Goal Spec`,
    ``,
    `## Outcome`,
    spec.outcome.trim(),
    ``,
    `## Primary Path`,
    spec.primaryPath.trim() || "_(not specified)_",
    ``,
    `## Acceptance Checks`,
    ...(spec.acceptanceChecks.length
      ? spec.acceptanceChecks.map((c, i) => `${i + 1}. ${c}`)
      : ["_(none)_"]),
    ``,
  ];
  if (spec.constraints?.trim()) {
    lines.push(`## Constraints`, spec.constraints.trim(), ``);
  }
  if (spec.outOfScope?.trim()) {
    lines.push(`## Out of Scope`, spec.outOfScope.trim(), ``);
  }
  if (spec.notes?.trim()) {
    lines.push(`## Notes for Team`, spec.notes.trim(), ``);
  }
  return lines.join("\n");
}

export function parseGoalSpecMarkdown(markdown: string): GoalSpec {
  const outcome = sectionBody(markdown, "Outcome") || firstNonEmptyLine(markdown);
  const primaryPath = sectionBody(markdown, "Primary Path");
  const checksSection = sectionBody(markdown, "Acceptance Checks");
  const acceptanceChecks = checksSection
    ? checksSection
        .split(/\n/)
        .map((l) => l.replace(/^\s*(?:\d+[.)]\s*|[-*]\s*)/, "").trim())
        .filter(Boolean)
    : [];
  return {
    outcome: outcome.trim(),
    primaryPath: primaryPath.trim(),
    acceptanceChecks,
    constraints: emptyToUndef(sectionBody(markdown, "Constraints")),
    outOfScope: emptyToUndef(sectionBody(markdown, "Out of Scope")),
    notes: emptyToUndef(sectionBody(markdown, "Notes for Team") || sectionBody(markdown, "Notes")),
  };
}

export function goalSpecSummary(spec: GoalSpec): string {
  return spec.outcome.trim();
}

function normalizeChecks(raw?: string[] | string): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  return raw
    .split(/\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]\s*|[-*]\s*)/, "").trim())
    .filter(Boolean);
}

function emptyToUndef(s?: string): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

function sectionBody(markdown: string, title: string): string {
  const re = new RegExp(
    `##\\s*${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "i",
  );
  const m = markdown.match(re);
  return m?.[1]?.trim() ?? "";
}

function firstNonEmptyLine(markdown: string): string {
  for (const line of markdown.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    return t;
  }
  return "";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
