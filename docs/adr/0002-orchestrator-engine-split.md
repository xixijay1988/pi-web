# Server engine executes; Orchestrator LLM only plans

Automatic multi-role progress can be driven by (a) a peer channel of agents, (b) an orchestrator agent with spawn tools, or (c) a deterministic server state machine advised by an LLM planner.

**Decision:** v1 uses a server-side TeamRun Engine as the authority for lifecycle (dispatch, wait, validate, retry, replan, pause, budgets). The Orchestrator role only produces/rewrites Plan artifacts (and may write under `.team/`). It does not own session lifecycle or freely spawn workers via tools.

**Why:** In-process AgentSession already has idle timeout, missed end events, and hot-reload issues. Putting scheduling in an LLM tool loop makes crash recovery, exactly-once dispatch, and cost budgets much harder. A state machine matches pi-web's existing rpc-manager style.

**Consequences:** Engine code must be correct and well-tested; planning quality depends on Plan artifact schema + parser. Later peer mode (Raft-like) is a separate product mode, not a silent rewrite of this ADR.
