# WS0 — Domain skeleton + runtime spike

## Goal

Establish shared types, persistence helpers, pure transition/validation logic,
and prove pi session multi-role primitives work **without** full UI.

## What to build

- `lib/team-runs/` module: types, store, paths, budgets, validators, plan parse stub, transition helpers
- Disk layout for team-runs JSON + `.team/` helpers
- Unit tests for budgets/validation/transitions
- A **spike** (test or script) that: creates two sessions in one cwd, sets different models/tools if available, prompts once each, **server-waits** for idle, writes/reads a `.team` artifact

## Acceptance criteria

- [ ] Canonical types match [`../contracts.md`](../contracts.md) §2
- [ ] Can create/load/update a TeamRun JSON atomically under agent dir
- [ ] Hard validator accepts a fixture acceptance.md with `status: pass` and rejects missing file
- [ ] Budget helper blocks when attempts/replans/duration exceeded
- [ ] Spike documents how to set role instructions (system prompt API vs preamble fallback)
- [ ] Spike proves wait/end does not rely on browser SSE
- [ ] Short note added under `docs/team-runs/` or spike comment: findings for WS3

## Owned paths

- `lib/team-runs/**`
- `docs/team-runs/contracts.md` (only if spike forces contract tweak)
- tests colocated or `lib/team-runs/*.test.*`

## Do not

- Build Team UI
- Implement full engine loop
- Refactor ChatWindow / session sidebar

## Blocked by

None — start immediately.

## References

- [`../../team-runs.md`](../../team-runs.md) §§3–7, 10 Phase 0
- ADR 0001, 0003, 0006


## Implementation status

**Landed in-tree (2026-07-15):** `lib/team-runs/**` + `team-runs.test.mjs` (11 pass).  
Live dual-session LLM spike deferred; see `docs/team-runs/ws0-spike-findings.md`.
