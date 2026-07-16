import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  detectBrowserLocale,
  normalizeLocale,
  resolveInitialLocale,
} = await jiti.import("./locale.ts");
const { interpolate } = await jiti.import("./interpolate.ts");
const { dictionaries, translate, translationKeys } = await jiti.import("./index.ts");

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

test("English and Chinese dictionaries have identical keys", () => {
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries["zh-CN"]).sort());
});

test("translates and falls back to English", () => {
  assert.equal(translate("zh-CN", "navigation.chat"), "聊天");
  assert.equal(translate("en", "common.failedCount", { count: 2 }), "Failed 2 items");
  assert.ok(translationKeys.includes("settings.language"));
});
