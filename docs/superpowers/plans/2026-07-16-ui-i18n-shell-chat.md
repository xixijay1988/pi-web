# Shell, Chat, and Files i18n Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the remaining application shell, session/sidebar, Chat, tab, file explorer, and file viewer UI into English and Simplified Chinese using the shipped locale foundation.

**Architecture:** Extend the existing exact-parity dictionaries with domain-prefixed keys, then migrate components in small ownership batches. Stored values, paths, model/provider names, session content, commands, API payloads, and unknown error details remain unchanged.

**Tech Stack:** React 19, Next.js 16, TypeScript, existing `useI18n()`, Node test runner, ESLint, in-app browser smoke tests.

---

### Task 1: AppShell and Session Sidebar

**Files:**
- Modify: `lib/i18n/dictionaries/en.ts`
- Modify: `lib/i18n/dictionaries/zh-CN.ts`
- Modify: `components/AppShell.tsx`
- Modify: `components/SessionSidebar.tsx`
- Modify: `components/BranchNavigator.tsx`
- Test: `lib/i18n/i18n.test.mjs`

- [ ] Add failing translation assertions for representative keys:

```js
assert.equal(translate("zh-CN", "session.new"), "新建");
assert.equal(translate("zh-CN", "session.refresh"), "刷新");
assert.equal(translate("zh-CN", "session.branches"), "分支");
```

- [ ] Run `node --test lib/i18n/i18n.test.mjs` and confirm missing-key failure.
- [ ] Add exact-parity keys for remaining AppShell tooltips/panels, project selection, session actions, export, branches, system prompt, loading/empty states, relative-time suffixes, and sidebar confirmations.
- [ ] Replace fixed strings with `t()` while preserving session names, paths, timestamps, IDs, API errors, and exported content.
- [ ] Pass the active locale to `toLocaleString` / `toLocaleTimeString` calls touched in these components.
- [ ] Run tests, TypeScript, and targeted ESLint.
- [ ] Commit with `git commit -m "Translate shell and session navigation"`.

### Task 2: Chat Window and Message Controls

**Files:**
- Modify: `lib/i18n/dictionaries/en.ts`
- Modify: `lib/i18n/dictionaries/zh-CN.ts`
- Modify: `components/ChatWindow.tsx`
- Modify: `components/ChatInput.tsx`
- Modify: `components/MessageView.tsx`
- Modify: `components/ChatMinimap.tsx`
- Modify: `hooks/useAgentSession.ts`
- Test: `lib/i18n/i18n.test.mjs`

- [ ] Add failing assertions for Send, Stop, Compact, reasoning level, tool preset, attachment, queue/interruption, retry, copied, streaming, compaction, and empty-chat keys.
- [ ] Run the i18n test and verify RED.
- [ ] Add English/Chinese keys with variables for counts and dynamic context, for example:

```ts
"chat.attachments.count": "{count} attachments"
"chat.queue.afterRun": "Queue this message after the agent finishes"
"chat.compaction.running": "Compacting context…"
```

- [ ] Migrate fixed labels, placeholders, titles, accessible labels, confirmation text, and client-generated errors.
- [ ] Keep user/assistant/tool content, model output, tool names, command output, code, token values, costs, and unknown runtime errors in their original form.
- [ ] Replace displayed internal levels/statuses with translation mappings without changing command payload values.
- [ ] Run existing chat/session tests, i18n tests, TypeScript, and targeted ESLint.
- [ ] Commit with `git commit -m "Translate Chat controls"`.

### Task 3: Tabs, File Explorer, and File Viewer

**Files:**
- Modify: `lib/i18n/dictionaries/en.ts`
- Modify: `lib/i18n/dictionaries/zh-CN.ts`
- Modify: `components/TabBar.tsx`
- Modify: `components/FileExplorer.tsx`
- Modify: `components/FileViewer.tsx`
- Modify: `components/FileIcons.tsx` only if it renders text
- Test: `lib/i18n/i18n.test.mjs`

- [ ] Add failing assertions for Explorer, refresh, insert path, download, preview/loading/error states, wrapping, live sync, HTML preview, unsupported types, and panel controls.
- [ ] Run the i18n test and verify RED.
- [ ] Add exact-parity file/navigation keys.
- [ ] Migrate fixed UI text while preserving file names, paths, contents, MIME types, URLs, size values, and server error bodies.
- [ ] For errors, prepend translated context only when the UI currently adds context; do not rewrite raw API details.
- [ ] Run file-related tests, i18n tests, TypeScript, and targeted ESLint.
- [ ] Commit with `git commit -m "Translate file navigation and previews"`.

### Task 4: Shell/Chat/Files Inventory and Smoke Validation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-ui-i18n-design.md`
- Create: `docs/superpowers/plans/2026-07-16-ui-i18n-team-settings.md`

- [ ] Run a user-visible string inventory across migrated files:

```bash
rg -n '"[A-Z][A-Za-z][^"\\n]{2,}"|>[A-Z][A-Za-z ]+<' \
  components/AppShell.tsx components/SessionSidebar.tsx components/BranchNavigator.tsx \
  components/ChatWindow.tsx components/ChatInput.tsx components/MessageView.tsx \
  components/ChatMinimap.tsx components/TabBar.tsx components/FileExplorer.tsx components/FileViewer.tsx
```

- [ ] Classify every result as translated UI or an explicit exclusion such as code, protocol value, identifier, path, model output, or SVG data.
- [ ] Run:

```bash
git diff --check
node --test lib/i18n/i18n.test.mjs
node --test lib/session-reader.test.mjs lib/message-display.test.mjs lib/file-types.test.mjs lib/file-links.test.mjs
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint components/AppShell.tsx components/SessionSidebar.tsx components/BranchNavigator.tsx components/ChatWindow.tsx components/ChatInput.tsx components/MessageView.tsx components/ChatMinimap.tsx components/TabBar.tsx components/FileExplorer.tsx components/FileViewer.tsx hooks/useAgentSession.ts lib/i18n
```

- [ ] Browser-smoke English and Chinese navigation, Chat controls, file explorer, file preview, refresh persistence, and mobile toolbar layout.
- [ ] Update the design implementation status with commits and residual untranslated domains.
- [ ] Write the next detailed plan for Team, Alignment, Models, Skills, Plugins, Roles, providers, and authentication.
- [ ] Commit and push the handoff documentation.
