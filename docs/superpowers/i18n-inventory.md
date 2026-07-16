# UI i18n Migration Inventory

**Date:** 2026-07-16
**Status:** Complete

The existing fixed application UI now supports English (`en`) and Simplified Chinese (`zh-CN`). The final sweep covered visible text, placeholders, tooltips, accessible labels, confirmations, client-generated status text, empty/loading states, and locale-aware dates/numbers.

## Completed Coverage

- Shell, Chat/Team navigation, theme/language controls, session information, export, branches, and system prompt UI
- Session sidebar, project picker, worktrees, session actions/badges, relative dates, empty/loading states, and Explorer
- Chat input, model/thinking/tool controls, commands, compaction, message actions, branches, tool results, and notices
- File tabs, viewer, previews, Markdown/Mermaid controls, downloads, and file-panel empty states
- Team creation, Goal Coach, Alignment Room/workspace, Timeline, role sessions, acceptance, rejection, and rework
- Models, providers, OAuth/API-key flows, Skills, Plugins, Roles, and related configuration dialogs
- English/Chinese dictionary parity, missing-key fallback, locale persistence, and `<html lang>` synchronization

## Intentional Exclusions

The following remain untranslated by design:

- Product and protocol names such as `Pi Agent Web`, `OAuth`, `Mermaid`, `skills.sh`, language/file-type badges, and version labels
- User, assistant, tool, session-history, Goal Spec, plan, report, artifact, and repository-file content
- Paths, filenames, commands, code, URLs, IDs, model/provider/skill/package names, and user-defined names
- Persisted Team Run status/event values and API contract fields
- Raw server/runtime/provider errors, stack traces, command output, and internal diagnostic sentinels
- Technical example values such as `/path/to/project`, `provider-name`, `model-id`, and API URLs

## Final Inventory Result

An AST sweep of `app/**/*.tsx` and `components/**/*.tsx`, plus targeted phrase searches, leaves only the intentional exclusions above. No remaining fixed English UI strings were identified.

## Verification

- `git diff --check`
- `node --test lib/i18n/i18n.test.mjs` — 13/13 passed
- `node --test lib/team-runs/team-runs.test.mjs` — 30/30 passed
- `node_modules/.bin/tsc --noEmit`
- targeted ESLint across all localized components and `lib/i18n`
- browser smoke in English and Simplified Chinese, including Chat, Team, Alignment workspace, Explorer, refresh persistence, and `<html lang>`
- fresh browser console check after reload — no warnings or errors

`npm run lint` still reports five pre-existing `@typescript-eslint/no-require-imports` errors in `desktop/main.js`; the localization paths are clean and this unrelated file was not changed.

Design: [`specs/2026-07-16-ui-i18n-design.md`](./specs/2026-07-16-ui-i18n-design.md)
