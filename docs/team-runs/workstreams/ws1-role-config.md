# WS1 — Role template config

## Goal

Users can configure the multi-model organization: each Role has name, prompt,
provider/model, and tool preset; global + project scopes merge correctly.

## What to build

- Read/write global `team-roles.json` and project `.team/roles.json`
- API routes per contracts
- Seed default five roles
- UI panel (sidebar/settings style consistent with ModelsConfig/SkillsConfig) to edit roles and pick provider/model from existing models list APIs

## Acceptance criteria

- [ ] Defaults for orchestrator/architect/implementer/tester/reviewer exist after first load
- [ ] Custom display `name` persists; `roleId` stable
- [ ] Project override wins on same `roleId`
- [ ] Can set Architect to model A and Implementer to model B and reload
- [ ] No API keys returned in responses
- [ ] Uses glossary terms in UI copy

## Owned paths

- `lib/team-runs/roles*.ts` (or similar)
- `app/api/team-roles/**`
- `components/*Role*` / extend config modal components carefully

## Do not

- Start TeamRun engine
- Change session jsonl format

## Blocked by

- WS0 types/store helpers preferred (can stub types if parallel, but merge onto WS0 types ASAP)

## References

- contracts §1 role templates, §3 defaults
- blueprint Phase 1


## Implementation status

**Landed (partial UI+API):** `/api/team-roles`, `/api/team-roles/project`, `components/RolesConfig.tsx`, AppShell Roles button.
