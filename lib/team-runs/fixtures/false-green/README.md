# False-green regression fixtures

These Markdown artifact pairs encode the original Todo failure mode:

- the real human Primary Path is opening `index.html` through `file://`
- only a secondary HTTP development-server path is exercised
- generic green language must not satisfy Primary Path evidence
- a reviewer must independently re-check the Primary Path, not repeat tester claims

Fixture sets:

- `todo-http-only/` must fail hard validation
- `todo-primary-verified/` must pass hard validation

Keep fixtures as realistic role artifacts. Tests should call the production artifact validators rather than duplicate validation logic.
