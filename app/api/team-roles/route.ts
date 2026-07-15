import { NextResponse } from "next/server";
import {
  DEFAULT_ROLE_TEMPLATES,
  loadGlobalRoles,
  saveGlobalRoles,
  type RoleTemplate,
} from "@/lib/team-runs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const roles = loadGlobalRoles();
    return NextResponse.json({ roles, defaults: DEFAULT_ROLE_TEMPLATES });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { roles?: unknown };
    if (!Array.isArray(body.roles)) {
      return NextResponse.json({ error: "roles array required" }, { status: 400 });
    }
    const roles = body.roles.map(normalizeRole).filter(Boolean) as RoleTemplate[];
    if (roles.length === 0) {
      return NextResponse.json({ error: "at least one role required" }, { status: 400 });
    }
    saveGlobalRoles(roles);
    return NextResponse.json({ roles: loadGlobalRoles() });
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
