import { NextResponse } from "next/server";
import {
  alignmentAbandon,
  alignmentAdvance,
  alignmentExportDraft,
  alignmentHumanMessage,
  alignmentMarkConsumed,
  alignmentSynthesize,
  createTeamRun,
  readAlignment,
  resolveRolesForCwd,
  snapshotRoles,
  startTeamRunEngine,
  validateGoalSpec,
  writeTeamRun,
  appendRunEvent,
} from "@/lib/team-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const room = readAlignment(id);
    if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ alignment: room });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { type?: unknown; text?: unknown; start?: unknown };
    const type = typeof body.type === "string" ? body.type : "";
    if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

    if (type === "message") {
      const text = typeof body.text === "string" ? body.text : "";
      const room = await alignmentHumanMessage(id, text);
      return NextResponse.json({ alignment: room });
    }
    if (type === "advance") {
      const result = await alignmentAdvance(id);
      return NextResponse.json(result);
    }
    if (type === "synthesize") {
      const result = await alignmentSynthesize(id);
      return NextResponse.json(result);
    }
    if (type === "abandon") {
      const room = alignmentAbandon(id);
      return NextResponse.json({ alignment: room });
    }
    if (type === "export_draft") {
      const result = alignmentExportDraft(id);
      return NextResponse.json(result);
    }
    if (type === "publish") {
      const exported = alignmentExportDraft(id);
      if (!exported.ok || !exported.room.draftGoalSpec) {
        return NextResponse.json(
          { error: exported.errors.join("; ") || "Goal Spec not ready", errors: exported.errors },
          { status: 400 },
        );
      }
      const goalSpec = exported.room.draftGoalSpec;
      const validated = validateGoalSpec(goalSpec, { requireStrong: true });
      if (!validated.ok) {
        return NextResponse.json(
          { error: validated.errors.join("; "), errors: validated.errors },
          { status: 400 },
        );
      }
      const roles = resolveRolesForCwd(exported.room.cwd);
      let run = createTeamRun({
        cwd: exported.room.cwd,
        goal: goalSpec.outcome,
        goalSpec,
        roleSnapshots: snapshotRoles(roles),
      });
      const shouldStart = body.start !== false;
      if (shouldStart) {
        run = { ...run, status: "planning" };
        writeTeamRun(run);
        run = appendRunEvent(run, { type: "planning_started", message: "Engine started from Alignment Room" });
        startTeamRunEngine(run.id);
      }
      const room = alignmentMarkConsumed(id, run.id);
      return NextResponse.json({ alignment: room, run });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
