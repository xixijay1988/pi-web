import type { Budget, BudgetCheck, PlanNode, TeamRun } from "./types";

export function checkNodeAttemptBudget(node: PlanNode, budget: Budget): BudgetCheck {
  if (node.attempts >= budget.maxAttemptsPerNode) {
    return {
      ok: false,
      reason: `Node ${node.id} exceeded maxAttemptsPerNode (${budget.maxAttemptsPerNode})`,
    };
  }
  return { ok: true };
}

export function checkReplanBudget(run: TeamRun): BudgetCheck {
  if (run.replanCount >= run.budget.maxReplans) {
    return {
      ok: false,
      reason: `Run exceeded maxReplans (${run.budget.maxReplans})`,
    };
  }
  return { ok: true };
}

export function checkDurationBudget(run: TeamRun, nowMs = Date.now()): BudgetCheck {
  const start = Date.parse(run.createdAt);
  if (Number.isNaN(start)) return { ok: true };
  if (nowMs - start > run.budget.maxRunDurationMs) {
    return {
      ok: false,
      reason: `Run exceeded maxRunDurationMs (${run.budget.maxRunDurationMs})`,
    };
  }
  return { ok: true };
}

/** All budget gates that must pass before dispatching another node. */
export function checkDispatchBudgets(run: TeamRun, node: PlanNode, nowMs = Date.now()): BudgetCheck {
  const duration = checkDurationBudget(run, nowMs);
  if (!duration.ok) return duration;
  return checkNodeAttemptBudget(node, run.budget);
}
