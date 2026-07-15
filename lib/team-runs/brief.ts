import type { PlanNode, RoleTemplate, TeamRun } from "./types";

/** Build a self-contained dispatch brief (contracts.md §6). */
export function buildDispatchBrief(input: {
  run: TeamRun;
  node: PlanNode;
  role: RoleTemplate;
  dependencyArtifactPaths: string[];
  outputPaths: string[];
  hardExpectations: string[];
}): string {
  const { run, node, role, dependencyArtifactPaths, outputPaths, hardExpectations } = input;
  const reworkNotes = latestReworkNotes(run, 5);
  const lines = [
    `# Team Run Dispatch`,
    ``,
    `You are **${role.name}** (\`roleId=${role.roleId}\`).`,
    ``,
    `## Goal`,
    run.goal.trim(),
    ``,
    ...(run.goalSpec
      ? [
          `## Goal Spec (authoritative)`,
          `- Outcome: ${run.goalSpec.outcome}`,
          `- Primary Path: ${run.goalSpec.primaryPath || "(missing)"}`,
          `- Acceptance checks (human will verify these):`,
          ...run.goalSpec.acceptanceChecks.map((c, i) => `  ${i + 1}. ${c}`),
          run.goalSpec.constraints ? `- Constraints: ${run.goalSpec.constraints}` : "",
          run.goalSpec.outOfScope ? `- Out of scope: ${run.goalSpec.outOfScope}` : "",
          ``,
          `Also read project files if present: \`.team/goal-spec.md\`, \`.team/goal.md\`.`,
          ``,
        ].filter((l) => l !== "")
      : [
          `Read \`.team/goal-spec.md\` / \`.team/goal.md\` if present for Primary Path and acceptance checks.`,
          ``,
        ]),
    ...(reworkNotes.length
      ? [
          `## Human rework / notes (MUST address)`,
          ...reworkNotes.map((n) => `- ${n}`),
          ``,
          `Prioritize fixing these issues on the Primary Path before adding new scope.`,
          ``,
        ]
      : []),
    `## This node`,
    `- node id: \`${node.id}\``,
    `- title: ${node.title}`,
    `- attempt: ${node.attempts}`,
    ``,
    `## Role responsibilities`,
    role.systemPrompt.trim(),
    ``,
    `## Dependency artifacts (read these; they are the contract)`,
    ...(dependencyArtifactPaths.length
      ? dependencyArtifactPaths.map((p) => `- ${p}`)
      : ["- (none)"]),
    ``,
    `## Required outputs (write exactly these paths)`,
    ...outputPaths.map((p) => `- ${p}`),
    ``,
    `## Hard validation expectations`,
    ...hardExpectations.map((e) => `- ${e}`),
    ``,
    `## Anti false-green rules`,
    `- Primary Path is how a **human** opens/uses the result (not only a hidden dev path).`,
    `- If you only verified a secondary environment, do **not** claim overall pass.`,
    `- Prefer evidence (commands, URLs, file:// notes) over vague "works".`,
    ``,
    `## Rules`,
    `- Treat this brief as self-contained; do not rely on prior chat memory as the source of truth.`,
    `- Prefer the dependency artifacts over assumptions.`,
    `- Required output paths usually do not exist yet. Create them with the write tool (do not only read them first).`,
    role.roleId === "orchestrator"
      ? `- You may write under .team/ only. Do not edit business source code.`
      : `- Stay within the scope of this node. Avoid unrelated refactors.`,
    ``,
  ];
  return lines.join("\n");
}

/** Most recent human notes, with rework lines first. */
export function latestReworkNotes(run: TeamRun, limit = 5): string[] {
  const notes = [...(run.humanNotes ?? [])].reverse();
  const rework = notes.filter((n) => /^Rework requested:|^Reject:/i.test(n.text));
  const other = notes.filter((n) => !/^Rework requested:|^Reject:/i.test(n.text));
  return [...rework, ...other]
    .slice(0, limit)
    .map((n) => n.text.trim())
    .filter(Boolean);
}
