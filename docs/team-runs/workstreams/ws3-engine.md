# WS3 — TeamRun Engine (serial golden path)

## Goal

Unattended serial execution: plan → architect → implement → test → review →
awaiting human acceptance, with budgets, retries, replan, server-side wait,
versioned artifacts.

## What to build

- `TeamRunEngine` registered on `globalThis`, rehydrate from disk
- Orchestrator planning + plan.md parse
- Batch sticky session create after plan
- Serial dispatch with self-contained briefs
- Server wait + dispatchId generation isolation
- Hard validation, retry, replan, blocked
- SSE `/api/team-runs/[id]/events`
- Ensure integration with WS2 command surface (`pause` soft, `cancel` hard)

## Acceptance criteria

- [ ] Golden path exit criteria from blueprint Phase 3
- [ ] Failure path: missing artifact → retry → replan or blocked with event trail
- [ ] Process restart: no double dispatch without new dispatchId; reattach or fail-clean
- [ ] Budgets enforced
- [ ] Orchestrator cannot be required to edit business code for success
- [ ] Events appended for timeline consumers

## Owned paths

- `lib/team-runs/engine/**`
- session ensure helpers (minimal hooks in `lib/rpc-manager.ts` only if required)
- engine-related API wiring in `app/api/team-runs/**`

## Do not

- Parallel node execution
- Peer role chat bus
- Polish DAG graphics (WS4)

## Blocked by

- WS0 spike findings (system prompt strategy, wait helper)
- WS0 store
- WS1 role snapshots source
- WS2 create/start entry preferred

## References

- ADR 0002, 0005, 0006
- blueprint §§5–7, Phase 3


## Implementation status

**Landed (initial engine):** `lib/team-runs/engine/**`, start on Team Run create, serial dispatch, artifact hard validation, retry/replan/blocked, session ensure + server wait helper. Golden-path still depends on models/tools writing `.team` artifacts successfully.
