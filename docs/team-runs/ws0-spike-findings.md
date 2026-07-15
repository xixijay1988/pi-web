# WS0 Spike Findings

Status: **partial (unit + static integration). Full live dual-session LLM spike deferred to first WS3 engine PR environment with keys.**

## What WS0 verified in-repo

- Atomic TeamRun JSON create/read/list under a temp agent dir
- `.team/goal.md` written on create
- Hard validation for `acceptance.md` (`status: pass|fail`)
- plan.md minimal parser
- Budgets: attempts / replans / duration
- Serial next-node selection with deps
- Role merge: project overrides global by `roleId`
- Self-contained dispatch brief builder
- Team tool preset → pi tool name lists

Run:

```bash
node --test lib/team-runs/team-runs.test.mjs
```

## System prompt strategy (for WS3)

From current pi-web code (`lib/rpc-manager.ts` / `lib/pi-types.ts`):

- `AgentSession` exposes `agent.state.systemPrompt` (readable; writable in-process as used when forcing empty prompt for tools-off).
- There is **no dedicated first-class RPC command** in pi-web today like `set_system_prompt`.
- Practical approach for Team Runs:

  1. **Preferred:** after `startRpcSession`, set `session.inner.agent.state.systemPrompt` via a small rpc-manager helper (e.g. `setRoleSystemPrompt`) if we add a surgical API; **or**
  2. **Fallback (always available):** keep default system prompt, prepend an immutable **role preamble + dispatch brief** as the user message every dispatch (`buildDispatchBrief`).

WS0 implements (2) in `lib/team-runs/brief.ts`. Sticky sessions still get the full brief each attempt so memory cannot replace the contract.

## Server-side wait pattern (for WS3)

Do **not** wait in the browser.

Recommended shape (mirror `useAgentSession` reconciliation):

```ts
// pseudocode
const dispatchId = randomUUID();
node.activeDispatchId = dispatchId;
await session.send({ type: "prompt", message: brief });
await waitUntilIdle(session, {
  isCurrent: () => node.activeDispatchId === dispatchId,
  pollMs: 500,
});
```

`waitUntilIdle` should:

1. Subscribe to wrapper events (`agent_end` / settled)
2. Poll `get_state` for `isStreaming` / `isPromptRunning`
3. Ignore late ends when `dispatchId` mismatched
4. Tolerate wrapper destroy: reload via `startRpcSession(sessionId, sessionFile, cwd)` using stored paths

Idle destroy (10 minutes) is expected; PlanNode must store `sessionId` + `sessionFile`.

## Live dual-session spike (manual checklist when keys available)

1. `startRpcSession` twice on same cwd with different temp keys → real ids  
2. `set_model` different provider/model on each  
3. `set_tools` readonly vs full  
4. Prompt A write `.team/steps/01-architect/v1/contract.md`  
5. Wait idle server-side  
6. Prompt B read contract path from brief, write change-summary  
7. `validateArtifacts` both paths  

If any step fails, capture error in this file and adjust contracts.

## Contract tweaks from WS0

None required. Types match `docs/team-runs/contracts.md`.

## Handoff to WS1 / WS2 / WS3

| Stream | Can start? | Notes |
| --- | --- | --- |
| WS1 Role config | Yes | Use `lib/team-runs/roles.ts` |
| WS2 Team shell | Yes | Use `store.ts` create/list/read |
| WS3 Engine | After wiring wait helper | Use transitions/budget/validate/brief; add rpc ensureSessionLoaded |
