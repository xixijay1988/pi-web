import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import {
  appendRunEvent,
  createTeamRun,
  listTeamRuns,
  resolveRolesForCwd,
  snapshotRoles,
  startTeamRunEngine,
  writeTeamRun,
  type RoleTemplate,
} from "@/lib/team-runs";
import { allowFileRoot } from "@/lib/allowed-roots";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ runs: listTeamRuns() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      cwd?: unknown;
      goal?: unknown;
      roleOverrides?: unknown;
      start?: unknown;
    };
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!goal) return NextResponse.json({ error: "goal required" }, { status: 400 });

    try {
      const st = await stat(cwd);
      if (!st.isDirectory()) {
        return NextResponse.json({ error: `Not a directory: ${cwd}` }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }

    allowFileRoot(cwd);

    let roles = resolveRolesForCwd(cwd);
    if (Array.isArray(body.roleOverrides)) {
      const overrides = body.roleOverrides
        .map((raw) => {
          if (!raw || typeof raw !== "object") return null;
          const r = raw as Record<string, unknown>;
          const roleId = typeof r.roleId === "string" ? r.roleId : "";
          if (!roleId) return null;
          return {
            roleId,
            provider: typeof r.provider === "string" ? r.provider : undefined,
            modelId: typeof r.modelId === "string" ? r.modelId : undefined,
            name: typeof r.name === "string" ? r.name : undefined,
          };
        })
        .filter(Boolean) as Array<{ roleId: string; provider?: string; modelId?: string; name?: string }>;

      roles = roles.map((role) => {
        const o = overrides.find((x) => x.roleId === role.roleId);
        if (!o) return role;
        return {
          ...role,
          ...(o.provider !== undefined ? { provider: o.provider } : {}),
          ...(o.modelId !== undefined ? { modelId: o.modelId } : {}),
          ...(o.name !== undefined ? { name: o.name } : {}),
        } satisfies RoleTemplate;
      });
    }

    let run = createTeamRun({
      cwd,
      goal,
      roleSnapshots: snapshotRoles(roles),
    });

    const shouldStart = body.start !== false;
    if (shouldStart) {
      // Mark planning optimistically; engine owns subsequent transitions.
      run = { ...run, status: "planning" };
      writeTeamRun(run);
      run = appendRunEvent(run, { type: "planning_started", message: "Engine started" });
      startTeamRunEngine(run.id);
    }

    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
