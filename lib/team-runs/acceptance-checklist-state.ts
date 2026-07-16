export type AcceptanceCheckState = "unchecked" | "pass" | "fail";

const STORAGE_PREFIX = "pi-team-acceptance-checks:";

export function acceptanceChecklistStorageKey(runId: string): string {
  return `${STORAGE_PREFIX}${runId}`;
}

export function parseAcceptanceChecklistState(
  raw: string | null,
  allowedIds: string[],
): Record<string, AcceptanceCheckState> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const allowed = new Set(allowedIds);
    const result: Record<string, AcceptanceCheckState> = {};
    for (const [id, state] of Object.entries(value)) {
      if (!allowed.has(id)) continue;
      if (state === "unchecked" || state === "pass" || state === "fail") result[id] = state;
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeAcceptanceChecklistState(
  state: Record<string, AcceptanceCheckState>,
): string {
  const persisted: Record<string, "pass" | "fail"> = {};
  for (const [id, value] of Object.entries(state)) {
    if (value === "pass" || value === "fail") persisted[id] = value;
  }
  return JSON.stringify(persisted);
}
