# Team Run as a layer beside Chat, not a rewrite of pi sessions

pi-web is a UI over pi's single-session AgentSession + jsonl files. We need multi-role multi-model organization without forking the pi session format or replacing single Chat.

**Decision:** Introduce Team Run as an incremental product/runtime layer: new store under the agent dir, new engine, new Team mode UI. Role work still uses ordinary pi sessions created for the run. Existing Chat mode remains first-class and unchanged in semantics.

**Why:** Reusing AgentSession preserves tools, streaming, models, and auth. Polluting jsonl headers with multi-role graphs would couple us to pi file migrations and break simple session browsing.

**Consequences:** Two mental models (Chat vs Team) must stay clearly separated in UI. Session list filtering/grouping becomes mandatory so Team sticky sessions do not drown Chat history.
