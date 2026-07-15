import { createHash } from "crypto";
import { join, normalize } from "path";
import { getAgentDir } from "../session-reader";
import type { RoleId } from "./types";

export function teamRunsDir(agentDir = getAgentDir()): string {
  return join(agentDir, "team-runs");
}

export function teamRunPath(runId: string, agentDir = getAgentDir()): string {
  return join(teamRunsDir(agentDir), `${runId}.json`);
}

export function globalRolesPath(agentDir = getAgentDir()): string {
  return join(agentDir, "team-roles.json");
}

export function projectTeamDir(cwd: string): string {
  return join(normalize(cwd), ".team");
}

export function projectRolesPath(cwd: string): string {
  return join(projectTeamDir(cwd), "roles.json");
}

export function projectGoalPath(cwd: string): string {
  return join(projectTeamDir(cwd), "goal.md");
}

export function projectPlanPath(cwd: string): string {
  return join(projectTeamDir(cwd), "plan.md");
}

export function projectNotesPath(cwd: string): string {
  return join(projectTeamDir(cwd), "notes.md");
}

/**
 * Versioned step artifact directory:
 * .team/steps/<NN>-<roleId>/v<attempt>/
 */
export function stepDir(
  cwd: string,
  stepIndex: number,
  roleId: RoleId,
  attempt: number,
): string {
  const nn = String(stepIndex).padStart(2, "0");
  return join(projectTeamDir(cwd), "steps", `${nn}-${roleId}`, `v${attempt}`);
}

export function stepArtifactPath(
  cwd: string,
  stepIndex: number,
  roleId: RoleId,
  attempt: number,
  fileName: string,
): string {
  return join(stepDir(cwd, stepIndex, roleId, attempt), fileName);
}

/** Default primary artifact file names by roleId. */
export function defaultArtifactFileName(roleId: RoleId): string {
  switch (roleId) {
    case "architect":
      return "contract.md";
    case "implementer":
      return "change-summary.md";
    case "tester":
      return "test-report.md";
    case "reviewer":
      return "acceptance.md";
    case "orchestrator":
      return "plan.md";
    default:
      return "output.md";
  }
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
