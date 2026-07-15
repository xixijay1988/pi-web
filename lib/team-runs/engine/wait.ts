import type { AgentSessionWrapper } from "../../rpc-manager";

export type WaitIdleResult = "idle" | "stale" | "timeout" | "destroyed";

/**
 * Server-side wait for a role session to finish the current prompt generation.
 * Mirrors client reconciliation: subscribe + poll get_state; honor dispatch generation.
 */
export async function waitForSessionIdle(
  session: AgentSessionWrapper,
  opts: {
    isCurrent: () => boolean;
    timeoutMs?: number;
    pollMs?: number;
  },
): Promise<WaitIdleResult> {
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const pollMs = opts.pollMs ?? 400;
  const started = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let unsub: (() => void) | null = null;

    const finish = (result: WaitIdleResult) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      unsub?.();
      resolve(result);
    };

    const check = async () => {
      if (!opts.isCurrent()) {
        finish("stale");
        return;
      }
      if (!session.isAlive()) {
        finish("destroyed");
        return;
      }
      if (Date.now() - started > timeoutMs) {
        finish("timeout");
        return;
      }
      try {
        const state = await session.send({ type: "get_state" }) as {
          isStreaming?: boolean;
          isPromptRunning?: boolean;
          isCompacting?: boolean;
        };
        if (!state.isStreaming && !state.isPromptRunning && !state.isCompacting) {
          finish("idle");
        }
      } catch {
        if (!session.isAlive()) finish("destroyed");
      }
    };

    unsub = session.onEvent((event) => {
      if (!opts.isCurrent()) {
        finish("stale");
        return;
      }
      if (
        event.type === "prompt_done"
        || event.type === "agent_end"
        || event.type === "prompt_error"
      ) {
        void check();
      }
    });

    pollTimer = setInterval(() => {
      void check();
    }, pollMs);

    // If already idle (no prompt started yet / finished), resolve soon.
    void check();
  });
}
