# Team Runs

Domain language for multi-role, multi-model work organization on pi-web.
Use these terms in code, APIs, UI copy, issues, and commits.

## Language

**Team Run**:
A task package that binds one user goal to an orchestrated multi-role execution, including plan, sessions, artifacts, budgets, and status.
_Avoid_: Job, workflow instance, multi-agent chat, mission (unless UI synonym is explicitly chosen later)

**Role**:
A durable specialty identity with prompt, default model, and tool preset (for example Architect or Tester).
_Avoid_: Agent (ambiguous with pi AgentSession), persona, bot

**Role Template**:
The configurable source definition of a Role (global or project-scoped) before it is snapshotted into a Team Run.
_Avoid_: Role config blob, profile (unless referring to OpenSquilla durable agents)

**Role Snapshot**:
The immutable copy of a Role Template frozen into a Team Run at start time.
_Avoid_: Live role, mutable template

**roleId**:
Stable machine identifier for a Role (`architect`, `implementer`, …).
_Avoid_: Using display name as identity

**Role Name**:
User-visible label for a Role; customizable without changing `roleId`.
_Avoid_: title, handle (unless UI needs a separate handle later)

**Orchestrator**:
The planning Role that produces and rewrites the Plan; it does not implement business code.
_Avoid_: Manager agent as a generic synonym in engine code; use Orchestrator

**Worker Role**:
Any non-orchestrator Role that executes a Plan Node (Architect, Implementer, Tester, Reviewer, or custom).
_Avoid_: Subagent (pi/OpenSquilla term with different meaning)

**Plan**:
The orchestrator-authored DAG of Plan Nodes for a Team Run, stored as structured run state plus human-readable `.team/plan.md`.
_Avoid_: Pipeline, workflow definition (reserved for future templates)

**Plan Node**:
One scheduled unit of work assigned to a Role inside a Plan, with deps, attempts, session binding, and artifact expectations.
_Avoid_: Step (OK in UI), task (overloaded), ticket

**Dispatch**:
A single engine attempt to prompt a Role session for a Plan Node, identified by `dispatchId`.
_Avoid_: Job run, invocation (OK internally if mapped to Dispatch)

**Handoff Artifact**:
A versioned Markdown file under `.team/` that is the contractual output of a Plan Node for downstream Roles and the engine.
_Avoid_: Message, transcript dump, attachment

**Hard Validation**:
Machine checks that must pass for a Plan Node to succeed (existence, required headers/frontmatter, acceptance status).
_Avoid_: Linting, review (human)

**Soft Validation**:
Non-blocking quality warnings that do not alone prevent progress in v1.
_Avoid_: Optional validation as if it gated success

**TeamRun Engine**:
Server-side state machine that advances Team Runs: planning, dispatch, validation, retry, replan, pause, and terminal states.
_Avoid_: Frontend orchestrator, chat loop

**Runtime Truth**:
The Team Run JSON document under the pi agent dir that is authoritative for status, sessions, budgets, and events.
_Avoid_: Treating `.team/` files as source of run status

**Project Artifacts**:
Human-readable files under the project `.team/` directory (goal, plan, notes, step outputs).
_Avoid_: Calling these the database of record

**Human Note**:
User-authored guidance attached to a Team Run for the next planning cycle, also projected to `.team/notes.md`.
_Avoid_: Chat message to a Worker Role (that is intervention)

**Goal Coach**:
A sticky interview agent that helps the human produce a strong Goal Spec before a Team Run starts. Emits a fenced `goal_spec` block that the UI can apply into the create form.
_Avoid_: Auto-starting the Team Run without human confirm

**Goal Spec**:
Structured create-time description of success: Outcome, Primary Path (how a human opens/uses the result), and ≥3 acceptance checks. Stored as `.team/goal-spec.md` and on the TeamRun as `goalSpec`. Strong Goal Spec is required by default to reduce false-green runs.
_Avoid_: One-line goal only, goal that omits the real human path

**Human Gate**:
A point where the user must act for the Team Run to continue. v1 has start (create/start) and final acceptance only.
_Avoid_: Mid-stage approvals (explicitly out of v1)

**Final Acceptance**:
The human confirmation after Reviewer pass that marks the Team Run done.
_Avoid_: Merge, ship (may follow but are separate)

**Budget**:
Hard limits on attempts, replans, and duration that stop unbounded autonomous spending.
_Avoid_: Soft preference, suggestion

**Sticky Session**:
The long-lived pi session bound to one Role for the life of a Team Run, reused across dispatches to that Role.
_Avoid_: Ephemeral turn session (v1 default is sticky)

**Chat Mode**:
Existing single-session pi-web experience, unchanged as the baseline product.
_Avoid_: Legacy mode (it remains first-class)

**Team Mode**:
Product mode for listing and operating Team Runs alongside Chat Mode.
_Avoid_: Multiplayer mode, org mode
