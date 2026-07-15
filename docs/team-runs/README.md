# Team Runs — Agent Entrypoint

**Read this first** before implementing any Team Run work.

This folder is the multi-agent handoff pack for the multi-role / multi-model
work organization feature. It exists so a fresh agent can onboard without
reading the full design conversation.

## Start here (15 minutes)

1. **Product + design blueprint:** [`../team-runs.md`](../team-runs.md)  
   Locked decisions, architecture, engine loop, phases, defaults.
2. **Domain language:** [`CONTEXT.md`](./CONTEXT.md)  
   Canonical terms. Prefer these names in code, APIs, UI, and issues.
3. **ADRs (why we chose this):** [`../adr/`](../adr/)  
   Hard-to-reverse decisions only.
4. **Contracts (stable interfaces):** [`contracts.md`](./contracts.md)  
   Types, paths, API shapes, validation rules implementers must not invent.
5. **Parallel workstreams:** [`workstreams/README.md`](./workstreams/README.md)  
   Independently grabbable slices with ownership boundaries.

## What we are building (one paragraph)

A **Team Run** is a task package: user goal → orchestrator plans a role DAG →
server engine serially dispatches sticky per-role pi sessions (each with its
own model/tools) → roles write versioned Markdown artifacts under `.team/` →
reviewer pass → human final accept. Existing single-session Chat stays intact;
Team is a parallel mode.

## Goal Spec (anti false-green)

Team create requires a **strong Goal Spec** by default:

- Outcome
- Primary Path (human open/use path — not only a developer server)
- ≥3 acceptance checks

This is written to `.team/goal-spec.md`, injected into Dispatch Briefs, and enforced by hard validators on contract / test-report / acceptance artifacts (`primary_path_verified: true` on pass).

UI: **Align then start** (embedded **Goal Coach**) | **Quick form** → **Confirm Goal Spec & start**.

**Chat → Team:** use skills like `grill-me` / `team-goal` in Chat, then **Publish to Team** (extracts `goal_spec` fence, confirms form, starts Team Run).

## Non-negotiables (do not "simplify away")

- Runtime truth lives in `$PI_CODING_AGENT_DIR/team-runs/`, not in pi jsonl headers.
- Engine completion is **server-side** (never browser-SSE-only).
- Sessions may idle-destroy; always store `sessionId` + `sessionFile` and reattach.
- Budgets: `maxAttemptsPerNode`, `maxReplans`, `maxRunDurationMs`.
- Dispatch briefs are self-contained; sticky memory is not the contract.
- Artifacts are versioned (`v1`, `v2`, …). Hard validation gates progress.
- Stable `roleId` + display `name`.
- Phase 3 must ship an event timeline, not defer observability.

## Suggested implementation order

| Order | Workstream | Can parallelize with |
| --- | --- | --- |
| 1 | [WS0 Domain + spike](./workstreams/ws0-domain-and-spike.md) | alone first |
| 2a | [WS1 Role config](./workstreams/ws1-role-config.md) | after WS0 types/store exist |
| 2b | [WS2 Team shell UI/API](./workstreams/ws2-team-shell.md) | after WS0 types/store; parallel to WS1 |
| 3 | [WS3 Engine](./workstreams/ws3-engine.md) | after WS0 spike + store; needs role snapshots |
| 4 | [WS4 Timeline + acceptance UX](./workstreams/ws4-timeline-acceptance.md) | after engine events exist |
| 5 | [WS5 Hardening](./workstreams/ws5-hardening.md) | after golden path |

**Rule for multi-agent:** one workstream per agent when possible. Do not edit
another workstream's owned paths without coordination notes in the PR/commit.

## Repo constraints (from AGENTS.md)

- Dev: `npm run dev` on port 30141
- Typecheck: `node_modules/.bin/tsc --noEmit`
- Lint: `npm run lint`
- **Never** `next build` during active dev
- Surgical diffs; no drive-by refactors of chat stack
- Prefer absolute clarity over clever abstraction

## Reference products (inspiration only)

| Product | Borrow | Do not copy into v1 |
| --- | --- | --- |
| Raft (ex-slock) | Named roles, handoffs, gates | Full channel/DM social product |
| OpenSquilla | Cost awareness later | Step-level model router |

## Definition of done for v1

See golden path + failure path exit criteria in [`../team-runs.md`](../team-runs.md) §10 Phase 3.

## When docs and code disagree

1. **ADRs + contracts.md** win for interfaces and irreversible choices.  
2. **team-runs.md** wins for product behavior not yet in contracts.  
3. If you must change a locked decision, update the ADR/contract **in the same change** and note it in the workstream brief.
