# Team Runs — Multi-Role Work Organization

> Design + phased implementation blueprint for multi-model, multi-role
> collaboration on top of existing pi-web single-session chat.
>
> Status: **decision-complete for v1** (post multi-expert review).
> Implementation has not started.
>
> **Multi-agent pack (start here for implementation):** [`team-runs/README.md`](./team-runs/README.md)


## 1. Summary

Build a **Team Run** layer on pi-web so one user goal is executed by a
configurable set of roles (different models, prompts, tools), dispatched
automatically by a server-side engine with an orchestrator LLM that plans
and rewrites a default software-engineering DAG.

Existing single-session Chat remains unchanged. Team is a parallel product
mode, not a rewrite of pi session semantics.

**v1 success:** one feature-style happy path runs unattended from goal →
plan → contract → implement → test → review → human final accept, with a
visible event timeline, cost/retry budgets, and crash-safe run state.

## 2. Locked decisions

| Area | Decision |
| --- | --- |
| Collaboration shape | Orchestrator dispatch in v1; peer channels later |
| Role entity | Configurable templates (`roleId` + display `name`) |
| Top object | Team Run (task package) |
| Handoffs | Structured artifacts + project `.team/` files |
| Human gates | Start + final acceptance only |
| Dispatch brain | Default eng DAG + orchestrator may rewrite |
| Parallelism | Serial execution; schema keeps dependency edges |
| Storage | `~/.pi/.../team-runs` = runtime truth; `.team/` = human artifacts |
| Product entry | Chat \| Team side-by-side |
| Workspace | Shared cwd; role tool presets differ |
| Failure | Retry → replan/reassign → blocked |
| Completion | Reviewer pass → `awaiting_human_acceptance` → human confirm |
| Default roster | Orchestrator, Architect, Implementer, Tester, Reviewer |
| Models | Per-role provider/model config UI |
| Config scope | Global roles + project override; snapshot into run at start |
| Sessions | Sticky long session per role; batch-create after Plan |
| Engine | Server TeamRun state machine; orchestrator only plans |
| Orchestrator powers | Read repo + write `.team/**` only |
| Mid-run human | Observe + human notes; chatting a role pauses run |
| Structured I/O | Convention-path Markdown under `.team/` |
| v1 slice | Single feature path end-to-end |

### Non-goals (v1)

- Peer role channels / mutual @ (Raft-B)
- True parallel writers
- OpenSquilla-style step-level model routing
- Path-level write ACL matrix
- Auto PR / auto merge
- Full workflow marketplace

## 3. Architecture

```text
User Goal
   │
   ▼
TeamRunEngine  (in-process, globalThis, beside rpc-manager)
   │  run state machine + event log + budgets
   │
   ├─ Orchestrator session   (read tools + .team write)
   ├─ Role sessions          (sticky; created after plan)
   │     Architect / Implementer / Tester / Reviewer
   │
   └─ Persistence
         $PI_CODING_AGENT_DIR/team-runs/<id>.json
         <cwd>/.team/**                      # artifacts + plan + notes
```

### Integration seams with pi-web

| Reuse | New |
| --- | --- |
| `startRpcSession`, commands, SSE | `TeamRunEngine`, team-run store |
| `ChatWindow` / `useAgentSession` | Team list + run detail + timeline |
| models / auth / tool presets | role template config UI |
| file explorer / allow-list | `.team/` conventions + validators |

**Hard constraints from review:**

1. Engine completion detection is **server-side** (session subscribe + reconcile). Never trust browser SSE alone.
2. Sessions may be **idle-destroyed (10 min)**. Run metadata stores `sessionId` + `sessionFile`; dispatch always `ensureSessionLoaded`.
3. Team child sessions are **grouped under the run** in UI; do not dump them raw into the normal session tree by default.
4. Each dispatch user message is a **self-contained brief** (goal + dependency artifact paths + output contract). Do not rely on sticky memory as the contract.

## 4. Domain model

### 4.1 Role template (source config)

```ts
type RoleId = "orchestrator" | "architect" | "implementer" | "tester" | "reviewer" | string;

type RoleTemplate = {
  roleId: RoleId;          // stable id for DAG / engine
  name: string;            // user-visible, customizable
  description: string;
  systemPrompt: string;
  provider: string;
  modelId: string;
  toolPreset: "none" | "default" | "full" | "readonly" | "team_writer";
  // optional explicit toolNames override
  toolNames?: string[];
};
```

**Tool preset intent (v1):**

| Preset | Who | Intent |
| --- | --- | --- |
| `team_writer` | Orchestrator | read/grep/glob + write only under `.team/` (enforce in prompt + narrow tools if available) |
| `readonly` | Tester / Reviewer | read/grep/glob; write `.team/` reports only |
| `full` / `default` | Implementer / Architect as needed | Architect prefers read-heavy; Implementer can edit business code |

Config merge order: **project `.team/roles.json` overrides global**  
`$PI_CODING_AGENT_DIR/team-roles.json` (name may be adjusted at implement time).  
On run create: **snapshot** resolved templates into the run JSON.

### 4.2 Team run (runtime truth)

```ts
type RunStatus =
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

type NodeStatus =
  | "pending"
  | "ready"
  | "starting"
  | "running"
  | "validating"
  | "succeeded"
  | "failed"
  | "skipped";

type PlanNode = {
  id: string;
  roleId: RoleId;
  title: string;
  deps: string[];          // reserved for parallel later
  status: NodeStatus;
  attempts: number;
  sessionId?: string;
  sessionFile?: string;
  activeDispatchId?: string;
  lastError?: string;
  artifactPaths: string[]; // versioned paths expected/produced
};

type Budget = {
  maxAttemptsPerNode: number;   // default 2
  maxReplans: number;           // default 3
  maxRunDurationMs: number;     // default 2h
  // optional later: maxCostUsd
};

type TeamRun = {
  id: string;
  cwd: string;
  goal: string;
  status: RunStatus;
  budget: Budget;
  replanCount: number;
  roleSnapshots: RoleTemplate[];
  plan: { version: number; nodes: PlanNode[]; rawPlanPath: string };
  humanNotes: { at: string; text: string }[];
  events: RunEvent[];          // append-only
  createdAt: string;
  updatedAt: string;
};
```

### 4.3 Events (minimum for v1 timeline)

`run_created` · `planning_started` · `plan_accepted` · `planning_failed` ·  
`node_dispatch` · `node_agent_end` · `artifact_validation_ok` ·  
`artifact_validation_failed` · `retry_scheduled` · `replan_started` ·  
`blocked` · `paused` · `resumed` · `cancelled` ·  
`awaiting_human` · `accepted` · `failed` · `done` · `human_note_added`

## 5. Default feature DAG

```text
[Orchestrator: plan]
       │
       ▼
   Architect  →  .team/steps/01-architect/v1/contract.md
       │
       ▼
  Implementer →  code + .team/steps/02-implement/v1/change-summary.md
       │
       ▼
    Tester    →  .team/steps/03-test/v1/test-report.md
       │
       ▼
   Reviewer   →  .team/steps/04-review/v1/acceptance.md
       │
       ▼
 human accept → done
```

Orchestrator sits **outside** the linear worker chain: it produces/rewrites
the plan and runs again on replan. Workers execute serially (at most one
`running` node in v1).

## 6. Artifact layout

```text
.team/
  goal.md
  plan.md                      # orchestrator-owned; engine parses
  notes.md                     # human notes
  steps/
    01-architect/
      v1/contract.md
      v2/...                   # on retry/replan
    02-implement/
      v1/change-summary.md
    03-test/
      v1/test-report.md
    04-review/
      v1/acceptance.md
```

### Validation tiers

1. **Hard (must pass to succeed node):** file exists; required frontmatter/headers present; acceptance has `status: pass|fail`.
2. **Soft (warn only in v1):** prose quality, checklist completeness beyond required keys.

Engine only advances on **hard pass**. Soft failures may be attached to events for UI.

### Acceptance file (hard shape)

```markdown
---
status: pass
---

# Acceptance

## Against goal
...

## Checklist
- [x] ...
```

## 7. Engine loop

```text
create run
  write .team/goal.md
  snapshot roles
  status=planning
  start orchestrator with goal + role catalog + DAG defaults + path conventions
  parse plan.md → plan.nodes (version=1)
  batch-create sticky sessions for roles appearing in plan
  status=executing

loop while serial ready node exists:
  pick next ready node (deps succeeded; v1 = linear)
  if budget exceeded → blocked
  ensureSessionLoaded(role)
  dispatchId = new id
  prompt self-contained brief
  wait server-side until agent idle (subscribe + reconcile)
  status=validating
  hard-validate artifacts for this attempt/version
  on ok → node succeeded; continue
  on fail →
    if attempts < maxAttemptsPerNode → retry (new artifact version path)
    else if replanCount < maxReplans → status=replanning; orchestrator replan
    else → blocked

when reviewer node succeeded with status=pass:
  status=awaiting_human_acceptance

human accept → done
human reject → blocked or replan (product: default blocked with note)
```

### Crash recovery (required)

On engine start / reattach:

1. Load run JSON.
2. If a node has `activeDispatchId` and session still streaming/prompting → **reattach** waiters.
3. If dispatch marked running but session idle and no new artifacts → mark attempt **failed** (ambiguous), apply retry policy (do not double-prompt without new dispatchId).
4. Run JSON is authoritative; `.team/` is projection + human surface. Record artifact content hashes in events when validated.

### Pause / cancel

| Action | Semantics |
| --- | --- |
| Pause | Soft: do not dispatch further nodes; let in-flight node finish, then stay `paused` |
| Resume | From `paused` → `executing` / `planning` as appropriate |
| Cancel | Hard: request abort on in-flight prompt if supported; status=`cancelled` |
| Chat role while auto-running | Soft-pause run; allow human messages after pause acknowledged |

## 8. Product surfaces

### Chat | Team

- Top-level mode switch.
- **Chat:** existing session tree.
- **Team:** run list (status, goal snippet, current node, updatedAt).

### Run detail (v1 minimum)

- Goal
- Status + budget counters
- Step list with role display name + model + node status
- **Event timeline** (required in engine phase, not deferred)
- Artifact links (open via file viewer)
- Actions: pause / resume / cancel / add human note / accept
- Open sticky role session in `ChatWindow` (send disabled until paused unless note-only entry point)

### Final acceptance panel

Show: goal · change-summary · test-report · acceptance verdict · shortcuts to sessions/diff.

## 9. API sketch

Implement under `app/api/team-runs/` (names flexible):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/team-runs` | list |
| POST | `/api/team-runs` | create `{ cwd, goal, roleOverrides? }` + start |
| GET | `/api/team-runs/[id]` | snapshot |
| POST | `/api/team-runs/[id]` | commands: `pause` `resume` `cancel` `accept` `reject` `note` |
| GET | `/api/team-runs/[id]/events` | SSE of run events/status |
| GET/PUT | `/api/team-roles` | global role library |
| GET/PUT | `/api/team-roles/project` | project override via cwd |

## 10. Phased delivery

### Phase 0 — Domain + runtime spike

**Deliver**

- Types, store read/write for team-runs, `.team` path helpers
- Pure functions: plan parse stub, validators, next-node, budgets
- Written state machine table (this doc §4–7)
- **Spike:** create 2 sessions, different models/tools, prompt, server-wait end, write/read a `.team` file

**Exit**

- Unit tests for transitions/budgets/validation
- Spike script or test proving wait/end without browser

### Phase 1 — Role config UI

**Deliver**

- Global + project role config
- Edit name, prompt, provider/model, tool preset
- Seed 5 defaults

**Exit**

- Architect model A / Implementer model B persists and reloads

### Phase 2 — Team Run shell

**Deliver**

- CRUD/list API
- Chat \| Team switch
- Run list + create form
- Open role session tabs grouped by run (sessions may be empty until plan)

**Exit**

- Create run row without engine still works; UI does not pollute chat tree

### Phase 3 — Engine v1 + timeline

**Deliver**

- `TeamRunEngine` on `globalThis`
- Orchestrator plan → batch session create → serial dispatch
- Server-side completion + artifact hard validation
- Retry / replan / blocked with budgets
- SSE events + **minimal timeline UI**
- Human note path

**Exit (golden path)**

1. Submit small reversible feature goal  
2. Unattended plan → contract → implement → test → review  
3. `awaiting_human_acceptance`  
4. Human accept → `done`  
5. Restart process: run state correct; can reattach or show terminal status  

**Exit (failure path)**

- Missing artifact → retry → replan or blocked with visible reason  

### Phase 4 — Board polish

- Richer DAG view, costs aggregation if stats available, better empty/blocked UX  

### Phase 5 — Hardening

- Confirm role snapshot immutability mid-run  
- Soft pause vs hard cancel UX complete  
- Custom 6th role appears in orchestrator catalog  
- Docs: authoring roles, `.team` conventions, gitignore guidance  

### Phase 6+

- Peer collaboration mode  
- Parallel execution  
- Step-level routing  
- Extra templates (bugfix/docs)  
- Stronger path ACLs / approvals  

## 11. Defaults (assumptions)

| Knob | Default |
| --- | --- |
| `maxAttemptsPerNode` | 2 |
| `maxReplans` | 3 |
| `maxRunDurationMs` | 2 hours |
| Artifact versioning | `v{attempt}` under step folder |
| Human reject | `blocked` + note (not auto-replan) |
| Auto git commit/PR | off |
| `.team/` in git | document recommend gitignore for secrets; leave user choice |

## 12. Test plan

1. **Unit:** state transitions, budgets, validators, plan parser  
2. **Integration (mock session):** fake agent_end + filesystem artifacts  
3. **Spike/E2E manual:** two real models on a toy change  
4. **Recovery:** kill process mid-node; restart; no double work / clear blocked  

## 13. Expert-review deltas absorbed

| Finding | Resolution in this plan |
| --- | --- |
| Sticky memory vs contract | Self-contained briefs; versioned artifacts |
| Idle session destroy | ensureSessionLoaded; store sessionFile |
| Missed agent_end | Server wait + reconcile in engine |
| Infinite retry cost | Budgets required |
| Timeline deferred too late | Timeline required in Phase 3 |
| role display vs id | `roleId` + `name` |
| Crash recovery undefined | Reattach / fail-attempt rules in §7 |
| Orchestrator overreach | No business code writes |
| Acceptance UX | Final panel contents in §8 |

## 14. Implementation notes for agents

- Prefer surgical changes; do not refactor chat stack opportunistically.
- Never run `next build` during dev.
- Keep Team storage separate from pi jsonl session format.
- Fork semantics of pi sessions stay as today; Team Run should **create new sessions**, not fork mid-history, unless a later design says otherwise.
- When tools cannot hard-limit writes to `.team/`, combine narrow tool list + strong system prompt + validator refusal to advance.

## 15. Open items only if blocked during implement

These are intentionally deferred until code forces a choice:

1. Exact pi SDK API for setting non-empty per-session system prompts (spike in Phase 0).  
2. Whether orchestrator write-to-`.team` is enforced by custom tool wrapper or prompt-only in v1.  
3. Exact filename of global role library under agent dir.

If Phase 0 spike discovers a blocker on (1), fall back to: empty/default system prompt + immutable preamble as first user/system message each dispatch.
