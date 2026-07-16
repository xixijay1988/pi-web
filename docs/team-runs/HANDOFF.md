# Handoff: pi-web Team Runs (quality-first continuation)

**Date:** 2026-07-16
**Repo:** `/Users/dawn/code/agent/pi-web`  
**Branch:** `dev` (track `origin/dev`; tip at handoff finalize: run `git rev-parse --short HEAD`)  
**Remote:** `git@github.com:xixijay1988/pi-web.git`  
**Next session focus:** **Q3 timeline validation errors**. Q1 structured rework and Q2 false-green fixtures are shipped.

---

## Suggested skills

- `handoff` — if you need to re-emit a fresh handoff at end of session  
- Prefer reading repo docs over inventing process: `docs/team-runs/README.md`  
- If debugging engine/false-green: systematic-debugging / diagnosing-bugs patterns  
- Do **not** re-open locked ADRs unless a spike forces a contract change (update ADR+contracts same change)

---

## Product intent (one paragraph)

Build multi-role multi-model **Team Runs** on pi-web: human produces a strong **Goal Spec**, optional Alignment discussion (Skills + models), then serial engine runs architect → implement → test → review → human accept/rework. Chat stays first-class. Goal is fewer false-green runs and less rework.

---

## Locked decisions (do not re-debate)

See ADRs `docs/adr/0001`–`0007` and `docs/team-runs/contracts.md`.

Highlights:

- Orchestrator plans; **server TeamRunEngine** owns lifecycle (not LLM tool-loop)  
- Serial execution v1; DAG deps kept for later parallel  
- Runtime truth: `$PI_CODING_AGENT_DIR/team-runs/<id>.json`  
- Artifacts: `<cwd>/.team/**`  
- Human gates: start (+ Goal Spec) + final accept; **rework** (not bare reject) for improve loop  
- Alignment Room is **pre-execution only** (ADR 0007); peer channels among executing workers deferred  

---

## What already shipped (code)

### Team Run engine v1
- `lib/team-runs/**` + `lib/team-runs/engine/*`  
- APIs: `/api/team-runs`, `/api/team-runs/[id]` (pause/resume/cancel/accept/reject/**rework**/note), SSE  
- UI: Chat|Team, TeamMode, Timeline, AcceptancePanel, RolesConfig  

### Goal Spec + anti false-green
- Strong create: Outcome + Primary Path + ≥3 checks  
- `.team/goal-spec.md` + `TeamRun.goalSpec`  
- Hard validators (contract / change-summary / test-report / acceptance)  
- Dedicated `primary: pass` required; reviewer must state independent verification
- Todo false-green fixtures cover HTTP-only evidence and reviewer hearsay
- Brief injects Goal Spec + structured **human rework notes**
- Acceptance UI Goal Spec checklist; failed checks feed rework  

### Alignment / Chat import
- Full-screen **TeamAlignmentWorkspace** (discussion UX)  
- Goal Coach + skill injection + model pick  
- Multi-seat Alignment Room APIs `/api/team-alignments`  
- Chat **Publish to Team**  
- Skill pack `skills/team-goal`  
- Choice parser prefers `A) B)`; rejects procedural `1. npm install` steps  

### Recent commits (newest first)
- `ba5f9eb` Harden Team quality gates for Primary Path and rework  
- `75bdc28` Fix choice parser mistaking procedure steps for options  
- `af43b27` Expand Team alignment into full-screen discussion with choice UI  
- `4e5f91c` Multi-seat serial Alignment Room  
- `edd911b` Alignment Room design + P0 skill-aware Goal Coach  
- `3af094f` Chat Publish to Team  
- `cbcaf19` / `11fbc47` / `5fce120` Goal Coach, Goal Spec, Team Runs v1  

---

## Durable docs in repo (prefer these over this temp file)

| Path | Role |
| --- | --- |
| `docs/team-runs/README.md` | Agent entrypoint |
| `docs/team-runs/HANDOFF.md` | Durable handoff (mirror of this) |
| `docs/team-runs/phases/phase-status.md` | What each phase delivered |
| `docs/team-runs/phases/next-plan.md` | Ordered backlog for next agents |
| `docs/team-runs/alignment-room.md` | Alignment design |
| `docs/team-runs/contracts.md` | Interfaces |
| `docs/team-runs/CONTEXT.md` | Glossary |
| `docs/adr/0001`–`0007` | Hard decisions |
| `docs/team-runs/workstreams/*` | Ownership slices |

---

## Known traps

- Never `next build` during active `npm run dev`  
- Role snapshots freeze at run create  
- Workers writing `.team` need write tools (`team_writer`/`default`/`full`)  
- Engine in-process (fine for `next dev`)  
- File preview needs `/api/files/...?type=read`  
- `reject` blocks; improvement uses **`rework` + text**  
- Sessions idle-destroy ~10m; store sessionId+sessionFile  
- Surgical diffs; use CONTEXT terms  

---

## Verification commands

```bash
node --test lib/team-runs/team-runs.test.mjs
node_modules/.bin/tsc --noEmit
# eslint on touched paths
```

Dev: `npm run dev` port **30141**.

---

## Recommended next work (quality-first)

See `docs/team-runs/phases/next-plan.md`. Top queue:

1. Timeline surfaces hard validation errors clearly
2. Acceptance checklist persistence across refresh
3. Only then Alignment P2 (streaming, multi-seat full-screen, history)

---

## User preferences observed

- Wants multi-model work organization; Chat Skills (grill-me) then Team execute  
- Goal entry must be thick (Primary Path) after real Todo false-green  
- Quality prioritized over Alignment polish for current push  
- Docs + handoff before multi-agent parallel work  
- Push to `origin/dev` when asked  

---

## Do not do next unless asked

- Peer channels / Raft-like worker chat  
- True parallel writers  
- Auto PR/merge  
- Re-litigating serial engine vs orchestrator tool-loop  
