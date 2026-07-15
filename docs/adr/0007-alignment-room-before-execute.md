# Alignment Room is pre-execution; engine stays serial dispatch

Users want Skill-driven requirement discussion (e.g. grill-me) and multiple models participating **before** a Team Run executes. Options: (a) fold discussion into the execution engine as plan nodes, (b) build Raft-like peer channels among worker roles, (c) add a separate pre-start **Alignment Room** that produces a Goal Spec, then hand off to the existing engine.

**Decision:** Introduce **Alignment Room** as a pre-execution product surface. It may use multiple sticky role sessions and Skills, but does **not** advance Plan Nodes or mutate business source as part of execution. Confirmed Goal Spec still gates `start` of the TeamRun Engine. Peer channels among executing workers remain deferred (see ADR 0002).

**Why:**
- Keeps crash-safe budgets, serial validation, and artifact contracts of the execution engine intact.
- Matches the product need: “discuss clearly, then publish/execute.”
- Allows multi-model critique of requirements without inventing mid-run peer chat in v1.

**Consequences:**
- New runtime objects for alignment transcripts / participant snapshots (may live beside or inside a draft Team Run).
- UI gains Align / Discuss flows in Team mode; Chat → Publish remains supported.
- Must not auto-start engine from multi-model chatter without human Goal Spec confirm.
