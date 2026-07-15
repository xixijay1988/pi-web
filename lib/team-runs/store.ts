import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { DEFAULT_BUDGET, createDefaultFeatureNodes } from "./defaults";
import { projectGoalPath, projectGoalSpecPath, projectPlanPath, projectTeamDir, teamRunPath, teamRunsDir } from "./paths";
import type { GoalSpec, RoleTemplate, RunEvent, TeamRun, TeamRunListItem } from "./types";
import { goalSpecSummary, renderGoalSpecMarkdown } from "./goal-spec";

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function atomicWriteJson(filePath: string, value: unknown): void {
  ensureDir(dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

export function readTeamRun(runId: string, agentDir?: string): TeamRun | null {
  const path = teamRunPath(runId, agentDir);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as TeamRun;
}

export function writeTeamRun(run: TeamRun, agentDir?: string): void {
  const next: TeamRun = { ...run, updatedAt: nowIso() };
  atomicWriteJson(teamRunPath(next.id, agentDir), next);
}

export function appendRunEvent(
  run: TeamRun,
  event: Omit<RunEvent, "at"> & { at?: string },
  agentDir?: string,
): TeamRun {
  const full: RunEvent = { at: event.at ?? nowIso(), ...event };
  const next: TeamRun = {
    ...run,
    events: [...run.events, full],
    updatedAt: full.at,
  };
  writeTeamRun(next, agentDir);
  return next;
}

export function listTeamRuns(agentDir?: string): TeamRunListItem[] {
  const dir = teamRunsDir(agentDir);
  if (!existsSync(dir)) return [];
  const items: TeamRunListItem[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    try {
      const run = JSON.parse(readFileSync(join(dir, name), "utf8")) as TeamRun;
      const current = run.plan.nodes.find((n) =>
        n.status === "running" || n.status === "starting" || n.status === "validating"
      ) ?? run.plan.nodes.find((n) => n.status === "ready" || n.status === "pending");
      items.push({
        id: run.id,
        cwd: run.cwd,
        goal: run.goal,
        status: run.status,
        updatedAt: run.updatedAt,
        currentNodeId: current?.id,
      });
    } catch {
      // skip corrupt
    }
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
}

export type CreateTeamRunInput = {
  cwd: string;
  goal: string;
  goalSpec?: GoalSpec;
  roleSnapshots: RoleTemplate[];
  budget?: Partial<TeamRun["budget"]>;
  agentDir?: string;
};

export function createTeamRun(input: CreateTeamRunInput): TeamRun {
  const createdAt = nowIso();
  const goal = (input.goalSpec ? goalSpecSummary(input.goalSpec) : input.goal).trim();
  const run: TeamRun = {
    id: randomUUID(),
    cwd: input.cwd,
    goal,
    goalSpec: input.goalSpec,
    status: "created",
    budget: { ...DEFAULT_BUDGET, ...input.budget },
    replanCount: 0,
    roleSnapshots: input.roleSnapshots.map((r) => ({ ...r })),
    plan: {
      version: 0,
      nodes: createDefaultFeatureNodes(),
      rawPlanPath: projectPlanPath(input.cwd),
    },
    humanNotes: [],
    events: [
      {
        at: createdAt,
        type: "run_created",
        message: "Team Run created",
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };

  ensureDir(teamRunsDir(input.agentDir));
  ensureDir(projectTeamDir(input.cwd));
  if (input.goalSpec) {
    const md = renderGoalSpecMarkdown(input.goalSpec);
    writeFileSync(projectGoalSpecPath(input.cwd), md, "utf8");
    writeFileSync(projectGoalPath(input.cwd), md, "utf8");
  } else {
    writeFileSync(projectGoalPath(input.cwd), `# Goal

${goal}
`, "utf8");
  }
  writeTeamRun(run, input.agentDir);
  return run;
}

export function deleteTeamRun(runId: string, agentDir?: string): boolean {
  const path = teamRunPath(runId, agentDir);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
