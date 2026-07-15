# Team Runs — Contracts

Stable interfaces for multi-agent implementation. If code needs a different
shape, update this file in the same change.

Companion blueprint: [`../team-runs.md`](../team-runs.md)  
Language: [`CONTEXT.md`](./CONTEXT.md)

## 1. Storage layout

### Runtime truth

```text
$PI_CODING_AGENT_DIR/team-runs/
  index.json                 # optional lightweight list cache
  <runId>.json               # TeamRun document (authoritative)
```

- `PI_CODING_AGENT_DIR` defaults as in pi-web today (`getAgentDir()`).
- One file per Team Run. Atomic write recommended (write temp + rename).
- Do **not** embed Team Run state in pi session jsonl headers.

### Role templates

```text
$PI_CODING_AGENT_DIR/team-roles.json     # global library
<cwd>/.team/roles.json                   # project overrides (optional)
```

Merge: project entries override global by `roleId`. Unmentioned global roles remain available unless project explicitly disables (v1: no disable flag required; override/replace by id is enough).

### Project artifacts

```text
<cwd>/.team/
  goal.md                    # human-facing goal (Goal Spec markdown when present)
  goal-spec.md               # structured Goal Spec (Outcome / Primary Path / checks)
  plan.md
  notes.md
  roles.json                 # optional project overrides
  steps/
    <NN>-<roleId>/
      v<attempt>/
        <artifact-name>.md
```

Examples:

```text
.team/steps/01-architect/v1/contract.md
.team/steps/02-implement/v1/change-summary.md
.team/steps/03-test/v1/test-report.md
.team/steps/04-review/v1/acceptance.md
```

## 2. Core types (canonical)

Implement as TypeScript types under something like `lib/team-runs/types.ts`
(path flexible; keep names).

```ts
export type RoleId = string;

export type ToolPreset =
  | "none"
  | "default"
  | "full"
  | "readonly"
  | "team_writer";

export type RoleTemplate = {
  roleId: RoleId;
  name: string;
  description: string;
  systemPrompt: string;
  provider: string;
  modelId: string;
  toolPreset: ToolPreset;
  toolNames?: string[];
};

export type RunStatus =
  | "created"
  | "planning"
  | "executing"
  | "replanning"
  | "awaiting_human_acceptance"
  | "paused"
  | "blocked"
  | "cancelled"
  | "failed"
  | "done";

export type NodeStatus =
  | "pending"
  | "ready"
  | "starting"
  | "running"
  | "validating"
  | "succeeded"
  | "failed"
  | "skipped";

export type Budget = {
  maxAttemptsPerNode: number; // default 2
  maxReplans: number;         // default 3
  maxRunDurationMs: number;   // default 7_200_000
};

export type PlanNode = {
  id: string;
  roleId: RoleId;
  title: string;
  deps: string[];
  status: NodeStatus;
  attempts: number;
  sessionId?: string;
  sessionFile?: string;
  activeDispatchId?: string;
  lastError?: string;
  artifactPaths: string[];
};

export type RunEventType =
  | "run_created"
  | "planning_started"
  | "plan_accepted"
  | "planning_failed"
  | "node_dispatch"
  | "node_agent_end"
  | "artifact_validation_ok"
  | "artifact_validation_failed"
  | "retry_scheduled"
  | "replan_started"
  | "blocked"
  | "paused"
  | "resumed"
  | "cancelled"
  | "awaiting_human"
  | "accepted"
  | "failed"
  | "done"
  | "human_note_added";

export type RunEvent = {
  at: string; // ISO
  type: RunEventType;
  message?: string;
  nodeId?: string;
  dispatchId?: string;
  data?: Record<string, unknown>;
};

export type GoalSpec = {
  outcome: string;
  primaryPath: string;
  acceptanceChecks: string[];
  constraints?: string;
  outOfScope?: string;
  notes?: string;
};

export type TeamRun = {
  id: string;
  cwd: string;
  goal: string;              // summary line; usually GoalSpec.outcome
  goalSpec?: GoalSpec;       // structured create-time Goal Spec (preferred)
  status: RunStatus;
  budget: Budget;
  replanCount: number;
  roleSnapshots: RoleTemplate[];
  plan: {
    version: number;
    nodes: PlanNode[];
    rawPlanPath: string; // usually .team/plan.md
  };
  humanNotes: { at: string; text: string }[];
  events: RunEvent[];
  createdAt: string;
  updatedAt: string;
};
```

## 3. Default roleIds (seed)

| roleId | Default name | Default toolPreset |
| --- | --- | --- |
| `orchestrator` | Orchestrator | `team_writer` |
| `architect` | Architect | `team_writer` (must create `.team` contract) |
| `implementer` | Implementer | `full` or `default` |
| `tester` | Tester | `default` (bash + write report) |
| `reviewer` | Reviewer | `team_writer` (must create acceptance.md) |

Users may rename `name`; do not rename built-in `roleId` values lightly.

## 4. Default feature DAG node ids

Suggested stable node ids for the v1 template:

| node id | roleId | Primary artifact |
| --- | --- | --- |
| `architect` | `architect` | `contract.md` |
| `implement` | `implementer` | `change-summary.md` |
| `test` | `tester` | `test-report.md` |
| `review` | `reviewer` | `acceptance.md` |

Deps: `implement→architect`, `test→implement`, `review→test`.

## 5. Artifact hard validation

### Common

- Path must match the node’s current attempt version directory.
- File must exist and be non-empty.

### Goal Spec (create-time)

Creating a Team Run should collect a **Goal Spec**, not a one-line goal only:

- `outcome` (required)
- `primaryPath` (required when `requireStrongGoal` is true, default true): how a human opens/uses the result
- `acceptanceChecks` (≥3 when strong): observable checks the human will use at final acceptance
- optional `constraints`, `outOfScope`, `notes`

On create:

- write `.team/goal-spec.md` (and mirror into `.team/goal.md`)
- persist `goalSpec` on the TeamRun JSON
- inject Goal Spec into every Dispatch Brief

API `POST /api/team-runs` accepts either legacy `{ goal }` (weak unless mapped into outcome) or structured fields:
`outcome`, `primaryPath`, `acceptanceChecks`, `constraints`, `outOfScope`, `notes`, `requireStrongGoal`.

Strong validation failure → HTTP 400 with `{ error, errors[], warnings[] }`.

### `acceptance.md`

- YAML frontmatter or leading field: `status: pass` or `status: fail`.
- Node succeeds for pipeline completion only when `status: pass`.
- When `status: pass`, must also include `primary_path_verified: true` (reviewer independently verified the human Primary Path).
- `status: fail` → node failed (triggers retry/replan policy), not human acceptance.

### `contract.md`

- Must include `## Primary Path` and `## Acceptance` sections.

### `test-report.md`

- Must document environments (`## Environments` or `primary: ...`).
- Must include `status: pass` or `status: fail`.
- `status: fail` fails the node.
- If text indicates the primary path failed/blocked, hard-fail even if overall wording looks positive.

### `change-summary.md`

- Soft warning if missing a how-to-open / Primary Path style section.

### `plan.md` (orchestrator)

Minimum parseable structure (engine must document exact parser in code comments):

```markdown
# Plan

## Nodes
- id: architect
  roleId: architect
  title: ...
  deps: []
- id: implement
  roleId: implementer
  title: ...
  deps: [architect]
...
```

If parsing fails → `planning_failed` event; retry orchestrator within budget; else `blocked`.

## 6. Dispatch brief (required content)

Every worker dispatch user message must include:

1. Team Run goal / Goal Spec (or paths to `.team/goal-spec.md` / `.team/goal.md`) including Primary Path and acceptance checks when present
2. This node title + role responsibilities
3. Absolute or cwd-relative paths of **dependency artifacts**
4. Exact output path(s) to write for this attempt
5. Hard validation expectations
6. Explicit instruction: do not modify unrelated areas; orchestrator must not edit business source

Do not assume the model “remembers” prior sticky turns as the contract.

## 7. HTTP API

Base: `/api/team-runs` and `/api/team-roles` (App Router).

### `GET /api/team-runs`

Response: `{ runs: TeamRunListItem[] }`  
List item may omit full `events` (include `status`, `goal`, `cwd`, `updatedAt`, `currentNodeId?`).

### `POST /api/team-runs`

Body:

```json
{
  "cwd": "/path",
  "goal": "string",
  "roleOverrides": [{ "roleId": "implementer", "provider": "...", "modelId": "..." }],
  "start": true
}
```

Response: `{ run: TeamRun }`  
Creates snapshot, validates Goal Spec (strong by default), writes `.team/goal-spec.md` + `.team/goal.md`, optionally starts engine.

### `POST /api/team-runs/goal-coach`

Body:

```json
{
  "cwd": "string",
  "message": "string",
  "sessionId": "string?",
  "sessionFile": "string?",
  "provider": "string?",
  "modelId": "string?"
}
```

Starts or continues a sticky **Goal Coach** session (readonly tools). Response:

```json
{
  "sessionId": "string",
  "sessionFile": "string",
  "assistantText": "string",
  "draft": "GoalSpec?",
  "draftErrors": ["string"],
  "draftWarnings": ["string"],
  "wait": "idle|..."
}
```

`draft` is populated when the assistant emits a fenced `goal_spec` block (or full Goal Spec markdown). Does not create a Team Run.


### `GET /api/team-runs/[id]`

Full `TeamRun`.

### `POST /api/team-runs/[id]`

Body discriminated by `type`:

| type | effect |
| --- | --- |
| `pause` | soft pause |
| `resume` | resume |
| `cancel` | hard cancel |
| `accept` | only from `awaiting_human_acceptance` → `done` |
| `reject` | → `blocked` + optional note |
| `note` | `{ text }` human note |

### `GET /api/team-runs/[id]/events`

SSE stream of `RunEvent` and/or full status snapshots. Reconnectable.

### Roles

- `GET/PUT /api/team-roles` → global library
- `GET/PUT /api/team-roles/project?cwd=` → project override file

Never return raw provider API keys.

## 8. Engine integration contracts

### Session binding

- Create **new** pi sessions for roles (do not fork chat history for v1).
- Persist `sessionId` + `sessionFile` on the Plan Node (or a role→session map on the run).
- Before dispatch: `ensureSessionLoaded`; set model; set tools; inject role instructions per spike outcome.

### Completion wait

```text
waitUntilRoleIdle(sessionId):
  subscribe to session events
  also poll get state (isStreaming / isPromptRunning)
  resolve on idle after the dispatch generation
  ignore late events from older dispatchId
```

Mirror the monotonic run-id idea already used in `useAgentSession` reconciliation.

### Idle destroy

`rpc-manager` may destroy wrappers after 10 minutes idle. This is expected.
Engine must not keep only in-memory session object references as truth.

### globalThis registry

Register engine similarly to `__piSessions` (name e.g. `__piTeamRuns`) so dev hot reload does not drop runs silently without rehydrate-from-disk.

## 9. UI contracts

- Mode switch: **Chat | Team**.
- Team child sessions default **filtered/grouped under run**, not mixed as top-level noise in session tree.
- While status is auto-running and not paused: role `ChatWindow` is observe-first; sending a message requires pause (or only human-note entry is enabled).
- Timeline renders `TeamRun.events` (or SSE live tail).

## 10. Testing contracts

Any engine PR must include at least one of:

- unit tests for reducer/transition + budgets, or
- integration test with mock session + real filesystem artifacts

Golden path manual test checklist lives in blueprint Phase 3 exit criteria.

## 11. Out of contract (do not invent in v1)

- Parallel node execution
- Peer role messaging bus
- Step-level model routing
- Auto PR
- Cross-run long-term role memory store

## Chat → Team import

UI-only flow (no new runtime truth type):

1. User discusses in Chat (skills such as grill-me / team-goal).
2. Assistant emits a fenced `goal_spec` block (same shape as Goal Coach).
3. **Publish to Team** extracts GoalSpec from session messages via `extractGoalSpecFromMessages`.
4. Human confirms form → existing `POST /api/team-runs` with strong Goal Spec.

Repo skill pack: `skills/team-goal/SKILL.md` (also installable under `~/.pi/agent/skills/team-goal`).
