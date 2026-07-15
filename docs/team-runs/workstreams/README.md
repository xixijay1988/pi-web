# Team Runs — Workstreams

Independently grabbable slices for multi-agent development.

## How to claim a workstream

1. Read [`../README.md`](../README.md) + [`../contracts.md`](../contracts.md).
2. Open the workstream brief below.
3. Only edit **Owned paths** unless the brief says otherwise.
4. Leave interfaces from `contracts.md` stable; if you must break one, update contracts + mention in your PR/summary.
5. Do not start WS3 engine until WS0 spike exit criteria are met.

## Dependency graph

```text
WS0 domain + spike
   ├── WS1 role config
   ├── WS2 team shell
   │     └── (both feed)
   └── WS3 engine ──────────► WS4 timeline/acceptance UX ──► WS5 hardening
```

WS1 and WS2 may proceed in parallel after WS0 lands types/store helpers.

## Index

| ID | Brief | Status intent |
| --- | --- | --- |
| WS0 | [Domain + runtime spike](./ws0-domain-and-spike.md) | First |
| WS1 | [Role config](./ws1-role-config.md) | Parallel after WS0 |
| WS2 | [Team shell](./ws2-team-shell.md) | Parallel after WS0 |
| WS3 | [Engine](./ws3-engine.md) | After spike |
| WS4 | [Timeline + acceptance](./ws4-timeline-acceptance.md) | After engine events |
| WS5 | [Hardening](./ws5-hardening.md) | After golden path |

## Coordination rules

- Prefer additive modules under `lib/team-runs/` and `app/api/team-*`.
- Touch `lib/rpc-manager.ts` only when the brief requires session hooks; keep diffs minimal.
- Never run `next build` in dev loops.
- Use glossary terms from [`../CONTEXT.md`](../CONTEXT.md).
