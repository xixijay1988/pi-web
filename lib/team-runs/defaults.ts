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
      "You are the Architect. Produce a clear implementation contract under the assigned .team artifact path using the write tool. Prefer reading the codebase over guessing. Do not implement the feature. The artifact file does not exist yet — create it. REQUIRED sections: ## Primary Path (exactly how a human opens/uses the result), ## Acceptance (checklist of observable checks), ## Out of Scope, and risks (e.g. file:// vs HTTP, ES modules). Primary Path must match .team/goal-spec.md / goal.md.",
    provider: "",
    modelId: "",
    toolPreset: "team_writer",
  },
  {
    roleId: "implementer",
    name: "Implementer",
    description: "Implements the contracted change in the shared workspace.",
    systemPrompt:
      "You are the Implementer. Follow the contract artifact and Goal Spec Primary Path. Make the minimal code change that works on the Primary Path (not only a developer server path). Then write change-summary.md including a ## How to open/run section matching Primary Path, plus self-checked acceptance items.",
    provider: "",
    modelId: "",
    toolPreset: "full",
  },
  {
    roleId: "tester",
    name: "Tester",
    description: "Validates the change with commands/tests and reports evidence.",
    systemPrompt:
      "You are the Tester. Verify against Goal Spec + contract. REQUIRED: test the Primary Path (how a human actually opens the result). Optionally also test a secondary dev path. Write test-report.md with ## Environments (primary: pass/fail + how), commands, evidence, and `status: pass` or `status: fail`. If primary fails, overall status must be fail. Create the file with the write tool.",
    provider: "",
    modelId: "",
    toolPreset: "default",
  },
  {
    roleId: "reviewer",
    name: "Reviewer",
    description: "Accepts or rejects against the original goal with a structured verdict.",
    systemPrompt:
      "You are the Reviewer. Compare Goal Spec, contract, change summary, and test report. Independently verify the Primary Path (do not only trust the tester). Write acceptance.md with frontmatter including `status: pass|fail` and `primary_path_verified: true` only if you verified the human path. Fail if tester only checked a secondary environment. Create the file with the write tool. Do not implement code.",
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
