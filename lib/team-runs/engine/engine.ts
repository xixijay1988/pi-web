import { randomUUID } from "crypto";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import {
  appendRunEvent,
  buildDispatchBrief,
  canTransitionRun,
  checkDispatchBudgets,
  checkReplanBudget,
  defaultArtifactFileName,
  markReadyNodes,
  parsePlanMarkdown,
  projectPlanPath,
  readTeamRun,
  replaceNode,
  selectNextSerialNode,
  setNodeStatus,
  beginNodeAttempt,
  stepArtifactPath,
  toPlanNodes,
  validateArtifacts,
  writeTeamRun,
  type PlanNode,
  type RoleTemplate,
  type RunStatus,
  type TeamRun,
} from "../index";
import { ensureRoleSession } from "./sessions";
import { waitForSessionIdle } from "./wait";

declare global {
  var __piTeamRunEngines: Map<string, TeamRunEngine> | undefined;
  var __piTeamRunLoops: Map<string, Promise<void>> | undefined;
}

function engines(): Map<string, TeamRunEngine> {
  if (!globalThis.__piTeamRunEngines) globalThis.__piTeamRunEngines = new Map();
  return globalThis.__piTeamRunEngines;
}

function loops(): Map<string, Promise<void>> {
  if (!globalThis.__piTeamRunLoops) globalThis.__piTeamRunLoops = new Map();
  return globalThis.__piTeamRunLoops;
}

const DEFAULT_FEATURE_PLAN = `# Plan

## Nodes
- id: architect
  roleId: architect
  title: Write implementation contract
  deps: []
- id: implement
  roleId: implementer
  title: Implement contracted change
  deps: [architect]
- id: test
  roleId: tester
  title: Test and collect evidence
  deps: [implement]
- id: review
  roleId: reviewer
  title: Accept or reject against goal
  deps: [test]
`;

export class TeamRunEngine {
  readonly runId: string;
  private stopped = false;

  constructor(runId: string) {
    this.runId = runId;
  }

  static get(runId: string): TeamRunEngine {
    const map = engines();
    let eng = map.get(runId);
    if (!eng) {
      eng = new TeamRunEngine(runId);
      map.set(runId, eng);
    }
    return eng;
  }

  /** Start or resume the engine loop if not already running. */
  kick(reason = "kick"): void {
    const map = loops();
    if (map.has(this.runId)) return;
    const loop = this.runLoop(reason).finally(() => {
      map.delete(this.runId);
    });
    map.set(this.runId, loop);
  }

  stopLocal(): void {
    this.stopped = true;
  }

  private async runLoop(reason: string): Promise<void> {
    this.stopped = false;
    let run = readTeamRun(this.runId);
    if (!run) return;

    try {
      // Bootstrap planning if needed
      if (run.status === "created" || run.status === "planning" || (run.status === "paused" && run.plan.version === 0)) {
        run = await this.planPhase(run);
      }

      // Serial worker loop
      while (!this.stopped) {
        run = readTeamRun(this.runId);
        if (!run) return;

        if (
          run.status === "paused"
          || run.status === "cancelled"
          || run.status === "done"
          || run.status === "blocked"
          || run.status === "failed"
          || run.status === "awaiting_human_acceptance"
        ) {
          return;
        }

        if (run.status === "replanning" || run.status === "planning") {
          run = await this.planPhase(run, { replan: run.status === "replanning" });
          continue;
        }

        run = {
          ...run,
          plan: { ...run.plan, nodes: markReadyNodes(run.plan.nodes) },
        };
        writeTeamRun(run);

        const next = selectNextSerialNode(run.plan.nodes);
        if (!next) {
          if (run.plan.nodes.every((n) => n.status === "succeeded" || n.status === "skipped")) {
            run = setStatus(run, "awaiting_human_acceptance", "awaiting_human", "All worker nodes succeeded");
          } else {
            // Active node elsewhere or stuck pending deps — exit loop; re-kick on events.
            return;
          }
          return;
        }

        const budget = checkDispatchBudgets(run, next);
        if (!budget.ok) {
          setStatus(run, "blocked", "blocked", budget.reason);
          return;
        }

        run = await this.dispatchNode(run, next);
      }
    } catch (err) {
      const latest = readTeamRun(this.runId);
      if (!latest) return;
      const message = err instanceof Error ? err.message : String(err);
      appendRunEvent(
        { ...latest, status: canTransitionRun(latest.status, "failed") ? "failed" : latest.status },
        { type: "failed", message: `${reason}: ${message}` },
      );
      if (canTransitionRun(latest.status, "failed")) {
        writeTeamRun({ ...latest, status: "failed" });
      }
    }
  }

  private async planPhase(run: TeamRun, opts?: { replan?: boolean }): Promise<TeamRun> {
    let current = setStatus(
      run,
      opts?.replan ? "replanning" : "planning",
      opts?.replan ? "replan_started" : "planning_started",
    );

    const orchestrator = current.roleSnapshots.find((r) => r.roleId === "orchestrator")
      ?? current.roleSnapshots[0];
    if (!orchestrator) {
      return setStatus(current, "blocked", "blocked", "No orchestrator role snapshot");
    }

    // Ensure plan path + seed default plan for deterministic v1 when orchestrator is weak/unavailable.
    const planPath = projectPlanPath(current.cwd);
    mkdirSync(dirname(planPath), { recursive: true });
    if (!existsSync(planPath) || opts?.replan) {
      // Always (re)write a deterministic default plan skeleton; orchestrator may overwrite.
      writeFileSync(planPath, DEFAULT_FEATURE_PLAN, "utf8");
    }

    // Try orchestrator session (best effort). If model missing, keep default plan.
    try {
      const orchNode = current.plan.nodes.find((n) => n.roleId === "orchestrator");
      const ensured = await ensureRoleSession({
        cwd: current.cwd,
        role: orchestrator,
        sessionId: (orchNode as PlanNode | undefined)?.sessionId,
        sessionFile: (orchNode as PlanNode | undefined)?.sessionFile,
      });

      const brief = [
        `# Orchestrator planning task`,
        ``,
        `## Goal`,
        current.goal,
        ``,
        `Write or update the Team Run plan at:`,
        planPath,
        ``,
        `Use this Markdown shape:`,
        DEFAULT_FEATURE_PLAN,
        ``,
        `You may inspect the repository. Only write under .team/. Do not edit business source files.`,
        opts?.replan ? `This is a replan. Prefer addressing the latest human rework notes / rejection feedback. Keep roleIds valid.` : ``,
        current.lastRework
          ? [
              `## Latest structured rework (MUST address)`,
              `Failed Goal Spec checks:`,
              ...(current.lastRework.failedChecks.length
                ? current.lastRework.failedChecks.map((c) => `- [FAIL] ${c}`)
                : [`- (none marked)`]),
              current.lastRework.text.trim() ? `Feedback:\n${current.lastRework.text.trim()}` : ``,
              current.lastRework.resetFrom ? `Reset from: ${current.lastRework.resetFrom}` : ``,
              `Also read \`.team/notes.md\` if present.`,
            ].filter(Boolean).join("\n")
          : ``,
        current.humanNotes.length
          ? `## Human notes\n${current.humanNotes.map((n) => `- ${n.text}`).join("\n")}`
          : ``,
      ].join("\n");

      const dispatchId = randomUUID();
      await ensured.session.send({ type: "prompt", message: brief });
      await waitForSessionIdle(ensured.session, {
        isCurrent: () => true,
        timeoutMs: Math.min(current.budget.maxRunDurationMs, 15 * 60 * 1000),
      });
      void dispatchId;
    } catch (err) {
      current = appendRunEvent(current, {
        type: "planning_failed",
        message: `Orchestrator session failed; using default plan if valid (${err instanceof Error ? err.message : String(err)})`,
      });
    }

    // Parse plan.md
    let planMarkdown = DEFAULT_FEATURE_PLAN;
    try {
      const { readFileSync } = await import("fs");
      planMarkdown = readFileSync(planPath, "utf8");
    } catch {
      writeFileSync(planPath, DEFAULT_FEATURE_PLAN, "utf8");
      planMarkdown = DEFAULT_FEATURE_PLAN;
    }

    const parsed = parsePlanMarkdown(planMarkdown);
    if (parsed.errors.length || parsed.nodes.length === 0) {
      // fallback once
      writeFileSync(planPath, DEFAULT_FEATURE_PLAN, "utf8");
      const retry = parsePlanMarkdown(DEFAULT_FEATURE_PLAN);
      if (retry.errors.length || retry.nodes.length === 0) {
        return setStatus(current, "blocked", "planning_failed", parsed.errors.join("; ") || "empty plan");
      }
      parsed.nodes = retry.nodes;
      parsed.errors = [];
    }

    const stepIndexByRole = new Map<string, number>();
    let stepCounter = 0;
    const nodes = toPlanNodes(parsed.nodes, (n) => {
      stepCounter += 1;
      stepIndexByRole.set(n.id, stepCounter);
      const attempt = 1;
      const file = defaultArtifactFileName(n.roleId);
      // path uses attempt at dispatch time; store template-ish first path
      return [stepArtifactPath(current.cwd, stepCounter, n.roleId, attempt, file)];
    });

    // Preserve session bindings for same roleId if replan
    const prevByRole = new Map<string, PlanNode>();
    for (const n of current.plan.nodes) prevByRole.set(n.roleId, n);
    for (const n of nodes) {
      const prev = prevByRole.get(n.roleId);
      if (prev?.sessionId) {
        n.sessionId = prev.sessionId;
        n.sessionFile = prev.sessionFile;
      }
    }

    // Batch-create sessions for roles in plan (+ keep orchestrator mapping out of worker nodes)
    for (const n of nodes) {
      const role = roleSnapshot(current, n.roleId);
      if (!role) continue;
      try {
        const ensured = await ensureRoleSession({
          cwd: current.cwd,
          role,
          sessionId: n.sessionId,
          sessionFile: n.sessionFile,
        });
        n.sessionId = ensured.sessionId;
        n.sessionFile = ensured.sessionFile;
      } catch (err) {
        current = appendRunEvent(current, {
          type: "planning_failed",
          message: `Failed to create session for ${n.roleId}: ${err instanceof Error ? err.message : String(err)}`,
          nodeId: n.id,
        });
      }
    }

    current = {
      ...current,
      status: "executing",
      replanCount: opts?.replan ? current.replanCount + 1 : current.replanCount,
      plan: {
        version: current.plan.version + 1,
        nodes: markReadyNodes(nodes),
        rawPlanPath: planPath,
      },
    };
    writeTeamRun(current);
    current = appendRunEvent(current, {
      type: "plan_accepted",
      message: `Plan v${current.plan.version} with ${nodes.length} nodes`,
      data: { stepIndexByRole: Object.fromEntries(stepIndexByRole) },
    });
    return current;
  }

  private async dispatchNode(run: TeamRun, node: PlanNode): Promise<TeamRun> {
    const role = roleSnapshot(run, node.roleId);
    if (!role) {
      return setStatus(run, "blocked", "blocked", `Missing role snapshot for ${node.roleId}`);
    }

    const dispatchId = randomUUID();
    let working = replaceNode(run, beginNodeAttempt(node, dispatchId));
    writeTeamRun(working);
    working = appendRunEvent(working, {
      type: "node_dispatch",
      nodeId: node.id,
      dispatchId,
      message: `Dispatch ${role.name} attempt ${working.plan.nodes.find((n) => n.id === node.id)?.attempts}`,
    });

    const liveNode = working.plan.nodes.find((n) => n.id === node.id)!;
    const attempt = liveNode.attempts;
    const stepIndex = working.plan.nodes.findIndex((n) => n.id === node.id) + 1;
    const artifactName = defaultArtifactFileName(role.roleId);
    const outputPath = stepArtifactPath(working.cwd, stepIndex, role.roleId, attempt, artifactName);
    mkdirSync(dirname(outputPath), { recursive: true });

    // Update expected artifact path for this attempt
    const nodeWithPaths: PlanNode = {
      ...liveNode,
      status: "running",
      artifactPaths: [outputPath],
    };
    working = replaceNode(working, nodeWithPaths);
    writeTeamRun(working);

    const depPaths = dependencyArtifactPaths(working, nodeWithPaths);
    const brief = buildDispatchBrief({
      run: working,
      node: nodeWithPaths,
      role,
      dependencyArtifactPaths: depPaths,
      outputPaths: [outputPath],
      hardExpectations: hardExpectationsFor(role, outputPath),
    });

    let session;
    try {
      const ensured = await ensureRoleSession({
        cwd: working.cwd,
        role,
        sessionId: nodeWithPaths.sessionId,
        sessionFile: nodeWithPaths.sessionFile,
      });
      session = ensured.session;
      // persist session binding
      working = replaceNode(working, {
        ...nodeWithPaths,
        sessionId: ensured.sessionId,
        sessionFile: ensured.sessionFile,
      });
      writeTeamRun(working);

      await session.send({ type: "prompt", message: brief });
      const waitResult = await waitForSessionIdle(session, {
        isCurrent: () => {
          const latest = readTeamRun(this.runId);
          const n = latest?.plan.nodes.find((x) => x.id === node.id);
          return n?.activeDispatchId === dispatchId;
        },
        timeoutMs: Math.min(working.budget.maxRunDurationMs, 30 * 60 * 1000),
      });

      working = appendRunEvent(working, {
        type: "node_agent_end",
        nodeId: node.id,
        dispatchId,
        message: `wait=${waitResult}`,
      });

      if (waitResult === "stale") return readTeamRun(this.runId) ?? working;
      if (waitResult === "timeout" || waitResult === "destroyed") {
        return await this.failNode(
          working,
          node.id,
          dispatchId,
          waitResult === "timeout" ? "Role session timed out" : "Role session destroyed mid-run",
        );
      }
    } catch (err) {
      return await this.failNode(
        working,
        node.id,
        dispatchId,
        err instanceof Error ? err.message : String(err),
      );
    }

    // Validate
    working = replaceNode(
      working,
      setNodeStatus(working.plan.nodes.find((n) => n.id === node.id)!, "validating"),
    );
    writeTeamRun(working);

    const latestNode = working.plan.nodes.find((n) => n.id === node.id)!;
    const validation = validateArtifacts(latestNode.artifactPaths);
    if (validation.ok) {
      working = replaceNode(working, setNodeStatus(latestNode, "succeeded"));
      writeTeamRun(working);
      working = appendRunEvent(working, {
        type: "artifact_validation_ok",
        nodeId: node.id,
        dispatchId,
        data: { contentHash: validation.contentHash, paths: latestNode.artifactPaths },
      });

      // All workers done → human final acceptance
      const nodesNow = working.plan.nodes;
      if (nodesNow.every((n) => n.status === "succeeded" || n.status === "skipped")) {
        return setStatus(working, "awaiting_human_acceptance", "awaiting_human");
      }
      return working;
    }

    working = appendRunEvent(working, {
      type: "artifact_validation_failed",
      nodeId: node.id,
      dispatchId,
      message: validation.hardErrors.join("; "),
      data: {
        hardErrors: validation.hardErrors,
        softWarnings: validation.softWarnings,
        paths: latestNode.artifactPaths,
      },
    });
    return await this.failNode(working, node.id, dispatchId, validation.hardErrors.join("; "));
  }

  private async failNode(
    run: TeamRun,
    nodeId: string,
    dispatchId: string,
    error: string,
  ): Promise<TeamRun> {
    let working = run;
    const node = working.plan.nodes.find((n) => n.id === nodeId);
    if (!node) return working;

    const failed = setNodeStatus({ ...node, activeDispatchId: dispatchId }, "failed", error);
    working = replaceNode(working, failed);
    writeTeamRun(working);

    // Retry same node?
    if (failed.attempts < working.budget.maxAttemptsPerNode) {
      // reset to pending for another select
      working = replaceNode(working, { ...failed, status: "pending", activeDispatchId: undefined });
      writeTeamRun(working);
      working = appendRunEvent(working, {
        type: "retry_scheduled",
        nodeId,
        message: `Retry scheduled (${failed.attempts}/${working.budget.maxAttemptsPerNode}): ${error}`,
      });
      return working;
    }

    // Replan?
    const replanOk = checkReplanBudget(working);
    if (replanOk.ok) {
      working = setStatus(working, "replanning", "replan_started", `Replan after ${nodeId} failed: ${error}`);
      return working;
    }

    return setStatus(working, "blocked", "blocked", `Node ${nodeId} failed and budgets exhausted: ${error}`);
  }
}

export function startTeamRunEngine(runId: string): void {
  TeamRunEngine.get(runId).kick("start");
}

export function resumeTeamRunEngine(runId: string): void {
  TeamRunEngine.get(runId).kick("resume");
}

function roleSnapshot(run: TeamRun, roleId: string): RoleTemplate | undefined {
  return run.roleSnapshots.find((r) => r.roleId === roleId);
}

function dependencyArtifactPaths(run: TeamRun, node: PlanNode): string[] {
  const paths: string[] = [];
  for (const depId of node.deps) {
    const dep = run.plan.nodes.find((n) => n.id === depId);
    if (dep?.artifactPaths?.length) paths.push(...dep.artifactPaths);
  }
  return paths;
}

function hardExpectationsFor(role: RoleTemplate, outputPath: string): string[] {
  const base = [`Write a non-empty file at ${outputPath}`];
  switch (role.roleId) {
    case "architect":
      base.push("contract.md must include ## Primary Path and ## Acceptance");
      base.push("Primary Path must match Goal Spec human open/use path");
      break;
    case "implementer":
      base.push("change-summary.md must include ## How to open/run (or ## Primary Path)");
      base.push("Implement for the Goal Spec Primary Path, not only a secondary dev server");
      break;
    case "tester":
      base.push("test-report.md must include ## Environments (or primary: ...) and status: pass|fail");
      base.push("When status is pass, explicitly mark primary path pass (e.g. primary: pass)");
      base.push("If primary path fails, overall status must be fail");
      break;
    case "reviewer":
      base.push("acceptance.md must include `status: pass|fail`");
      base.push("When status is pass, include `primary_path_verified: true` and body evidence of independent primary-path check");
      break;
    case "orchestrator":
      base.push("Only write under .team/");
      break;
    default:
      break;
  }
  return base;
}

function setStatus(
  run: TeamRun,
  status: RunStatus,
  eventType: Parameters<typeof appendRunEvent>[1]["type"],
  message?: string,
): TeamRun {
  if (run.status !== status && !canTransitionRun(run.status, status)) {
    // force write for recovery paths with event note
    const forced = { ...run, status };
    writeTeamRun(forced);
    return appendRunEvent(forced, {
      type: eventType,
      message: message ? `${message} (forced from ${run.status})` : `forced ${run.status}→${status}`,
    });
  }
  const next = { ...run, status };
  writeTeamRun(next);
  return appendRunEvent(next, { type: eventType, message });
}
