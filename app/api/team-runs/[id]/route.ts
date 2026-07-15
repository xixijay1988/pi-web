import { NextResponse } from "next/server";
import {
  appendRunEvent,
  canTransitionRun,
  readTeamRun,
  writeTeamRun,
  type RunEventType,
  type RunStatus,
  type TeamRun,
  resumeTeamRunEngine,
  TeamRunEngine,
} from "@/lib/team-runs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const run = readTeamRun(id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ run });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const existing = readTeamRun(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const body = await req.json() as { type?: unknown; text?: unknown; resetFrom?: unknown };
    const type = typeof body.type === "string" ? body.type : "";

    let run = existing;

    switch (type) {
      case "note": {
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
        const at = new Date().toISOString();
        run = {
          ...run,
          humanNotes: [...run.humanNotes, { at, text }],
        };
        writeTeamRun(run);
        run = appendRunEvent(run, { type: "human_note_added", message: text.slice(0, 200) });
        break;
      }
      case "pause":
        run = applyStatus(run, "paused", "paused");
        TeamRunEngine.get(id).stopLocal();
        break;
      case "resume": {
        const resumeTo: RunStatus =
          run.plan.version > 0 || run.plan.nodes.some((n) => n.status !== "pending")
            ? "executing"
            : "planning";
        // From created, resume -> planning is more accurate
        const target: RunStatus = run.status === "paused"
          ? (run.events.some((e) => e.type === "plan_accepted") ? "executing" : "planning")
          : resumeTo;
        run = applyStatus(run, target, "resumed");
        resumeTeamRunEngine(id);
        break;
      }
      case "cancel":
        run = applyStatus(run, "cancelled", "cancelled");
        TeamRunEngine.get(id).stopLocal();
        break;
      case "accept":
        if (run.status !== "awaiting_human_acceptance") {
          return NextResponse.json({ error: "run is not awaiting human acceptance" }, { status: 409 });
        }
        run = applyStatus(run, "done", "accepted");
        break;
      case "reject": {
        // Backward-compat: reject without rework just blocks.
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (text) {
          run = {
            ...run,
            humanNotes: [...run.humanNotes, { at: new Date().toISOString(), text: `Reject: ${text}` }],
          };
          writeTeamRun(run);
        }
        run = applyStatus(run, "blocked", "blocked", text || "Rejected by human");
        break;
      }
      case "rework": {
        // Human final-acceptance rejection with feedback → replan/retry workers.
        if (run.status !== "awaiting_human_acceptance" && run.status !== "blocked" && run.status !== "paused") {
          return NextResponse.json(
            { error: "rework is only allowed from awaiting_human_acceptance, blocked, or paused" },
            { status: 409 },
          );
        }
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) {
          return NextResponse.json({ error: "text required: describe what to improve" }, { status: 400 });
        }
        const at = new Date().toISOString();
        const resetFrom = typeof body.resetFrom === "string" && body.resetFrom.trim() ? body.resetFrom.trim() : "implement";
        const nodes = run.plan.nodes.map((n) => {
          const shouldReset = shouldResetNode(n.id, n.roleId, resetFrom);
          if (!shouldReset) return n;
          return {
            ...n,
            status: "pending" as const,
            attempts: 0,
            activeDispatchId: undefined,
            lastError: undefined,
            // keep session binding for sticky role memory
          };
        });
        run = {
          ...run,
          humanNotes: [...run.humanNotes, { at, text: `Rework requested: ${text}` }],
          plan: { ...run.plan, nodes },
          status: "replanning",
        };
        writeTeamRun(run);
        run = appendRunEvent(run, {
          type: "replan_started",
          message: `Human rework: ${text.slice(0, 300)}`,
          data: { resetFrom },
        });
        resumeTeamRunEngine(id);
        break;
      }
      default:
        return NextResponse.json({ error: `unknown command type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ run: readTeamRun(id) ?? run });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function applyStatus(
  run: TeamRun,
  status: RunStatus,
  eventType: RunEventType,
  message?: string,
): TeamRun {
  if (run.status !== status && !canTransitionRun(run.status, status)) {
    throw new Error(`Invalid transition ${run.status} → ${status}`);
  }
  const next = { ...run, status };
  writeTeamRun(next);
  return appendRunEvent(next, { type: eventType, message });
}


function shouldResetNode(nodeId: string, roleId: string, resetFrom: string): boolean {
  // resetFrom: implement (default) | architect | test | review | all
  if (resetFrom === "all") return true;
  const order = ["architect", "implement", "test", "review"];
  // map common roleIds too
  const id = order.includes(nodeId) ? nodeId : (
    roleId === "architect" ? "architect"
      : roleId === "implementer" ? "implement"
        : roleId === "tester" ? "test"
          : roleId === "reviewer" ? "review"
            : nodeId
  );
  const start = order.indexOf(resetFrom === "implementer" ? "implement" : resetFrom);
  const idx = order.indexOf(id);
  if (start === -1) return id !== "architect"; // default rework implement+
  if (idx === -1) return true;
  return idx >= start;
}
