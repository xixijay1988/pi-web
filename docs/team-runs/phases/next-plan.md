# Team Runs — Next plan (quality-first)

**Audience:** next coding agent / human planner  
**Priority policy (user):** **quality first**, Alignment polish second  
**Status baseline:** [`phase-status.md`](./phase-status.md)  
**Entrypoint:** [`../README.md`](../README.md) · **Handoff:** [`../HANDOFF.md`](../HANDOFF.md)

Do not expand into peer channels or parallel execution unless explicitly requested.

---

## North star for the next 2–3 sessions

> Make false-green harder to produce and rework cycles actually converge —  
> with evidence in validators, briefs, and human acceptance — before more UX chrome.

---

## Queue (ordered)

### Q1 — Structured rework loop (high value, medium size) — **DONE**

**Problem:** rework text is freeform; failed checklist items exist only in the acceptance UI click state unless the user wrote them into feedback (partially auto-merged already).

**Do:**
1. When Reject & rework fires, also append a structured block to `.team/notes.md`  
2. Optionally store `lastRework: { at, text, failedChecks[] }` on TeamRun  
3. Ensure orchestrator replan brief and worker briefs both cite that structure  
4. Tests: rework command persists notes + brief contains them  

**Owned paths (likely):**
- `app/api/team-runs/[id]/route.ts`  
- `lib/team-runs/brief.ts`, `store.ts`, `types.ts`  
- `components/TeamAcceptancePanel.tsx`  
- `docs/team-runs/contracts.md`  

**Done when:** after rework, implementer dispatch always contains the failed Goal Spec checks even if the human typed minimal extra text.

**Landed:** `lastRework` on TeamRun; `POST rework` accepts `failedChecks[]`; appends `.team/notes.md`; brief/orchestrator inject structured `[FAIL]` checks; acceptance UI sends checklist fails separately from free text; unit coverage in `team-runs.test.mjs`.

---

### Q2 — False-green regression fixtures (high value, medium size) — **DONE**

**Problem:** validators are string heuristics; the original Todo failure mode (HTTP green / file:// red) is not encoded as an automated scenario.

**Do:**
1. Add fixture markdown sets under e.g. `lib/team-runs/fixtures/false-green/`  
2. Unit tests: “looks pass but missing primary evidence” → hard fail  
3. Document expected reviewer/tester artifact shapes in contracts  
4. Optional: prompt snippet library for tester/reviewer from fixtures  

**Done when:** a green-looking test-report without primary pass cannot validate; acceptance without independent evidence cannot pass.

**Landed:** Todo fixture pairs under `lib/team-runs/fixtures/false-green/`; validators require a dedicated Primary Path pass field and independent reviewer evidence; contracts include canonical tester/reviewer shapes; unit tests cover weak and valid artifact sets.

---

### Q3 — Validation errors in Timeline UI (medium value, small–medium) — **DONE**

**Problem:** hard validation failures are easy to miss in event stream noise.

**Do:**
1. Surface `artifact_validation_failed` with full hardErrors list in TeamTimeline  
2. Pin latest blocked reason + failed node + artifact paths in run header  
3. Link Open file on failed artifact path  

**Owned paths:**
- `components/TeamTimeline.tsx`, `TeamMode.tsx`  

**Done when:** a failed validation is obvious within 2 seconds of opening the run.

**Landed:** validation-failure events carry `hardErrors`, warnings, and paths; Timeline renders a dedicated error card with Open file actions; the run header pins the latest unresolved validation reason, node, and artifact paths; legacy events fall back to message/node data.

---

### Q4 — Acceptance checklist persistence (medium value, small) — **DONE**

**Problem:** checklist pass/fail state is local React state; refresh loses it.

**Do:**
1. Persist checklist marks on the TeamRun document or localStorage keyed by runId  
2. Prefer server truth if rework must see them  

**Done when:** reload on awaiting_human keeps marks.

**Landed:** checklist marks persist in `localStorage` under `pi-team-acceptance-checks:<runId>`; parsing filters stale/invalid check ids and values; initial hydration is guarded so the first render cannot overwrite restored state; Rework continues sending restored failed labels to server truth.

---

### Q5 — Alignment P2 (only after Q1–Q3 unless user pivots)

From [`../alignment-room.md`](../alignment-room.md):

1. Multi-seat full-screen workspace (parity with single coach workspace)  
2. Streaming / non-blocking turn progress  
3. Room list + resume + abandon UX  
4. Export alignment notes always on synthesize/publish  
5. Import Chat transcript into Alignment Room  

**Do not** start peer worker channels here.

---

## Explicit non-goals (still)

- Raft-like peer DM between implementer/tester mid-run  
- Parallel multi-writer engine  
- Auto PR  
- Cost router / OpenSquilla step models  

---

## Suggested session shapes

| Session | Goal | Verify |
| --- | --- | --- |
| S1 | Q1 structured rework | unit tests + manual rework once |
| S2 | Q2 fixtures | `node --test` fixtures red/green |
| S3 | Q3 timeline errors | manual fail node + UI check |
| S4 | Q5 subset (multi-seat full-screen) only if quality queue clear | manual dual-model room |

---

## Working rules for successors

1. Read `docs/team-runs/README.md` + `contracts.md` before coding.  
2. Update contracts/ADR **in the same change** if interfaces move.  
3. Keep diffs surgical; no chat-stack drive-bys.  
4. Never `next build` during active dev.  
5. Prefer one workstream ownership set per agent.  
6. End large sessions with an updated `HANDOFF.md` + this plan’s checkmarks if items complete.  

---

## Immediate start command for next agent

```text
Continue quality-first Team Runs from docs/team-runs/HANDOFF.md and docs/team-runs/phases/next-plan.md.
Implement Q3 (surface hard validation failures prominently in Team Timeline/run header), with focused UI validation.
Do not expand Alignment P2 until Q3 is done.
```
