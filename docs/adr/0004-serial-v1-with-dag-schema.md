# Serial execution in v1; keep dependency edges in the schema

Users eventually want parallel specialists; implementing parallel writers on a shared cwd early risks conflicts and explodes engine complexity.

**Decision:** v1 executes at most one running Plan Node at a time. Plan nodes still carry `deps[]` so a future parallel scheduler can honor the same Plan shape. Default feature graph is linear: architect → implement → test → review, with Orchestrator outside the chain for plan/replan.

**Why:** Proves multi-model role value without solving merge/worktree isolation. Matches "serial now, parallel later" product choice.

**Consequences:** Do not build UI that implies concurrent workers are live. Do not drop `deps` from types "because unused."
