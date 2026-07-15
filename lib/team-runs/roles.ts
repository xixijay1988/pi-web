import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { DEFAULT_ROLE_TEMPLATES } from "./defaults";
import { globalRolesPath, projectRolesPath } from "./paths";
import type { RoleTemplate } from "./types";

type RoleFile = { roles: RoleTemplate[] };

function readRoleFile(path: string): RoleTemplate[] {
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as RoleFile | RoleTemplate[];
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.roles)) return raw.roles;
  } catch {
    // ignore corrupt
  }
  return [];
}

export function loadGlobalRoles(agentDir?: string): RoleTemplate[] {
  const path = globalRolesPath(agentDir);
  const fromDisk = readRoleFile(path);
  if (fromDisk.length === 0) return DEFAULT_ROLE_TEMPLATES.map((r) => ({ ...r }));
  return mergeByRoleId(DEFAULT_ROLE_TEMPLATES, fromDisk);
}

export function saveGlobalRoles(roles: RoleTemplate[], agentDir?: string): void {
  const path = globalRolesPath(agentDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ roles }, null, 2), "utf8");
}

export function loadProjectRoles(cwd: string): RoleTemplate[] {
  return readRoleFile(projectRolesPath(cwd));
}

export function saveProjectRoles(cwd: string, roles: RoleTemplate[]): void {
  const path = projectRolesPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ roles }, null, 2), "utf8");
}

/** Project overrides win on same roleId; defaults fill gaps. */
export function resolveRolesForCwd(cwd: string, agentDir?: string): RoleTemplate[] {
  const global = loadGlobalRoles(agentDir);
  const project = loadProjectRoles(cwd);
  return mergeByRoleId(global, project);
}

export function mergeByRoleId(base: RoleTemplate[], overrides: RoleTemplate[]): RoleTemplate[] {
  const map = new Map<string, RoleTemplate>();
  for (const r of base) map.set(r.roleId, { ...r });
  for (const r of overrides) map.set(r.roleId, { ...map.get(r.roleId), ...r, roleId: r.roleId });
  return [...map.values()];
}

export function snapshotRoles(roles: RoleTemplate[]): RoleTemplate[] {
  return roles.map((r) => ({ ...r, toolNames: r.toolNames ? [...r.toolNames] : undefined }));
}
