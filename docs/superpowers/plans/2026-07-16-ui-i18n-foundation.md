# UI i18n Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the English/Simplified Chinese locale foundation, browser detection, persisted user override, and language controls in both the top toolbar and sidebar settings cluster.

**Architecture:** A small typed dictionary registry supplies `TranslationKey` values to a client `LocaleProvider`. Pure locale/interpolation helpers remain framework-independent and unit tested; `useI18n()` exposes the selected locale, `setLocale`, and `t()` to UI components. This first slice translates only the new language controls and the adjacent AppShell labels it touches; later plans migrate all remaining UI domains.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, existing inline-style component patterns, `localStorage`.

---

## File Structure

- Create `lib/i18n/locale.ts`: locale normalization, browser detection, persisted preference resolution.
- Create `lib/i18n/interpolate.ts`: deterministic `{variable}` replacement.
- Create `lib/i18n/dictionaries/en.ts`: initial English keys for shared language/navigation controls.
- Create `lib/i18n/dictionaries/zh-CN.ts`: exact Simplified Chinese key parity.
- Create `lib/i18n/index.ts`: typed dictionary registry, fallback lookup and translation function.
- Create `lib/i18n/i18n.test.mjs`: pure unit tests for detection, precedence, interpolation, parity and fallback.
- Create `components/LocaleProvider.tsx`: client locale state, hydration, persistence and `<html lang>` synchronization.
- Create `hooks/useI18n.ts`: stable consumer hook re-exporting the provider context.
- Create `components/LanguageSwitcher.tsx`: shared compact/full language control.
- Modify `app/layout.tsx`: wrap application children with `LocaleProvider`.
- Modify `components/AppShell.tsx`: render top-toolbar and sidebar-footer language controls; translate adjacent Chat/Team/settings/theme/sidebar labels.

---

### Task 1: Pure Locale and Interpolation Helpers

**Files:**
- Create: `lib/i18n/locale.ts`
- Create: `lib/i18n/interpolate.ts`
- Create: `lib/i18n/i18n.test.mjs`

- [ ] **Step 1: Write failing locale/interpolation tests**

Create `lib/i18n/i18n.test.mjs` with assertions covering Chinese locale normalization, English fallback, stored preference precedence, invalid stored values, and interpolation:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  detectBrowserLocale,
  normalizeLocale,
  resolveInitialLocale,
} from "./locale.ts";
import { interpolate } from "./interpolate.ts";

test("normalizes Chinese browser locales and falls back to English", () => {
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeLocale("zh-Hans-SG"), "zh-CN");
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("invalid"), null);
});

test("stored locale overrides browser detection", () => {
  assert.equal(resolveInitialLocale("en", ["zh-CN"]), "en");
  assert.equal(resolveInitialLocale("broken", ["zh-CN"]), "zh-CN");
  assert.equal(detectBrowserLocale(["fr-FR", "en-US"]), "en");
});

test("interpolates known variables and leaves unknown tokens visible", () => {
  assert.equal(interpolate("Failed {count} items", { count: 2 }), "Failed 2 items");
  assert.equal(interpolate("Hello {name}", {}), "Hello {name}");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test lib/i18n/i18n.test.mjs
```

Expected: FAIL because `locale.ts` and `interpolate.ts` do not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Create `lib/i18n/locale.ts`:

```ts
export type Locale = "en" | "zh-CN";

export const LOCALE_STORAGE_KEY = "pi-locale";

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  return null;
}

export function detectBrowserLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale === "zh-CN") return locale;
  }
  return "en";
}

export function resolveInitialLocale(
  storedValue: unknown,
  browserLanguages: readonly string[],
): Locale {
  return normalizeLocale(storedValue) ?? detectBrowserLocale(browserLanguages);
}
```

Create `lib/i18n/interpolate.ts`:

```ts
export type TranslationVariables = Record<string, string | number>;

export function interpolate(template: string, variables: TranslationVariables = {}): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : token,
  );
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run `node --test lib/i18n/i18n.test.mjs`.

Expected: 3 tests pass.

- [ ] **Step 5: Commit the helper slice**

```bash
git add lib/i18n/locale.ts lib/i18n/interpolate.ts lib/i18n/i18n.test.mjs
git commit -m "Add locale detection helpers"
```

---

### Task 2: Typed Dictionaries and Translation Fallback

**Files:**
- Create: `lib/i18n/dictionaries/en.ts`
- Create: `lib/i18n/dictionaries/zh-CN.ts`
- Create: `lib/i18n/index.ts`
- Modify: `lib/i18n/i18n.test.mjs`

- [ ] **Step 1: Extend tests for parity, fallback and translation**

Append tests that import `dictionaries`, `translate`, and `translationKeys`:

```js
test("English and Chinese dictionaries have identical keys", () => {
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries["zh-CN"]).sort());
});

test("translates and falls back to English", () => {
  assert.equal(translate("zh-CN", "navigation.chat"), "聊天");
  assert.equal(translate("en", "common.failedCount", { count: 2 }), "Failed 2 items");
  assert.ok(translationKeys.includes("settings.language"));
});
```

- [ ] **Step 2: Run test and verify RED**

Run `node --test lib/i18n/i18n.test.mjs`.

Expected: FAIL because dictionary modules and translation functions do not exist.

- [ ] **Step 3: Add the initial exact-parity dictionaries**

Create English keys for:

```ts
export const en = {
  "common.failedCount": "Failed {count} items",
  "navigation.chat": "Chat",
  "navigation.team": "Team",
  "navigation.chatMode": "Chat mode",
  "navigation.teamMode": "Team mode",
  "navigation.hideSidebar": "Hide sidebar",
  "navigation.showSidebar": "Show sidebar",
  "settings.models": "Models",
  "settings.skills": "Skills",
  "settings.plugins": "Plugins",
  "settings.roles": "Roles",
  "settings.language": "Interface language",
  "settings.switchToEnglish": "Switch to English",
  "settings.switchToChinese": "Switch to Simplified Chinese",
  "settings.english": "English",
  "settings.chinese": "Simplified Chinese",
  "theme.switchToLight": "Switch to light mode",
  "theme.switchToDark": "Switch to dark mode",
} as const;

export type TranslationKey = keyof typeof en;
```

Create `zh-CN.ts` with the same keys and full Chinese terminology:

```ts
import type { TranslationKey } from "./en";

export const zhCN = {
  "common.failedCount": "失败 {count} 项",
  "navigation.chat": "聊天",
  "navigation.team": "团队",
  "navigation.chatMode": "聊天模式",
  "navigation.teamMode": "团队模式",
  "navigation.hideSidebar": "隐藏侧边栏",
  "navigation.showSidebar": "显示侧边栏",
  "settings.models": "模型",
  "settings.skills": "技能",
  "settings.plugins": "插件",
  "settings.roles": "角色",
  "settings.language": "界面语言",
  "settings.switchToEnglish": "切换为英文",
  "settings.switchToChinese": "切换为简体中文",
  "settings.english": "英文",
  "settings.chinese": "简体中文",
  "theme.switchToLight": "切换为浅色模式",
  "theme.switchToDark": "切换为深色模式",
} satisfies Record<TranslationKey, string>;
```

Implement `lib/i18n/index.ts` synchronously:

```ts
import { en, type TranslationKey } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";
import { interpolate, type TranslationVariables } from "./interpolate";
import type { Locale } from "./locale";

export type { Locale } from "./locale";
export type { TranslationKey } from "./dictionaries/en";

export const dictionaries = { en, "zh-CN": zhCN } satisfies Record<Locale, Record<TranslationKey, string>>;
export const translationKeys = Object.keys(en) as TranslationKey[];

export function translate(locale: Locale, key: TranslationKey, variables?: TranslationVariables): string {
  return interpolate(dictionaries[locale][key] ?? en[key], variables);
}
```

- [ ] **Step 4: Run tests and typecheck**

```bash
node --test lib/i18n/i18n.test.mjs
node_modules/.bin/tsc --noEmit
```

Expected: dictionary tests pass and TypeScript reports no key mismatch.

- [ ] **Step 5: Commit dictionaries**

```bash
git add lib/i18n
git commit -m "Add typed English and Chinese dictionaries"
```

---

### Task 3: Locale Provider and Hook

**Files:**
- Create: `components/LocaleProvider.tsx`
- Create: `hooks/useI18n.ts`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Implement the provider context**

Create a client provider exposing:

```ts
type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, variables?: TranslationVariables) => string;
};
```

Use `useState<Locale>("en")`, then in `useEffect` read `localStorage.getItem(LOCALE_STORAGE_KEY)` and browser languages, call `resolveInitialLocale`, and update state plus `document.documentElement.lang`. `setLocale` must update state, `document.documentElement.lang`, and best-effort localStorage immediately. Memoize the context value.

Export `useLocaleContext()` from the provider and make `hooks/useI18n.ts` a small wrapper:

```ts
"use client";

export { useLocaleContext as useI18n } from "@/components/LocaleProvider";
```

- [ ] **Step 2: Wrap the root layout**

Import `LocaleProvider` in `app/layout.tsx` and replace `{children}` with:

```tsx
<LocaleProvider>{children}</LocaleProvider>
```

Keep `lang="en"`, `translate="no"`, theme bootstrap, fonts, and `suppressHydrationWarning` unchanged; the provider updates `lang` after hydration.

- [ ] **Step 3: Run typecheck and targeted lint**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint components/LocaleProvider.tsx hooks/useI18n.ts app/layout.tsx
```

Expected: no errors.

- [ ] **Step 4: Commit provider wiring**

```bash
git add components/LocaleProvider.tsx hooks/useI18n.ts app/layout.tsx
git commit -m "Add global locale provider"
```

---

### Task 4: Shared Language Controls and AppShell Integration

**Files:**
- Create: `components/LanguageSwitcher.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Create the shared switcher**

Implement `LanguageSwitcher` with `variant: "toolbar" | "settings"`. It reads `locale`, `setLocale`, and `t` from `useI18n()` and toggles between `en` and `zh-CN`.

Toolbar behavior:

```tsx
const nextLocale = locale === "en" ? "zh-CN" : "en";
const label = locale === "en" ? "中文" : "English";
const accessibleLabel = locale === "en"
  ? t("settings.switchToChinese")
  : t("settings.switchToEnglish");
```

Match the existing 36px top-toolbar button styling. The settings variant matches the sidebar footer buttons, displays a language/globe icon, and shows the current language using `settings.english` / `settings.chinese`.

- [ ] **Step 2: Integrate the top-toolbar control**

In `AppShell`, render `<LanguageSwitcher variant="toolbar" />` immediately before the theme button so language and appearance controls stay adjacent.

- [ ] **Step 3: Integrate the settings-cluster control**

The current footer is optimized for four equal buttons. Keep those buttons unchanged and add a second compact row below them containing:

```tsx
<LanguageSwitcher variant="settings" />
```

This avoids squeezing five text buttons into one row and preserves mobile hit targets.

- [ ] **Step 4: Translate adjacent AppShell labels**

Call `const { t } = useI18n()` in `AppShell` and replace only the strings touched by this slice:

- Chat / Team labels and tooltips
- Hide / Show sidebar labels
- Models / Skills / Plugins / Roles footer labels
- light/dark theme labels

Do not migrate unrelated AppShell strings in this task; later migration plans own the full sweep.

- [ ] **Step 5: Validate the UI slice**

```bash
node --test lib/i18n/i18n.test.mjs
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint components/LanguageSwitcher.tsx components/AppShell.tsx
```

Expected: all tests and static checks pass.

- [ ] **Step 6: Commit controls**

```bash
git add components/LanguageSwitcher.tsx components/AppShell.tsx
git commit -m "Add interface language controls"
```

---

### Task 5: Foundation Verification and Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-ui-i18n-design.md`
- Create: `docs/superpowers/plans/2026-07-16-ui-i18n-shell-chat.md`

- [ ] **Step 1: Run final foundation verification**

```bash
git diff --check
node --test lib/i18n/i18n.test.mjs
node --test lib/team-runs/team-runs.test.mjs
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint app/layout.tsx components/AppShell.tsx components/LocaleProvider.tsx components/LanguageSwitcher.tsx hooks/useI18n.ts lib/i18n
```

Expected: all commands pass.

- [ ] **Step 2: Manually smoke the two entry points**

Run `npm run dev`, then verify:

1. With no `pi-locale`, a Chinese browser switches to Chinese after hydration.
2. Both top toolbar and sidebar footer change language immediately.
3. Refresh preserves the explicit selection.
4. `<html lang>` matches the selected locale.
5. Theme switching, Chat/Team switching, and footer configuration buttons still work.

- [ ] **Step 3: Update the design status**

Change the design status to `Foundation shipped; full UI migration in progress` and add the foundation commit hashes plus the next migration plan path.

- [ ] **Step 4: Write the next migration plan**

Create `docs/superpowers/plans/2026-07-16-ui-i18n-shell-chat.md` covering AppShell remainder, SessionSidebar, ChatWindow, ChatInput, tabs, file explorer and file viewer using the same TDD/parity rules.

- [ ] **Step 5: Commit and push the handoff**

```bash
git add docs/superpowers
git commit -m "Document i18n foundation handoff"
git push origin dev
```
