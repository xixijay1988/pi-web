import type { NodeStatus, PlanNode, RunStatus, TeamRun } from "./types";

const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  created: ["planning", "cancelled", "paused"],
  planning: ["executing", "planning", "blocked", "failed", "cancelled", "paused"],
  executing: ["executing", "replanning", "awaiting_human_acceptance", "blocked", "failed", "paused", "cancelled"],
  replanning: ["executing", "blocked", "failed", "cancelled", "paused", "planning"],
  awaiting_human_acceptance: ["done", "blocked", "cancelled", "paused", "replanning"],
  paused: ["executing", "planning", "replanning", "cancelled", "blocked", "created"],
  blocked: ["planning", "replanning", "executing", "cancelled", "paused", "awaiting_human_acceptance"],
  cancelled: [],
  failed: [],
  done: [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return true;
  return RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Invalid run transition: ${from} → ${to}`);
  }
}

export function withRunStatus(run: TeamRun, status: RunStatus): TeamRun {
  assertRunTransition(run.status, status);
  return { ...run, status };
}

export function depsSatisfied(node: PlanNode, nodes: PlanNode[]): boolean {
  return node.deps.every((depId) => {
    const dep = nodes.find((n) => n.id === depId);
    return dep?.status === "succeeded";
  });
}

/** Serial v1: at most one non-terminal active node; pick first ready by plan order. */
export function selectNextSerialNode(nodes: PlanNode[]): PlanNode | null {
  const active = nodes.some((n) =>
    n.status === "starting" || n.status === "running" || n.status === "validating"
  );
  if (active) return null;

  for (const node of nodes) {
    if (node.status === "pending" || node.status === "ready" || node.status === "failed") {
      // failed nodes are only re-selected by explicit retry policy (attempts bump elsewhere)
      if (node.status === "failed") continue;
      if (depsSatisfied(node, nodes)) return node;
    }
  }
  return null;
}

export function markReadyNodes(nodes: PlanNode[]): PlanNode[] {
  return nodes.map((n) => {
    if (n.status === "pending" && depsSatisfied(n, nodes)) {
      return { ...n, status: "ready" as NodeStatus };
    }
    return n;
  });
}

export function allWorkersSucceeded(nodes: PlanNode[]): boolean {
  return nodes.length > 0 && nodes.every((n) => n.status === "succeeded" || n.status === "skipped");
}

export function beginNodeAttempt(node: PlanNode, dispatchId: string): PlanNode {
  return {
    ...node,
    status: "starting",
    attempts: node.attempts + 1,
    activeDispatchId: dispatchId,
    lastError: undefined,
  };
}

export function setNodeStatus(node: PlanNode, status: NodeStatus, lastError?: string): PlanNode {
  return {
    ...node,
    status,
    lastError,
    activeDispatchId: status === "running" || status === "starting" || status === "validating"
      ? node.activeDispatchId
      : undefined,
  };
}

export function replaceNode(run: TeamRun, node: PlanNode): TeamRun {
  return {
    ...run,
    plan: {
      ...run.plan,
      nodes: run.plan.nodes.map((n) => (n.id === node.id ? node : n)),
    },
  };
}
