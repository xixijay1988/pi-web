# WS4 — Timeline + final acceptance UX

## Goal

Make autonomous runs trustworthy: visible history, clear blocked reasons, and
a final acceptance panel humans can actually use.

## What to build

- Event timeline component bound to run snapshot + SSE
- Node list with role display name, model, status, attempts
- Budget counters
- Final acceptance panel: goal, change-summary, test-report, acceptance verdict, links
- Observe-first role chat affordances / pause-to-talk messaging

## Acceptance criteria

- [ ] User can understand who is working and why a run blocked without opening raw JSON
- [ ] Acceptance panel shows the four critical artifacts when present
- [ ] Accept/reject actions call API and update UI
- [ ] Live updates via SSE while page open

## Owned paths

- Team run detail UI components
- SSE client hook for team runs

## Do not

- Change engine transition rules except bugfixes found while wiring UI

## Blocked by

- WS3 events + statuses
- WS2 detail shell

## References

- blueprint §8, expert review product P0s


## Implementation status

**Landed:** `hooks/useTeamRun.ts` (SSE), `TeamTimeline`, `TeamAcceptancePanel`, TeamMode redesign with budgets, blocked reason, observe/pause guidance, artifact open via file panel.
