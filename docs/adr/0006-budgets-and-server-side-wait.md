# Budgets and server-side completion are mandatory

Autonomous multi-step agents can loop and burn tokens. Browser tabs drop SSE. pi sessions idle-destroy after 10 minutes.

**Decision:** Every Team Run carries budgets (`maxAttemptsPerNode`, `maxReplans`, `maxRunDurationMs`). The engine waits for role completion on the server via subscription plus reconciliation, keyed by `dispatchId`, and rehydrates sessions from `sessionId`/`sessionFile` after idle destroy. Event timeline is part of the engine delivery, not a later nice-to-have.

**Why:** Expert review treated missing budgets, frontend-driven loops, and timeline deferral as ship blockers for an unattended product.

**Consequences:** Slightly more engine code up front; UI must surface budget counters and blocked reasons. Soft pause vs hard cancel semantics are required.
