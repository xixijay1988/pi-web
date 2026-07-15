import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import {
  loadProjectRoles,
  resolveRolesForCwd,
  saveProjectRoles,
  type RoleTemplate,
} from "@/lib/team-runs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
  try {
    await stat(cwd);
  } catch {
    return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
  }
  try {
    return NextResponse.json({
      overrides: loadProjectRoles(cwd),
      resolved: resolveRolesForCwd(cwd),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown; roles?: unknown };
    const cwd = typeof body.cwd === "string" ? body.cwd : "";
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!Array.isArray(body.roles)) {
      return NextResponse.json({ error: "roles array required" }, { status: 400 });
    }
    try {
      await stat(cwd);
    } catch {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }
    const roles = body.roles.map(normalizeRole).filter(Boolean) as RoleTemplate[];
    saveProjectRoles(cwd, roles);
    return NextResponse.json({
      overrides: loadProjectRoles(cwd),
      resolved: resolveRolesForCwd(cwd),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function normalizeRole(raw: unknown): RoleTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const roleId = typeof r.roleId === "string" ? r.roleId.trim() : "";
  if (!roleId) return null;
  return {
    roleId,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : roleId,
    description: typeof r.description === "string" ? r.description : "",
    systemPrompt: typeof r.systemPrompt === "string" ? r.systemPrompt : "",
    provider: typeof r.provider === "string" ? r.provider : "",
    modelId: typeof r.modelId === "string" ? r.modelId : "",
    toolPreset: isPreset(r.toolPreset) ? r.toolPreset : "default",
    toolNames: Array.isArray(r.toolNames)
      ? r.toolNames.filter((t): t is string => typeof t === "string")
      : undefined,
  };
}

function isPreset(v: unknown): v is RoleTemplate["toolPreset"] {
  return v === "none" || v === "default" || v === "full" || v === "readonly" || v === "team_writer";
}
