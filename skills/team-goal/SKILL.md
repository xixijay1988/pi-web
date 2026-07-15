---
name: team-goal
description: After discussing requirements (e.g. with grill-me), produce a Goal Spec ready to publish into a Team Run.
---

# Team Goal (Chat → Team)

Use this after the human has clarified the work (often via `/grill-me` or a design discussion).

## Goal

Produce a **strong Goal Spec** the human can **Publish to Team**:

1. **Outcome** — what exists when done
2. **Primary Path** — exactly how a *human* opens/uses the result (file:// / double-click / `npx serve` / app URL — not only a hidden dev path)
3. **≥3 acceptance checks** — observable by a human without reading code
4. Optional **Constraints** / **Out of Scope**

## Anti false-green

- Pin the real human path (e.g. static `index.html` vs local server vs monorepo app).
- Call out environment risks (ES modules on `file://`, CORS, localStorage, auth).
- Checks must be black-box.

## Output (required)

When ready, emit **exactly one** fenced block the app can parse:

```goal_spec
## Outcome
...

## Primary Path
...

## Acceptance Checks
1. ...
2. ...
3. ...

## Constraints
...

## Out of Scope
...
```

Then tell the human:

> Click **Publish to Team** above the chat input, review the form, then **Confirm & start Team Run**.

Do **not** implement the feature in this skill. Do **not** start a Team Run yourself.
