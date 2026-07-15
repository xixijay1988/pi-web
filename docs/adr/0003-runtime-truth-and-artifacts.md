# Split runtime truth from project artifacts

Multi-role runs need both machine-authoritative state and human-readable handoffs in the repo working tree.

**Decision:** Runtime truth is `$PI_CODING_AGENT_DIR/team-runs/<id>.json` (status, plan nodes, session refs, budgets, events). Project artifacts are `<cwd>/.team/**` (goal, plan.md, notes, versioned step outputs). Engine advances only on hard validation of artifacts plus run JSON transitions.

**Why:** Session files are the wrong place for multi-node graphs. Pure in-repo state couples run control plane to git dirty state and multi-machine paths. Pure agent-dir state hides handoffs from humans and git. The split matches "D" handoff decision from design.

**Consequences:** Non-transactional dual write; run JSON is authoritative on conflict. Artifact content hashes should be recorded on validation. `.team/` git policy is user-choice but docs should warn about secrets.
