# Alignment Room — Multi-model Skill discussion before Team execute

> Design for discussing requirements **inside Team** (and with Skills / multiple
> models) **before** the serial TeamRun Engine starts.
>
> Status: **decision-complete for phased delivery** (see ADR 0007). **P0+P1 shipped** (Skills/model coach + multi-seat serial room); P2 polish pending.
> Companion: [`README.md`](./README.md), [`contracts.md`](./contracts.md), Chat Publish path.

## 1. Problem

Execution multi-role already works (architect → implement → test → review).
False-green and rework still happen when the **Goal Spec** is thin.

Users want:

1. Use Skills such as **grill-me** / **team-goal** while staying in Team.
2. Let **more than one model/role** participate in shaping the requirement.
3. Only then **Confirm Goal Spec & start** the existing engine.

This is **not** the same as peer worker channels during execution (Raft-B; deferred).

## 2. Product shape

```text
                    ┌──────────────────────────┐
   Chat grill-me ──►│  Publish to Team (done)  │──► TeamRun Engine
                    └──────────────────────────┘
                                 ▲
                                 │ same Goal Spec gate
                    ┌────────────┴─────────────┐
   Team UI ────────►│     Alignment Room       │
   Skills+models    │  (pre-execution only)    │
                    └──────────────────────────┘
                                 │
                                 ▼
                      .team/goal-spec.md + notes
                      human confirm → engine start
```

**Invariant:** Alignment Room produces **Goal Spec + notes**, never “green” execution artifacts (`contract.md` as success proof of the feature, product code, etc.). Implementation stays in the engine DAG.

## 3. Concepts

| Term | Meaning |
| --- | --- |
| **Alignment Room** | Pre-start multi-participant discussion bound to a cwd (and optional draft run) |
| **Alignment Participant** | A role seat with its own model/provider, prompt, tools, optional Skills |
| **Alignment Turn** | One dispatch to one participant (serial by default) |
| **Facilitator** | Participant (often Goal Coach) that interviews, loads Skills, synthesizes `goal_spec` |
| **Critic seats** | Optional Architect / Product / Risk reviewers that only comment on the draft Goal Spec |
| **Goal Spec gate** | Human confirm of Outcome + Primary Path + ≥3 checks before engine start |

Related existing terms: Goal Coach, Publish to Team, Goal Spec, Human Gate, TeamRun Engine.

## 4. Collaboration model (phased)

### Phase A — Facilitator + Skills + model pick (P0)

- Single sticky Facilitator session (today’s Goal Coach).
- User can attach Skills (`grill-me`, `team-goal`, project skills).
- User can pick provider/model for the Facilitator.
- Skills are injected into the facilitator context (prompt / kickoff), not as a separate product mode.
- Output: fenced `goal_spec` → Apply / Confirm → start engine.

**Done when:** Team Align panel can run grill-style discussion with chosen model + skills without leaving Team.

### Phase B — Serial multi-seat room (P1)

- Room has N participants (default 2–3): Facilitator + Architect critic + optional Product critic.
- **Serial round-robin** turns (not free peer @).
- Shared transcript stored as runtime truth for the room.
- Facilitator (or a dedicated synthesizer turn) emits `goal_spec`.
- Human can insert messages between turns; can stop round early.
- Optional: “one more critique pass” button.

**Done when:** User can start a room with ≥2 different models, see interleaved transcript, apply Goal Spec, start Team Run.

### Phase C — Richer room UX (P2)

- Named rounds (Discovery / Constraints / Acceptance / Risk).
- Per-seat enable/disable mid-room.
- Export transcript to `.team/alignment/*.md`.
- Import Chat session transcript into a room.
- Budget: max turns, max duration, max cost estimate.

### Phase D — Deferred (not this program)

- Peer channels / mutual @ among **executing** workers.
- Parallel writers on business source during alignment.
- Auto-start engine without human Goal Spec confirm.
- Full Raft-like social product.

## 5. Default seats (Phase B)

| seatId | Default name | Default toolPreset | Default skills | Intent |
| --- | --- | --- | --- | --- |
| `facilitator` | Goal Coach | `readonly` | `grill-me`, `team-goal` | Interview + synthesize `goal_spec` |
| `architect_critic` | Architect critic | `readonly` | — | Challenge Primary Path, module/env risks |
| `product_critic` | Product critic | `none` or `readonly` | — | Challenge acceptance checks / out of scope |

Users may change **name / provider / modelId** per seat. `seatId` stays stable.

Seats are **not** the same objects as execution Role Snapshots, but may be **seeded from** role templates (`architect`, etc.) for model defaults.

## 6. Skill integration

Skills remain pi session resources (`SKILL.md` via ResourceLoader / `~/.pi/agent/skills` / project skills).

**Phase A mechanism (simple, reliable):**

1. UI lists available skill names for cwd.
2. User selects subset for the room/facilitator.
3. Server loads each `SKILL.md` body (or skill description + body) and injects under a clear marker in the facilitator system prompt **and/or** kickoff user message:

```text
## Attached Skills
### grill-me
<skill body>
### team-goal
<skill body>
```

4. Facilitator is instructed to follow attached skills, then emit `goal_spec`.

**Why not only slash `skill:foo`?** Alignment API is request/response oriented today; slash discovery varies by UI. Injection makes skill behavior deterministic for the room.

**Phase B+:** each seat may have its own `skillNames[]`. Critics usually get none or a short “review checklist” skill.

## 7. Runtime truth (Phase B)

Prefer a dedicated document so alignment can exist **before** a Team Run id:

```text
$PI_CODING_AGENT_DIR/team-alignments/
  <alignmentId>.json
```

Shape (conceptual):

```ts
type AlignmentRoom = {
  id: string;
  cwd: string;
  status: "active" | "ready_for_goal" | "consumed" | "abandoned";
  participants: AlignmentParticipant[];
  transcript: AlignmentMessage[];
  turnIndex: number;
  draftGoalSpec?: GoalSpec;
  teamRunId?: string; // set when published/started
  budget: { maxTurns: number; maxDurationMs: number };
  createdAt: string;
  updatedAt: string;
};

type AlignmentParticipant = {
  seatId: string;
  name: string;
  systemPrompt: string;
  provider: string;
  modelId: string;
  toolPreset: TeamToolPreset;
  skillNames: string[];
  sessionId?: string;
  sessionFile?: string;
};

type AlignmentMessage = {
  at: string;
  from: "human" | string; // seatId
  text: string;
  kind: "user" | "assistant" | "system" | "goal_spec";
};
```

**Phase A** may keep using ephemeral Goal Coach sessions only (no `team-alignments/` file) to ship faster; introduce the document when multi-seat lands.

Project artifacts on confirm (unchanged Goal Spec path):

```text
.team/goal-spec.md
.team/goal.md
.team/alignment-notes.md   # optional transcript excerpt
```

## 8. API (target)

### Phase A (extend existing)

`POST /api/team-runs/goal-coach`

Add fields:

```json
{
  "cwd": "...",
  "message": "...",
  "sessionId": "...?",
  "sessionFile": "...?",
  "provider": "...?",
  "modelId": "...?",
  "skillNames": ["grill-me", "team-goal"]
}
```

Response unchanged in spirit (`assistantText`, `draft`, …).

`GET /api/skills?cwd=` already lists skills for UI pickers.

### Phase B (new)

```text
POST   /api/team-alignments              # create room + seats
GET    /api/team-alignments/:id
POST   /api/team-alignments/:id/message  # human message
POST   /api/team-alignments/:id/advance  # run next seat turn (serial)
POST   /api/team-alignments/:id/synthesize  # force facilitator goal_spec pass
POST   /api/team-alignments/:id/publish  # validate Goal Spec → create+start Team Run
```

SSE optional later (`/events`); Phase B may poll GET.

## 9. UI

### Team → Align then start

**Phase A**
- Goal Coach panel gains: model selector, skill multi-select (presets: grill-me, team-goal).
- Transcript + Apply draft (existing).
- Confirm Goal Spec & start (existing form).

**Phase B**
- “Open Alignment Room” with seat chips (model per seat).
- Shared transcript (human + seats).
- Controls: Send, Next turn, Synthesize Goal Spec, Apply & start.
- Still show the Goal Spec form as the hard gate.

### Chat path (already shipped)

Chat Skills → **Publish to Team** remains first-class; Alignment Room does not replace it.

## 10. Engine boundary

| Alignment Room may | Alignment Room must not |
| --- | --- |
| Read repo (readonly tools) | Mark Plan Nodes succeeded |
| Write only alignment notes / goal-spec on publish | Edit business source as “implementation” |
| Use multiple models serially | Bypass human Goal Spec confirm |
| Attach Skills | Replace Reviewer final acceptance |

TeamRun Engine contracts (budgets, hard validation, serial nodes) stay as-is.

## 11. Phased delivery checklist

### P0 — Facilitator Skills + model (this slice after docs)

- [ ] goal-coach API accepts `skillNames`, honors `provider`/`modelId`
- [ ] load skill bodies and inject into facilitator context
- [ ] TeamGoalCoach UI: model + skill chips
- [ ] tests for skill injection + still extract `goal_spec`
- [ ] docs: contracts + this file status note

### P1 — Multi-seat serial room

- [x] `AlignmentRoom` store under `team-alignments/`
- [x] create / message / advance / synthesize / publish APIs
- [x] UI room transcript + seat config
- [x] default facilitator + architect_critic
- [x] publish → existing Team Run create+start

### P2 — Hardening / polish

- [ ] budgets, abandon, resume room
- [ ] export `.team/alignment-notes.md`
- [ ] Chat transcript import into room
- [ ] optional product_critic seat preset

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Multi-model discussion burns tokens | Room budgets; serial turns; small default seat count |
| Skills not found / different loader paths | Use same `DefaultResourceLoader` as `/api/skills` |
| Models argue endlessly | Synthesize + human gate; maxTurns |
| Confusion with execution roles | Separate seatIds; copy “discussion only” in UI |
| Scope creep into peer channels | ADR 0007; Phase D explicitly deferred |

## 13. Exit criteria

**P0:** From Team Align, user selects grill-me + a model, runs a discussion, applies Goal Spec, starts a Team Run.

**P1:** Two different models produce visible turns in one transcript; facilitator synthesizes Goal Spec; human starts engine once.

**Non-goals for this program:** worker peer DMs, parallel implementers, auto-merge.
