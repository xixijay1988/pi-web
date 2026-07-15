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
          `- Primary Path: ${run.goalSpec.primaryPath || "(missing)"}`,
          `- Acceptance checks:`,
          ...run.goalSpec.acceptanceChecks.map((c, i) => `  ${i + 1}. ${c}`),
          run.goalSpec.constraints ? `- Constraints: ${run.goalSpec.constraints}` : "",
          run.goalSpec.outOfScope ? `- Out of scope: ${run.goalSpec.outOfScope}` : "",
          ``,
        ].filter((l) => l !== "")
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
