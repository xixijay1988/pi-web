# .team/ and git

Team Run project artifacts live under `<cwd>/.team/`.

## Recommendation

Treat `.team/` as **local run residue** unless your team explicitly wants plans/reviews in git.

Suggested project `.gitignore` entries:

```gitignore
# pi-web Team Run local artifacts (uncomment if you do not want them committed)
.team/steps/
.team/notes.md
# keep role overrides if you want team-shared role templates:
# !.team/roles.json
```

## Secrets risk

Roles may paste paths, logs, or env snippets into reports. Prefer not committing `.team/steps/**` by default.

Runtime truth remains under `$PI_CODING_AGENT_DIR/team-runs/` (outside the repo).
