# Team Runs — Phase status (as of 2026-07-16)

Companion: [`../README.md`](../README.md) · backlog: [`next-plan.md`](./next-plan.md) · handoff: [`../HANDOFF.md`](../HANDOFF.md)

This document is the **stage report** for humans and successor agents. It records what each phase was for, what landed, and residual risk — not a full redesign.

## Scorecard

| Track | Status | Notes |
| --- | --- | --- |
| Team Run engine v1 (serial) | **Shipped** | plan → architect → implement → test → review → human |
| Goal Spec create gate | **Shipped** | strong default: Outcome + Primary Path + ≥3 checks |
| Alignment P0 (facilitator + skills + model) | **Shipped** | full-screen workspace preferred |
| Alignment P1 (multi-seat serial) | **Shipped** | APIs + sidebar advanced UI |
| Chat → Publish to Team | **Shipped** | extract `goal_spec` + confirm modal |
| Quality gates / anti false-green | **Shipped (v1)** | validators + brief rework + acceptance checklist |
| Q1 Structured rework | **Shipped** | `lastRework` + `.team/notes.md` + brief FAIL checks |
| Q2 False-green fixtures | **Shipped** | Todo HTTP-only red fixture + verified green fixture |
| Q3 Validation visibility | **Shipped** | pinned header summary + Timeline hard-error cards |
| Alignment P2 polish | **Pending** | streaming, history, multi-seat full-screen |
| Execution peer channels | **Deferred** | ADR 0007 / ADR 0002 |

**Branch tip when written:** `dev` (see git log; re-verify).

---

## Phase 0–3 (foundation) — shipped

Originally blueprint phases in [`../../team-runs.md`](../../team-runs.md): domain, role config, Team shell, engine + timeline.

### Delivered
- Domain types, store, plan parse, budgets, transitions  
- Role templates (global + project) + snapshot into run  
- TeamMode list/detail, timeline, acceptance panel  
- Server engine: serial dispatch, wait, validate, retry/replan hooks, pause/resume/cancel  
- Runtime paths: `team-runs/*.json` + `.team/steps/.../vN/*`  

### Residual risks
- Orchestrator planning still best-effort with default plan fallback  
- No multi-instance engine (in-process only)  
- Validation is markdown/heuristic, not browser automation  

---

## Phase G — Goal Spec & entry thickening — shipped

### Why
Real Todo run went false-green: tester used HTTP path; human used `file://` / open file; ES modules broke Add.

### Delivered
- `GoalSpec` type + validate/render/parse (`lib/team-runs/goal-spec.ts`)  
- Create UI: Align then start / Quick form; Confirm Goal Spec & start  
- API `requireStrongGoal` default true  
- Persist `.team/goal-spec.md` + run.goalSpec  
- Brief injects Goal Spec  

### Residual risks
- Human can still write a wrong Primary Path; gates reduce but do not eliminate  
- Live Goal-coach chat inside create form was later superseded by full-screen workspace  

---

## Phase A — Alignment Room — P0/P1 shipped, P2 pending

Design: [`../alignment-room.md`](../alignment-room.md) · ADR 0007.

### P0 delivered
- Goal Coach API with `skillNames` + model  
- Skill body injection (`skills-inject`)  
- Full-screen **discussion workspace** (replaces cramped sidebar coach)  
- Clickable choices from `A) B)` options (`choice-parse`)  
- Coach prompt: lettered choices only; numbered lists = steps  

### P1 delivered
- `team-alignments/<id>.json` store  
- APIs: create / message / advance / synthesize / publish / abandon  
- Default seats: facilitator + architect_critic (+ optional product)  
- Publish → create Team Run + start engine  

### P2 not done
- Multi-seat UI still “advanced” in sidebar (not full-screen parity)  
- No SSE/streaming turns (request blocks until model idle)  
- No alignment room history browser / resume UX polish  
- No Chat transcript import into room  

---

## Phase Q — Quality gates (anti false-green) — shipped v1

### Delivered
Hard validation:
- `contract.md`: Primary Path + Acceptance; path not TBD/too short  
- `change-summary.md`: must include how-to-open / Primary Path section (**hard**)  
- `test-report.md`: environments + status; pass requires dedicated `primary: pass` evidence
- `acceptance.md`: pass requires `primary_path_verified: true` + independent body evidence
- **Q2:** Todo regression fixtures reject HTTP-only testing and reviewer hearsay

Dispatch:
- Goal Spec acceptance checks in brief  
- Latest human **rework/reject notes** injected as MUST address  
- **Q1:** structured `lastRework` / `failedChecks` + `.team/notes.md` + brief `[FAIL]` injection
- Per-role hardExpectations expanded  

Human acceptance UI:
- Goal Spec checklist (Primary Path + checks)  
- Fail marks block Accept  
- Rework feedback auto-includes failed checks  

Observability:
- `artifact_validation_failed` stores full hard errors, warnings, and paths
- Run header pins the latest unresolved failure with failed node and artifact links
- Timeline shows full validation errors and opens the failed artifact directly

### Residual risks
- Heuristic validators can still be gamed by models writing compliant but untrue text  
- No automated browser dual-path E2E in engine  
- Fixtures verify Markdown gates, not the underlying browser behavior

---

## Phase C — Chat integration — shipped

- **Publish to Team** from Chat messages  
- `team-goal` skill for emitting `goal_spec`  
- Compatible with grill-me / grill-with-docs style discussion  

---

## Non-goals still deferred

- Peer role channels during execution  
- True parallel writers  
- OpenSquilla-style step-level model router  
- Auto PR / merge  
- Path-level write ACL matrix  

---

## How to verify current baseline

```bash
node --test lib/team-runs/team-runs.test.mjs
node_modules/.bin/tsc --noEmit
npm run dev   # :30141 — do not next build in parallel
```

Manual golden path:
1. Align (workspace or Chat skill) → strong Goal Spec  
2. Start Team Run  
3. Artifacts validate under Primary Path rules  
4. Human checklist → accept or rework with feedback  
