# WS5 — Hardening + extension readiness

## Goal

Productionize v1 behavior and prepare for custom roles / later parallel edges.

## What to build

- Confirm role snapshots immutable mid-run (template edits do not affect active run)
- Soft pause vs hard cancel UX complete and tested
- Custom sixth role appears in orchestrator catalog when configured
- Document `.team` gitignore guidance
- Optional: cost/token aggregation if session stats are easy
- Ensure `deps[]` still present and documented for future parallel scheduler

## Acceptance criteria

- [ ] Mid-run global role edit does not change in-flight snapshots
- [ ] Pause/resume/cancel matrix covered by tests or manual script
- [ ] Custom role can be planned (even if default DAG unused)
- [ ] Docs updated for role authors

## Owned paths

- engine edge cases
- docs/team-runs/*
- small UI fixes

## Blocked by

- Golden path green on WS3+WS4

## References

- blueprint Phase 5–6
