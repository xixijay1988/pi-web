import type { Budget, PlanNode, RoleTemplate } from "./types";

export const DEFAULT_BUDGET: Budget = {
  maxAttemptsPerNode: 2,
  maxReplans: 3,
  maxRunDurationMs: 2 * 60 * 60 * 1000,
};

export const DEFAULT_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    roleId: "orchestrator",
    name: "Orchestrator",
    description: "Plans and replans the Team Run; does not implement business code.",
    systemPrompt:
      "You are the Orchestrator for a multi-role Team Run. Read the repo when needed and write only under .team/. Produce or rewrite .team/plan.md. Never edit business source files.",
    provider: "",
    modelId: "",
    toolPreset: "team_writer",
  },
  {
    roleId: "architect",
    name: "Architect",
    description: "Writes the implementation contract and acceptance-oriented invariants.",
    systemPrompt:
      "You are the Architect. Produce a clear implementation contract under the assigned .team artifact path using the write tool. Prefer reading the codebase over guessing. Do not implement the feature. The artifact file does not exist yet — create it.",
    provider: "",
    modelId: "",
    toolPreset: "team_writer",
  },
  {
    roleId: "implementer",
    name: "Implementer",
    description: "Implements the contracted change in the shared workspace.",
    systemPrompt:
      "You are the Implementer. Follow the contract artifact. Make the minimal code change, then write change-summary.md at the assigned path.",
    provider: "",
    modelId: "",
    toolPreset: "full",
  },
  {
    roleId: "tester",
    name: "Tester",
    description: "Validates the change with commands/tests and reports evidence.",
    systemPrompt:
      "You are the Tester. Verify the implementation against the contract (run commands as needed). Write test-report.md at the assigned path with commands run and outcomes. The report file does not exist yet — create it with the write tool.",
    provider: "",
    modelId: "",
    toolPreset: "default",
  },
  {
    roleId: "reviewer",
    name: "Reviewer",
    description: "Accepts or rejects against the original goal with a structured verdict.",
    systemPrompt:
      "You are the Reviewer. Compare goal, contract, change summary, and test report. Write acceptance.md at the assigned path with frontmatter status: pass or status: fail. The file does not exist yet — create it with the write tool. Do not implement code.",
    provider: "",
    modelId: "",
    toolPreset: "team_writer",
  },
];

/** Default linear feature DAG (orchestrator is outside the worker chain). */
export function createDefaultFeatureNodes(): PlanNode[] {
  return [
    {
      id: "architect",
      roleId: "architect",
      title: "Write implementation contract",
      deps: [],
      status: "pending",
      attempts: 0,
      artifactPaths: [],
    },
    {
      id: "implement",
      roleId: "implementer",
      title: "Implement contracted change",
      deps: ["architect"],
      status: "pending",
      attempts: 0,
      artifactPaths: [],
    },
    {
      id: "test",
      roleId: "tester",
      title: "Test and collect evidence",
      deps: ["implement"],
      status: "pending",
      attempts: 0,
      artifactPaths: [],
    },
    {
      id: "review",
      roleId: "reviewer",
      title: "Accept or reject against goal",
      deps: ["test"],
      status: "pending",
      attempts: 0,
      artifactPaths: [],
    },
  ];
}
