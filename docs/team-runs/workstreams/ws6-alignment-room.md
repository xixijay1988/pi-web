# WS6 — Alignment Room (pre-execution discussion)

## Goal

Let users discuss requirements **inside Team** with Skills and (later) multiple
models, producing a strong Goal Spec before the TeamRun Engine starts.

## Design sources

- [`../alignment-room.md`](../alignment-room.md)
- ADR [`../../adr/0007-alignment-room-before-execute.md`](../../adr/0007-alignment-room-before-execute.md)
- Glossary: Alignment Room / Seat / Turn in [`../CONTEXT.md`](../CONTEXT.md)

## Phases

### P0 — Facilitator Skills + model (ship first)

**Status:** implemented in tree (goal-coach + skills-inject + TeamGoalCoach).


- Extend `POST /api/team-runs/goal-coach` with `skillNames[]` (+ existing provider/modelId)
- Load skill bodies with `DefaultResourceLoader` (same as `/api/skills`)
- Inject into facilitator system prompt / kickoff
- `TeamGoalCoach` UI: skill chips + model fields (or compact selectors)
- Unit tests for injection helpers + goal_spec extract still works

### P1 — Multi-seat serial room

**Status:** implemented (`lib/team-runs/alignment-*`, `/api/team-alignments`, `TeamAlignmentRoom`).


- `lib/team-runs/alignment/*` store + types
- APIs under `/api/team-alignments`
- UI transcript + seats + advance/synthesize/publish
- Default seats: facilitator + architect_critic

### P2 — Polish

- Budgets, export notes, chat transcript import, product_critic preset

## Owned paths

**P0:**
- `lib/team-runs/goal-coach.ts`
- `lib/team-runs/skills-inject.ts` (or similar)
- `app/api/team-runs/goal-coach/route.ts`
- `components/TeamGoalCoach.tsx`
- docs listed above

**P1:**
- `lib/team-runs/alignment/**`
- `app/api/team-alignments/**`
- Team Align UI components

## Out of scope

- Peer channels among executing workers
- Auto-start without human Goal Spec confirm
- Changing serial execution DAG semantics

## Exit criteria

- P0: Team Align can attach grill-me/team-goal + model and produce Goal Spec
- P1: ≥2 models visible in one alignment transcript before start

## Relay

- Status snapshot: [`../phases/phase-status.md`](../phases/phase-status.md)
- Next work: [`../phases/next-plan.md`](../phases/next-plan.md) (quality queue precedes Alignment P2)
