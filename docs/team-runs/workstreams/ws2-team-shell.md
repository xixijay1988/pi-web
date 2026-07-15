# WS2 — Team Mode shell (CRUD + navigation)

## Goal

Ship Chat | Team mode switch, Team Run list/create/detail shell, and grouped
access to role sessions — even before full autonomy.

## What to build

- API list/create/get/command stubs that persist TeamRun documents
- UI mode switch Chat | Team
- Run list + create form (cwd, goal, optional role model overrides)
- Run detail shell showing status, nodes placeholder, human note, pause/cancel buttons (wire to API even if engine no-ops until WS3)
- Ensure Team sticky sessions are grouped under run / filtered from normal session tree

## Acceptance criteria

- [ ] User can create a Team Run row with goal + cwd without engine
- [ ] Run appears in Team list with status
- [ ] Chat mode session tree not flooded with team sessions (filter or group)
- [ ] Opening a role session uses existing ChatWindow route/tab patterns
- [ ] Commands `note` / `cancel` persist on run document

## Owned paths

- `app/api/team-runs/**` (CRUD + commands; engine hook points only)
- `components/` Team list/detail/mode switch pieces
- light integration in `AppShell` / sidebar — keep surgical

## Do not

- Implement dispatch/validation loop (WS3)
- Redesign entire AppShell information architecture beyond mode switch needs

## Blocked by

- WS0 store/types
- WS1 optional for overrides UI; can accept raw provider/model fields first

## References

- contracts §7 API, §9 UI
- blueprint Phase 2


## Implementation status

**Landed (shell):** `/api/team-runs`, commands, SSE placeholder, `components/TeamMode.tsx`, Chat|Team switch in AppShell. Engine start still WS3.

## Follow-up (Goal Spec)

- Create form collects Outcome / Primary Path / ≥3 acceptance checks (Align then start | Quick form).
- API rejects weak goals when `requireStrongGoal` is true (default).
- Optional later: live Goal-coach Agent session; Chat skill import into Team.

## Goal Coach (P1.5)

- `POST /api/team-runs/goal-coach` starts/continues a sticky readonly Goal Coach session.
- Coach emits a fenced `goal_spec` block; UI extracts and can **Apply draft to form**.
- Does not auto-start the Team Run — human still confirms Goal Spec.

## Chat → Team publish

- Chat button **Publish to Team** scans messages for a `goal_spec` fence (from `team-goal` skill or any assistant output).
- Modal confirms Goal Spec and `POST /api/team-runs` with `start: true`.
- Switches product mode to Team and selects the new run.
