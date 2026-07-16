# UI i18n Migration Inventory

**Date:** 2026-07-16
**Status:** In progress

This inventory tracks user-visible fixed strings. Regex counts are migration candidates, not guaranteed UI strings; code values, API fields, paths, model output, persisted user data, SVG attributes, and protocol constants remain explicit exclusions.

## Completed

- Global locale detection, persistence, dictionaries and two switchers
- AppShell Chat/Team, theme, sidebar and settings-cluster labels
- RolesConfig fixed UI chrome and field labels (`1b8aecc`)
- SessionSidebar primary New/Refresh/project picker labels
- Home Explorer title and refresh action
- FileExplorer loading/empty/mention/download UI
- Runtime missing translation keys no longer crash rendering

Role names, descriptions, system prompts, role IDs, model/provider names and tool preset values remain untranslated because they are editable or persisted configuration data.

## Remaining Priority

### P0 — primary daily UI

- `components/ChatInput.tsx`
- `components/ChatWindow.tsx`
- `components/MessageView.tsx`
- remaining `components/AppShell.tsx` labels such as Export, Branches and System prompt
- remaining `components/SessionSidebar.tsx` worktree/session actions and badges
- `components/FileViewer.tsx`
- `components/TabBar.tsx`

### P1 — Team workflow

- `components/TeamMode.tsx`
- `components/TeamAlignmentWorkspace.tsx`
- `components/TeamAlignmentRoom.tsx`
- `components/PublishTeamRunModal.tsx`
- `components/TeamGoalCoach.tsx`
- remaining `components/TeamAcceptancePanel.tsx` mixed English terminology
- `components/TeamTimeline.tsx`

### P1 — configuration dialogs

- `components/ModelsConfig.tsx`
- `components/PluginsConfig.tsx`
- `components/SkillsConfig.tsx`
- authentication/provider controls embedded in ModelsConfig

## Verification Rule

Every migrated batch must:

1. add representative failing translation assertions
2. keep English/Chinese dictionary key parity
3. run TypeScript and targeted ESLint
4. browser-smoke both locales for the changed page
5. update this inventory before claiming full UI coverage

Current execution plan: [`plans/2026-07-16-ui-i18n-shell-chat.md`](./plans/2026-07-16-ui-i18n-shell-chat.md)
