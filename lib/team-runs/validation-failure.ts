import type { PlanNode, RunEvent } from "./types";

export type ValidationFailureSummary = {
  at: string;
  nodeId?: string;
  hardErrors: string[];
  artifactPaths: string[];
};

export function validationFailureDetails(
  event: RunEvent,
  nodes: Pick<PlanNode, "id" | "artifactPaths">[] = [],
): ValidationFailureSummary | null {
  if (event.type !== "artifact_validation_failed") return null;

  const hardErrors = stringArray(event.data?.hardErrors);
  const artifactPaths = stringArray(event.data?.paths);
  const fallbackPaths = event.nodeId
    ? nodes.find((node) => node.id === event.nodeId)?.artifactPaths ?? []
    : [];

  return {
    at: event.at,
    nodeId: event.nodeId,
    hardErrors: hardErrors.length
      ? hardErrors
      : (event.message ?? "Artifact validation failed")
          .split(/;\s*/)
          .map((part) => part.trim())
          .filter(Boolean),
    artifactPaths: artifactPaths.length ? artifactPaths : fallbackPaths,
  };
}

export function latestValidationFailure(
  events: RunEvent[],
  nodes: Pick<PlanNode, "id" | "artifactPaths">[] = [],
): ValidationFailureSummary | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type === "artifact_validation_ok") return null;
    const failure = validationFailureDetails(event, nodes);
    if (failure) return failure;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
