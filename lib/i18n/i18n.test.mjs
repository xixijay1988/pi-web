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
