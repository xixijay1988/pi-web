import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  buildGoalSpec,
  validateGoalSpec,
  renderGoalSpecMarkdown,
  parseGoalSpecMarkdown,
  projectGoalSpecPath,
  extractGoalSpecFromCoachText,
  GOAL_COACH_ROLE,
  buildGoalCoachKickoffMessage,
  extractGoalSpecFromMessages,
  messagesToTranscript,
  formatSkillsForFacilitator,
  mergeSystemPromptWithSkills,
  createAlignmentRoom,
  appendAlignmentMessage,
  pickNextParticipant,
  advanceSeatIndex,
  formatTranscriptForPrompt,
  defaultAlignmentParticipants,
  readAlignment,
  parseChoicePrompt,
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
    writeFileSync(
      passPath,
      "---\nstatus: pass\nprimary_path_verified: true\n---\n\n# Acceptance\n\nLooks good enough for the checklist.\n",
    );
    const pass = validateArtifactFile(passPath);
    assert.equal(pass.ok, true);
    assert.ok(pass.contentHash);

    // basename must be acceptance.md for hard rules
    const noPrimaryPath = join(dir, "acceptance.md");
    writeFileSync(noPrimaryPath, "---\nstatus: pass\n---\n\n# Acceptance\n\nPass without primary path verification.\n");
    const noPrimary = validateArtifactFile(noPrimaryPath);
    assert.equal(noPrimary.ok, false);
    assert.ok(noPrimary.hardErrors.some((e) => /primary_path_verified/i.test(e)));

    writeFileSync(noPrimaryPath, "---\nstatus: fail\n---\n\nNeeds more work on the implementation.\n");
    const failed = validateArtifactFile(noPrimaryPath);
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

test("goal spec requires outcome primary path and three checks", () => {
  const weak = buildGoalSpec({ goal: "Ship todo app" });
  const weakValidation = validateGoalSpec(weak, { requireStrong: true });
  assert.equal(weakValidation.ok, false);
  assert.ok(weakValidation.errors.some((e) => /Primary Path/i.test(e)));
  assert.ok(weakValidation.errors.some((e) => /acceptance checks/i.test(e)));

  const strong = buildGoalSpec({
    outcome: "Ship a local todo app",
    primaryPath: "Open index.html in browser (file:// or simple static server)",
    acceptanceChecks: [
      "Add non-empty todo → item appears",
      "Refresh keeps todos",
      "Toggle complete works",
    ],
    constraints: "Vanilla HTML/JS only",
  });
  const ok = validateGoalSpec(strong, { requireStrong: true });
  assert.equal(ok.ok, true);

  const md = renderGoalSpecMarkdown(strong);
  assert.match(md, /## Primary Path/);
  assert.match(md, /## Acceptance Checks/);
  const parsed = parseGoalSpecMarkdown(md);
  assert.equal(parsed.outcome, strong.outcome);
  assert.equal(parsed.primaryPath, strong.primaryPath);
  assert.equal(parsed.acceptanceChecks.length, 3);
});

test("createTeamRun with goalSpec writes goal-spec.md and enriches brief", () => {
  const agentDir = tempAgentDir();
  const cwd = tempCwd();
  try {
    const goalSpec = buildGoalSpec({
      outcome: "Ship a local todo app",
      primaryPath: "Open index.html via file://",
      acceptanceChecks: [
        "Add non-empty todo → item appears",
        "Refresh keeps todos",
        "Toggle complete works",
      ],
      constraints: "No build step",
    });
    const run = createTeamRun({
      cwd,
      goal: goalSpec.outcome,
      goalSpec,
      roleSnapshots: snapshotRoles(DEFAULT_ROLE_TEMPLATES),
      agentDir,
    });
    assert.equal(run.goal, goalSpec.outcome);
    assert.ok(run.goalSpec);
    assert.ok(existsSync(projectGoalSpecPath(cwd)));
    const specText = readFileSync(projectGoalSpecPath(cwd), "utf8");
    assert.match(specText, /Primary Path/);

    const role = run.roleSnapshots.find((r) => r.roleId === "implementer");
    const node = beginNodeAttempt(run.plan.nodes[1], "dispatch-goal");
    const brief = buildDispatchBrief({
      run,
      node,
      role,
      dependencyArtifactPaths: ["/proj/.team/steps/01-architect/v1/contract.md"],
      outputPaths: ["/proj/.team/steps/02-implement/v1/change-summary.md"],
      hardExpectations: ["change-summary.md must be non-empty"],
    });
    assert.match(brief, /Goal Spec \(authoritative\)/);
    assert.match(brief, /Open index\.html via file:\/\//);
    assert.match(brief, /Refresh keeps todos/);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("contract and test-report hard validation enforce primary path fields", () => {
  const dir = tempCwd();
  try {
    const weakContract = join(dir, "contract.md");
    writeFileSync(weakContract, "# Contract\n\nDo the thing somehow.\n");
    const weak = validateArtifactFile(weakContract);
    assert.equal(weak.ok, false);
    assert.ok(weak.hardErrors.some((e) => /Primary Path/i.test(e)));
    assert.ok(weak.hardErrors.some((e) => /Acceptance/i.test(e)));

    const strongContract = join(dir, "contract.md");
    writeFileSync(
      strongContract,
      "# Contract\n\n## Primary Path\n\nOpen index.html\n\n## Acceptance\n\n- Add works\n",
    );
    assert.equal(validateArtifactFile(strongContract).ok, true);

    const weakReport = join(dir, "test-report.md");
    writeFileSync(weakReport, "# Report\n\nSeems fine enough overall.\n");
    const weakR = validateArtifactFile(weakReport);
    assert.equal(weakR.ok, false);
    assert.ok(weakR.hardErrors.some((e) => /environment/i.test(e)));
    assert.ok(weakR.hardErrors.some((e) => /status/i.test(e)));

    const failPrimary = join(dir, "test-report.md");
    writeFileSync(
      failPrimary,
      "status: pass\n\n## Environments\n\nprimary: failed because modules blocked\n",
    );
    const failedPrimary = validateArtifactFile(failPrimary);
    assert.equal(failedPrimary.ok, false);
    assert.ok(failedPrimary.hardErrors.some((e) => /primary path failed/i.test(e)));

    writeFileSync(
      failPrimary,
      "status: pass\n\n## Environments\n\nprimary: pass via file:// index.html\n",
    );
    assert.equal(validateArtifactFile(failPrimary).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("goal coach extracts fenced goal_spec and validates strength", () => {
  const weakText = "Let us clarify the primary path first.";
  const none = extractGoalSpecFromCoachText(weakText);
  assert.equal(none.draft, undefined);

  const strongText = [
    "Here is a ready Goal Spec.",
    "",
    "```goal_spec",
    "## Outcome",
    "Ship a local todo app",
    "",
    "## Primary Path",
    "Open index.html via file:// in the browser",
    "",
    "## Acceptance Checks",
    "1. Add non-empty todo → item appears",
    "2. Refresh keeps todos",
    "3. Toggle complete works",
    "",
    "## Constraints",
    "Vanilla HTML/JS only",
    "```",
  ].join("\n");
  const extracted = extractGoalSpecFromCoachText(strongText);
  assert.ok(extracted.draft);
  assert.equal(extracted.draft.outcome, "Ship a local todo app");
  assert.match(extracted.draft.primaryPath, /index\.html/);
  assert.equal(extracted.draft.acceptanceChecks.length, 3);
  assert.equal(extracted.errors.length, 0);

  const incomplete = extractGoalSpecFromCoachText([
    "```goal_spec",
    "## Outcome",
    "Something",
    "",
    "## Primary Path",
    "Open it somehow",
    "```",
  ].join("\n"));
  assert.ok(incomplete.draft);
  assert.ok(incomplete.errors.some((e) => /acceptance checks/i.test(e)));
});

test("goal coach kickoff message includes idea and role is readonly", () => {
  const msg = buildGoalCoachKickoffMessage("Build a calculator");
  assert.match(msg, /Build a calculator/);
  assert.match(msg, /goal_spec/);
  assert.equal(GOAL_COACH_ROLE.toolPreset, "readonly");
  assert.equal(GOAL_COACH_ROLE.roleId, "goal_coach");
});

test("import-from-chat extracts goal_spec from assistant messages", () => {
  const messages = [
    { role: "user", content: "I want a todo app" },
    {
      role: "assistant",
      content: [{ type: "text", text: "Let us clarify the primary path." }],
      model: "x",
      provider: "y",
    },
    {
      role: "assistant",
      content: [{
        type: "text",
        text: [
          "Ready.",
          "```goal_spec",
          "## Outcome",
          "Ship a local todo app",
          "",
          "## Primary Path",
          "Open index.html via file://",
          "",
          "## Acceptance Checks",
          "1. Add works",
          "2. Refresh keeps todos",
          "3. Toggle complete works",
          "```",
        ].join("\n"),
      }],
      model: "x",
      provider: "y",
    },
  ];
  const imported = extractGoalSpecFromMessages(messages);
  assert.equal(imported.source, "goal_spec_fence");
  assert.ok(imported.draft);
  assert.equal(imported.draft.outcome, "Ship a local todo app");
  assert.equal(imported.draft.acceptanceChecks.length, 3);
  assert.match(messagesToTranscript(messages), /todo app/i);
});

test("skills injection formats and merges into facilitator prompt", () => {
  const block = formatSkillsForFacilitator([
    {
      name: "grill-me",
      description: "Interview hard",
      filePath: "/x/SKILL.md",
      body: "Ask relentless questions.",
    },
  ]);
  assert.match(block, /Attached Skills/);
  assert.match(block, /Skill: grill-me/);
  assert.match(block, /Ask relentless questions/);

  const merged = mergeSystemPromptWithSkills("You are the Goal Coach.", block);
  assert.match(merged, /You are the Goal Coach/);
  assert.match(merged, /team-alignment-skills/);
  assert.match(merged, /grill-me/);

  const kick = buildGoalCoachKickoffMessage("todo app", { skillNames: ["grill-me", "team-goal"] });
  assert.match(kick, /grill-me/);
  assert.match(kick, /todo app/);
});

test("alignment room create stores participants and serial seat order", () => {
  const agentDir = tempAgentDir();
  const cwd = tempCwd();
  try {
    const room = createAlignmentRoom({
      cwd,
      idea: "Ship a todo app",
      facilitator: { provider: "p1", modelId: "m1", skillNames: ["grill-me"] },
      architect: { provider: "p2", modelId: "m2" },
      agentDir,
    });
    assert.equal(room.status, "active");
    assert.equal(room.participants.length, 2);
    assert.equal(room.participants[0].seatId, "facilitator");
    assert.equal(room.participants[1].provider, "p2");
    assert.equal(pickNextParticipant(room)?.seatId, "facilitator");

    const withHuman = appendAlignmentMessage(
      room,
      { from: "human", text: "Prefer file:// primary path", kind: "user" },
      agentDir,
    );
    assert.equal(withHuman.transcript.length, 1);
    assert.match(formatTranscriptForPrompt(withHuman), /file:\/\//);

    const nextIdx = advanceSeatIndex(withHuman);
    assert.equal(nextIdx, 1);
    const loaded = readAlignment(room.id, agentDir);
    assert.ok(loaded);
    assert.equal(loaded.idea, "Ship a todo app");

    const withProduct = defaultAlignmentParticipants({ includeProductCritic: true });
    assert.equal(withProduct.length, 3);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("parseChoicePrompt extracts lettered and numbered options", () => {
  const lettered = parseChoicePrompt(`What does Apple-style mean?

A) Visual only (SF-like UI, blur, spacing)
B) Visual + interaction (swipe, haptics-ish)
C) Full redesign including data model
`);
  assert.ok(lettered);
  assert.equal(lettered.choices.length, 3);
  assert.match(lettered.choices[0].value, /Visual only/);

  const numbered = parseChoicePrompt(`Pick primary path:
1. Open index.html via file://
2. Use npx serve .
3. Only npm run dev
`);
  assert.ok(numbered);
  assert.equal(numbered.choices.length, 3);

  assert.equal(parseChoicePrompt("Just a paragraph without options."), null);
});

test("parseChoicePrompt ignores procedural numbered steps", () => {
  const procedural = parseChoicePrompt(`
问题 6 — 把主路径钉死成一条命令

我的建议：用 Vite + 纯前端（Vanilla 或 React 二选一），固定流程为：

1. 在项目根目录执行 npm install
2. 执行 npm run dev
3. 浏览器打开终端给出的本地 URL（通常是 http://localhost:5173）

技术栈你更倾向 Vanilla（无框架）还是 React？
`);
  // Must NOT turn install/run/open steps into choices
  assert.equal(procedural, null);

  const chineseLettered = parseChoicePrompt(`
技术栈你更倾向哪一个？

A) Vanilla + Vite（无框架）
B) React + Vite
C) 先保持现状 index.html
`);
  assert.ok(chineseLettered);
  assert.equal(chineseLettered.choices.length, 3);
  assert.match(chineseLettered.choices[0].value, /Vanilla/);
});
