// Canonical Team Run types — keep in sync with docs/team-runs/contracts.md

import type { GoalSpec } from "./goal-spec";
export type { GoalSpec } from "./goal-spec";

export type RoleId = string;

export type TeamToolPreset =
  | "none"
  | "default"
  | "full"
  | "readonly"
  | "team_writer";

export type RoleTemplate = {
  roleId: RoleId;
  name: string;
  description: string;
  systemPrompt: string;
  provider: string;
  modelId: string;
  toolPreset: TeamToolPreset;
  toolNames?: string[];
};

export type RunStatus =
  | "created"
  | "planning"
  | "executing"
  | "replanning"
  | "awaiting_human_acceptance"
  | "paused"
  | "blocked"
  | "cancelled"
  | "failed"
  | "done";

export type NodeStatus =
  | "pending"
  | "ready"
  | "starting"
  | "running"
  | "validating"
  | "succeeded"
  | "failed"
  | "skipped";

export type Budget = {
  maxAttemptsPerNode: number;
  maxReplans: number;
  maxRunDurationMs: number;
};

export type PlanNode = {
  id: string;
  roleId: RoleId;
  title: string;
  deps: string[];
  status: NodeStatus;
  attempts: number;
  sessionId?: string;
  sessionFile?: string;
  activeDispatchId?: string;
  lastError?: string;
  artifactPaths: string[];
};

export type RunEventType =
  | "run_created"
  | "planning_started"
  | "plan_accepted"
  | "planning_failed"
  | "node_dispatch"
  | "node_agent_end"
  | "artifact_validation_ok"
  | "artifact_validation_failed"
  | "retry_scheduled"
  | "replan_started"
  | "blocked"
  | "paused"
  | "resumed"
  | "cancelled"
  | "awaiting_human"
  | "accepted"
  | "failed"
  | "done"
  | "human_note_added";

export type RunEvent = {
  at: string;
  type: RunEventType;
  message?: string;
  nodeId?: string;
  dispatchId?: string;
  data?: Record<string, unknown>;
};

export type TeamRun = {
  id: string;
  cwd: string;
  goal: string;
  goalSpec?: GoalSpec;
  status: RunStatus;
  budget: Budget;
  replanCount: number;
  roleSnapshots: RoleTemplate[];
  plan: {
    version: number;
    nodes: PlanNode[];
    rawPlanPath: string;
  };
  humanNotes: { at: string; text: string }[];
  events: RunEvent[];
  createdAt: string;
  updatedAt: string;
};

export type TeamRunListItem = {
  id: string;
  cwd: string;
  goal: string;
  status: RunStatus;
  updatedAt: string;
  currentNodeId?: string;
};

export type ValidationResult = {
  ok: boolean;
  hardErrors: string[];
  softWarnings: string[];
  contentHash?: string;
};

export type BudgetCheck = {
  ok: boolean;
  reason?: string;
};
