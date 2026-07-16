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

test("translates reported Roles and Explorer omissions", () => {
  assert.equal(translate("zh-CN", "roles.title"), "团队角色");
  assert.equal(translate("zh-CN", "roles.displayName"), "显示名称");
  assert.equal(translate("zh-CN", "files.explorer"), "资源管理器");
  assert.equal(translate("zh-CN", "files.insertPath"), "插入路径到聊天");
  assert.equal(translate("zh-CN", "session.new"), "新建");
});

test("unknown runtime keys do not crash the interface", () => {
  assert.equal(translate("zh-CN", "missing.runtime.key"), "missing.runtime.key");
});

test("translates Team timeline and alignment choices", () => {
  assert.equal(translate("zh-CN", "team.timeline.title"), "时间线");
  assert.equal(translate("zh-CN", "team.timeline.hardValidationFailed"), "强校验失败");
  assert.equal(translate("zh-CN", "team.choice.choose"), "请选择一个选项");
});

test("translates Team run creation and controls", () => {
  assert.equal(translate("zh-CN", "team.mode.newRun"), "新建团队任务");
  assert.equal(translate("zh-CN", "team.mode.openWorkspace"), "打开讨论工作区");
  assert.equal(translate("zh-CN", "team.mode.needsAttention"), "需要处理");
});

test("translates multi-seat Alignment Room", () => {
  assert.equal(translate("zh-CN", "team.room.title"), "多角色讨论室");
  assert.equal(translate("zh-CN", "team.room.nextTurn"), "下一角色发言");
  assert.equal(translate("zh-CN", "team.room.publish"), "发布并启动团队任务");
});

test("translates full-screen Alignment Workspace", () => {
  assert.equal(translate("zh-CN", "team.workspace.title"), "需求讨论");
  assert.equal(translate("zh-CN", "team.workspace.start"), "开始讨论");
  assert.equal(translate("zh-CN", "team.workspace.applyClose"), "应用到表单并关闭");
});
