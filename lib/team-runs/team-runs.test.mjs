import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  createTeamRun,
  readTeamRun,
  listTeamRuns,
  appendRunEvent,
  validateArtifactFile,
  validateArtifacts,
  parsePlanMarkdown,
  toPlanNodes,
  checkDispatchBudgets,
  checkReplanBudget,
  checkDurationBudget,
  canTransitionRun,
  selectNextSerialNode,
  markReadyNodes,
  beginNodeAttempt,
  replaceNode,
  buildDispatchBrief,
  resolveRolesForCwd,
  saveProjectRoles,
  saveGlobalRoles,
  snapshotRoles,
  DEFAULT_ROLE_TEMPLATES,
  toolNamesForTeamPreset,
  stepArtifactPath,
} = await jiti.import("./index.ts");

function tempAgentDir() {
  return mkdtempSync(join(tmpdir(), "pi-team-runs-"));
}

function tempCwd() {
  return mkdtempSync(join(tmpdir(), "pi-team-cwd-"));
}

test("create/read/list team run persists under agent dir", () => {
  const agentDir = tempAgentDir();
  const cwd = tempCwd();
  try {
    const run = createTeamRun({
      cwd,
      goal: "Add a hello world helper",
      roleSnapshots: snapshotRoles(DEFAULT_ROLE_TEMPLATES),
      agentDir,
    });
    assert.equal(run.status, "created");
    assert.equal(run.plan.nodes.length, 4);
    assert.ok(run.events.some((e) => e.type === "run_created"));

    const loaded = readTeamRun(run.id, agentDir);
    assert.ok(loaded);
    assert.equal(loaded.goal, "Add a hello world helper");

    const list = listTeamRuns(agentDir);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, run.id);

    const withEvent = appendRunEvent(loaded, { type: "planning_started", message: "go" }, agentDir);
    assert.equal(withEvent.events.at(-1).type, "planning_started");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("acceptance hard validation", () => {
  const dir = tempCwd();
  try {
    const passPath = join(dir, "acceptance.md");
    writeFileSync(passPath, "---\nstatus: pass\n---\n\n# Acceptance\n\nLooks good enough for the checklist.\n");
    const pass = validateArtifactFile(passPath);
    assert.equal(pass.ok, true);
    assert.ok(pass.contentHash);

    const failPath = join(dir, "acceptance-fail.md");
    writeFileSync(failPath, "---\nstatus: fail\n---\n\nNo.\n");
    // rename expectation uses basename acceptance.md — test generic missing/status via validateArtifactFile on acceptance name
    const acceptanceFail = join(dir, "acceptance.md");
    writeFileSync(acceptanceFail, "---\nstatus: fail\n---\n\nNeeds more work on the implementation.\n");
    const failed = validateArtifactFile(acceptanceFail);
    assert.equal(failed.ok, false);
    assert.ok(failed.hardErrors.some((e) => /fail/i.test(e)));

    const missing = validateArtifactFile(join(dir, "nope.md"));
    assert.equal(missing.ok, false);

    const multi = validateArtifacts([]);
    assert.equal(multi.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan.md parser", () => {
  const md = `# Plan

## Nodes
- id: architect
  roleId: architect
  title: Contract
  deps: []
- id: implement
  roleId: implementer
  title: Code
  deps: [architect]
`;
  const parsed = parsePlanMarkdown(md);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.nodes.length, 2);
  assert.deepEqual(parsed.nodes[1].deps, ["architect"]);
  const nodes = toPlanNodes(parsed.nodes);
  assert.equal(nodes[0].status, "pending");
});

test("budgets block excess attempts/replans/duration", () => {
  const agentDir = tempAgentDir();
  const cwd = tempCwd();
  try {
    const run = createTeamRun({
      cwd,
      goal: "x",
      roleSnapshots: snapshotRoles(DEFAULT_ROLE_TEMPLATES),
      budget: { maxAttemptsPerNode: 2, maxReplans: 1, maxRunDurationMs: 1000 },
      agentDir,
    });
    const node = { ...run.plan.nodes[0], attempts: 2 };
    const attemptBudget = checkDispatchBudgets(run, node);
    assert.equal(attemptBudget.ok, false);

    const replanRun = { ...run, replanCount: 1 };
    assert.equal(checkReplanBudget(replanRun).ok, false);

    const oldRun = { ...run, createdAt: new Date(Date.now() - 5000).toISOString() };
    assert.equal(checkDurationBudget(oldRun).ok, false);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("serial node selection respects deps and single active", () => {
  let nodes = markReadyNodes([
    { id: "a", roleId: "architect", title: "A", deps: [], status: "pending", attempts: 0, artifactPaths: [] },
    { id: "b", roleId: "implementer", title: "B", deps: ["a"], status: "pending", attempts: 0, artifactPaths: [] },
  ]);
  const first = selectNextSerialNode(nodes);
  assert.equal(first?.id, "a");

  nodes = nodes.map((n) => n.id === "a" ? { ...n, status: "running" } : n);
  assert.equal(selectNextSerialNode(nodes), null);

  nodes = nodes.map((n) => n.id === "a" ? { ...n, status: "succeeded" } : n);
  nodes = markReadyNodes(nodes);
  assert.equal(selectNextSerialNode(nodes)?.id, "b");
});

test("run transitions allow known edges only", () => {
  assert.equal(canTransitionRun("created", "planning"), true);
  assert.equal(canTransitionRun("awaiting_human_acceptance", "done"), true);
  assert.equal(canTransitionRun("done", "executing"), false);
  assert.equal(canTransitionRun("cancelled", "planning"), false);
});

test("project role overrides merge by roleId", () => {
  const agentDir = tempAgentDir();
  const cwd = tempCwd();
  try {
    saveGlobalRoles(DEFAULT_ROLE_TEMPLATES, agentDir);
    saveProjectRoles(cwd, [{
      ...DEFAULT_ROLE_TEMPLATES.find((r) => r.roleId === "implementer"),
      name: "Builder",
      provider: "openai",
      modelId: "gpt-test",
    }]);
    const roles = resolveRolesForCwd(cwd, agentDir);
    const impl = roles.find((r) => r.roleId === "implementer");
    assert.equal(impl.name, "Builder");
    assert.equal(impl.modelId, "gpt-test");
    assert.ok(roles.find((r) => r.roleId === "architect"));
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dispatch brief is self-contained", () => {
  const agentDir = tempAgentDir();
  const cwd = tempCwd();
  try {
    const run = createTeamRun({
      cwd,
      goal: "Ship feature X",
      roleSnapshots: snapshotRoles(DEFAULT_ROLE_TEMPLATES),
      agentDir,
    });
    const role = run.roleSnapshots.find((r) => r.roleId === "implementer");
    const node = beginNodeAttempt(run.plan.nodes[1], "dispatch-1");
    const brief = buildDispatchBrief({
      run,
      node,
      role,
      dependencyArtifactPaths: ["/proj/.team/steps/01-architect/v1/contract.md"],
      outputPaths: ["/proj/.team/steps/02-implement/v1/change-summary.md"],
      hardExpectations: ["change-summary.md must be non-empty"],
    });
    assert.match(brief, /Ship feature X/);
    assert.match(brief, /contract\.md/);
    assert.match(brief, /change-summary\.md/);
    assert.match(brief, /self-contained/i);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tool presets map to pi tool names", () => {
  assert.deepEqual(toolNamesForTeamPreset("none"), []);
  assert.ok(toolNamesForTeamPreset("readonly").includes("read"));
  assert.ok(!toolNamesForTeamPreset("readonly").includes("edit"));
  assert.ok(toolNamesForTeamPreset("team_writer").includes("write"));
});

test("versioned artifact path helper", () => {
  const p = stepArtifactPath("/repo", 1, "architect", 2, "contract.md");
  assert.equal(p.replace(/\\/g, "/"), "/repo/.team/steps/01-architect/v2/contract.md");
});

test("beginNodeAttempt bumps attempts and sets dispatch id", () => {
  const node = {
    id: "architect",
    roleId: "architect",
    title: "A",
    deps: [],
    status: "ready",
    attempts: 0,
    artifactPaths: [],
  };
  const next = beginNodeAttempt(node, "d1");
  assert.equal(next.attempts, 1);
  assert.equal(next.activeDispatchId, "d1");
  assert.equal(next.status, "starting");
  const run = {
    plan: { nodes: [node], version: 1, rawPlanPath: "x" },
  };
  const replaced = replaceNode(run, next);
  assert.equal(replaced.plan.nodes[0].attempts, 1);
});
