import { allowFileRoot } from "../../allowed-roots";
import { getRpcSession, startRpcSession, type AgentSessionWrapper } from "../../rpc-manager";
import { resolveSessionPath } from "../../session-reader";
import { resolveToolNames } from "../team-tool-presets";
import type { RoleTemplate } from "../types";

export async function ensureRoleSession(input: {
  cwd: string;
  role: RoleTemplate;
  sessionId?: string;
  sessionFile?: string;
}): Promise<{ session: AgentSessionWrapper; sessionId: string; sessionFile: string }> {
  allowFileRoot(input.cwd);

  const sessionId = input.sessionId;
  let sessionFile = input.sessionFile;

  if (sessionId) {
    const existing = getRpcSession(sessionId);
    if (existing?.isAlive()) {
      await applyRoleRuntime(existing, input.role);
      const state = await existing.send({ type: "get_state" }) as { sessionFile?: string };
      return {
        session: existing,
        sessionId,
        sessionFile: state.sessionFile || sessionFile || "",
      };
    }
    if (!sessionFile) {
      sessionFile = (await resolveSessionPath(sessionId)) ?? undefined;
    }
  }

  if (sessionId && sessionFile) {
    const toolNames = resolveToolNames(input.role.toolPreset, input.role.toolNames);
    const { session, realSessionId } = await startRpcSession(sessionId, sessionFile, input.cwd, toolNames);
    await applyRoleRuntime(session, input.role);
    const state = await session.send({ type: "get_state" }) as { sessionFile?: string };
    return {
      session,
      sessionId: realSessionId,
      sessionFile: state.sessionFile || sessionFile,
    };
  }

  // New session
  const toolNames = resolveToolNames(input.role.toolPreset, input.role.toolNames);
  const tempKey = `__team__${input.role.roleId}__${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const { session, realSessionId } = await startRpcSession(tempKey, "", input.cwd, toolNames);
  await applyRoleRuntime(session, input.role);
  const state = await session.send({ type: "get_state" }) as { sessionFile?: string };
  return {
    session,
    sessionId: realSessionId,
    sessionFile: state.sessionFile || "",
  };
}

async function applyRoleRuntime(session: AgentSessionWrapper, role: RoleTemplate): Promise<void> {
  const toolNames = resolveToolNames(role.toolPreset, role.toolNames);
  await session.send({ type: "set_tools", toolNames });

  if (role.provider && role.modelId) {
    try {
      await session.send({ type: "set_model", provider: role.provider, modelId: role.modelId });
    } catch (err) {
      // Model may be unavailable; continue with session default but surface later via events.
      console.warn(
        `[team-run] set_model failed for ${role.roleId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Best-effort system prompt injection (no dedicated RPC command in pi-web).
  try {
    const inner = (session as unknown as { inner?: { agent?: { state?: { systemPrompt?: string } } } }).inner;
    if (inner?.agent?.state && role.systemPrompt.trim()) {
      const base = inner.agent.state.systemPrompt ?? "";
      const marker = "\n\n<!-- team-run-role -->\n";
      const roleBlock = `${marker}${role.systemPrompt.trim()}\n`;
      if (!base.includes("<!-- team-run-role -->")) {
        inner.agent.state.systemPrompt = `${base}${roleBlock}`;
      }
    }
  } catch {
    // fall back to dispatch brief only
  }
}
