"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { encodeFilePathForApi } from "@/lib/file-paths";
import type { PlanNode, TeamRun } from "@/lib/team-runs/types";
import { MarkdownBody } from "./MarkdownBody";

type ArtifactCard = {
  key: string;
  title: string;
  path?: string;
  body?: string;
  missing?: boolean;
  error?: string;
};

type CheckState = "unchecked" | "pass" | "fail";

type EvidenceSummary = {
  changed: string[];
  testStatus?: "pass" | "fail" | "unknown";
  testBlurb?: string;
  reviewStatus?: "pass" | "fail" | "unknown";
  reviewBlurb?: string;
  primaryVerified?: boolean;
};

export function TeamAcceptancePanel({
  run,
  busy,
  onAccept,
  onReject,
  onOpenFile,
}: {
  run: TeamRun;
  busy?: boolean;
  onAccept: () => void;
  onReject: (feedback: string) => void;
  onOpenFile?: (path: string) => void;
}) {
  const [cards, setCards] = useState<ArtifactCard[]>([]);
  const [feedback, setFeedback] = useState("");
  const [checkState, setCheckState] = useState<Record<string, CheckState>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showEvidenceDrawer, setShowEvidenceDrawer] = useState(false);
  const ready = run.status === "awaiting_human_acceptance";
  const canRework = ready || run.status === "blocked";
  const teamRoot = run.cwd.replace(/\/$/, "");

  const checks = useMemo(() => {
    const fromSpec = run.goalSpec?.acceptanceChecks?.filter(Boolean) ?? [];
    const base = [
      {
        id: "primary_path",
        label: run.goalSpec?.primaryPath
          ? `按 Primary Path 打开并可用：${shortOneLine(run.goalSpec.primaryPath)}`
          : "按文档中的 Primary Path 打开并可用",
      },
      ...fromSpec.map((c, i) => ({ id: `ac_${i}`, label: c })),
    ];
    const seen = new Set<string>();
    return base.filter((c) => {
      const k = c.label.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [run.goalSpec]);

  useEffect(() => {
    setCheckState({});
    setExpandedKey(null);
    setShowEvidenceDrawer(false);
  }, [run.id, run.goal, run.goalSpec?.primaryPath]);

  useEffect(() => {
    let cancelled = false;
    const specs: Array<{ key: string; title: string; path?: string }> = [
      { key: "goal", title: "Goal Spec", path: `${teamRoot}/.team/goal-spec.md` },
      { key: "goal_fallback", title: "Goal", path: `${teamRoot}/.team/goal.md` },
      { key: "readme", title: "README", path: `${teamRoot}/README.md` },
      {
        key: "contract",
        title: "Contract",
        path: findArtifact(run, "architect") ?? findByName(run, "contract.md"),
      },
      {
        key: "change",
        title: "Change summary",
        path: findArtifact(run, "implementer") ?? findByName(run, "change-summary.md"),
      },
      {
        key: "test",
        title: "Test report",
        path: findArtifact(run, "tester") ?? findByName(run, "test-report.md"),
      },
      {
        key: "acceptance",
        title: "Reviewer verdict",
        path: findArtifact(run, "reviewer") ?? findByName(run, "acceptance.md"),
      },
    ];

    (async () => {
      const next: ArtifactCard[] = [];
      let goalSpecLoaded = false;
      for (const spec of specs) {
        if (!spec.path) {
          if (spec.key !== "readme") next.push({ ...spec, missing: true });
          continue;
        }
        if (spec.key === "goal_fallback" && goalSpecLoaded) continue;
        try {
          const res = await fetch(`/api/files/${encodeFilePathForApi(spec.path)}?type=read`);
          const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
          if (!res.ok) {
            if (spec.key === "goal" || spec.key === "readme") continue;
            next.push({
              ...spec,
              path: spec.path,
              missing: true,
              error: data.error ? `${data.error} (${res.status})` : `HTTP ${res.status}`,
            });
            continue;
          }
          if (spec.key === "goal") goalSpecLoaded = true;
          next.push({
            ...spec,
            title: spec.key === "goal" ? "Goal Spec" : spec.title,
            path: spec.path,
            body: typeof data.content === "string" ? data.content : undefined,
            missing: typeof data.content !== "string",
          });
        } catch (e) {
          if (spec.key === "goal" || spec.key === "readme") continue;
          next.push({
            ...spec,
            path: spec.path,
            missing: true,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      if (!cancelled) setCards(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [run, teamRoot]);

  const byKey = useMemo(() => {
    const m = new Map<string, ArtifactCard>();
    for (const c of cards) m.set(c.key, c);
    return m;
  }, [cards]);

  const changeBody = byKey.get("change")?.body ?? "";
  const readmeBody = byKey.get("readme")?.body ?? "";
  const testBody = byKey.get("test")?.body ?? "";
  const reviewBody = byKey.get("acceptance")?.body ?? "";

  const howToRun = useMemo(
    () =>
      extractHowToRun({
        primaryPath: run.goalSpec?.primaryPath,
        changeSummary: changeBody,
        readme: readmeBody,
        cwd: teamRoot,
      }),
    [run.goalSpec?.primaryPath, changeBody, readmeBody, teamRoot],
  );

  const evidence = useMemo(
    () =>
      buildEvidenceSummary({
        changeSummary: changeBody,
        testReport: testBody,
        reviewVerdict: reviewBody,
      }),
    [changeBody, testBody, reviewBody],
  );

  const reportLinks = useMemo(
    () =>
      [
        byKey.get("change"),
        byKey.get("test"),
        byKey.get("acceptance"),
        byKey.get("readme"),
        byKey.get("goal") ?? byKey.get("goal_fallback"),
        byKey.get("contract"),
      ].filter((c): c is ArtifactCard => Boolean(c && !c.missing && c.body)),
    [byKey],
  );

  const failedChecks = checks.filter((c) => checkState[c.id] === "fail");
  const allCheckedPass =
    checks.length > 0 && checks.every((c) => checkState[c.id] === "pass");
  const anyUnchecked = checks.some((c) => !checkState[c.id] || checkState[c.id] === "unchecked");

  const cycleCheck = (id: string) => {
    setCheckState((prev) => {
      const cur = prev[id] ?? "unchecked";
      const next: CheckState = cur === "unchecked" ? "pass" : cur === "pass" ? "fail" : "unchecked";
      return { ...prev, [id]: next };
    });
  };

  const buildReworkFeedback = () => {
    const parts: string[] = [];
    if (failedChecks.length) {
      parts.push("Failed Goal Spec checks:");
      for (const c of failedChecks) parts.push(`- ${c.label}`);
    }
    if (feedback.trim()) parts.push(feedback.trim());
    return parts.join("\n");
  };

  const openPath = (path?: string) => {
    if (path && onOpenFile) onOpenFile(path);
  };

  const expanded = expandedKey ? byKey.get(expandedKey) : undefined;

  return (
    <div
      style={{
        border: ready
          ? "1px solid color-mix(in srgb, var(--accent) 50%, var(--border))"
          : "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        background: ready
          ? "color-mix(in srgb, var(--accent) 5%, var(--bg-panel))"
          : "var(--bg-panel)",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            {ready
              ? "等待你的验收"
              : run.status === "done"
                ? "已验收完成"
                : run.status === "blocked"
                  ? "阻塞 — 可返工"
                  : `验收 · ${run.status}`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {ready
              ? "先按步骤打开成果，再勾选检查项。Agent 报告默认折叠，只在需要时查看。"
              : "主路径仍是运行与检查；完整报告按需展开。"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "right" }}>
          <div>工作目录</div>
          <code style={{ fontSize: 11, color: "var(--text)" }}>{shorten(teamRoot)}</code>
        </div>
      </div>

      {/* 1. How to run */}
      <section style={sectionBox}>
        <div style={sectionTitle}>1. 如何打开 / 运行成果</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.45 }}>
          在本机终端操作；以你浏览器里的实际结果为准，不要只信 Agent 报告。
        </div>
        {howToRun.lines.length > 0 ? (
          <ol style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
            {howToRun.lines.map((line, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {looksLikeCommand(line) ? <code style={codeInline}>{stripCodeTicks(line)}</code> : line}
              </li>
            ))}
          </ol>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
            未解析到运行步骤。可打开 README 或 Change summary。
          </div>
        )}
        {howToRun.warnings.length > 0 && (
          <div style={{ fontSize: 12, color: "#d97706", marginBottom: 8, lineHeight: 1.4 }}>
            {howToRun.warnings.map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {howToRun.urls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" style={linkBtn}>
              打开 {url}
            </a>
          ))}
          {onOpenFile && (
            <>
              <button type="button" style={secondaryBtn} onClick={() => openPath(teamRoot + "/README.md")}>
                打开 README
              </button>
              <button
                type="button"
                style={secondaryBtn}
                onClick={() => openPath(byKey.get("change")?.path)}
                disabled={!byKey.get("change")?.path}
              >
                打开 Change summary
              </button>
              <button type="button" style={secondaryBtn} onClick={() => openPath(teamRoot + "/package.json")}>
                打开 package.json
              </button>
            </>
          )}
        </div>
        {run.goalSpec?.primaryPath && (
          <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45 }}>
            <span style={{ color: "var(--text-muted)" }}>Primary Path：</span>
            <div style={{ whiteSpace: "pre-wrap", color: "var(--text)", marginTop: 4 }}>
              {run.goalSpec.primaryPath}
            </div>
          </div>
        )}
      </section>

      {/* 2. Checklist */}
      <section style={sectionBox}>
        <div style={sectionTitle}>2. 按 Goal Spec 逐项验收</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
          点击切换：未检 → 通过 → 失败。建议全部通过后再 Accept。
        </div>
        {checks.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>无结构化检查项 — 请结合 Goal Spec 自行判断。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checks.map((c) => {
              const st = checkState[c.id] ?? "unchecked";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => cycleCheck(c.id)}
                  style={{
                    textAlign: "left",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background:
                      st === "pass"
                        ? "color-mix(in srgb, #10b981 12%, var(--bg))"
                        : st === "fail"
                          ? "color-mix(in srgb, #ef4444 12%, var(--bg))"
                          : "var(--bg)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      flexShrink: 0,
                      fontWeight: 700,
                      color: st === "pass" ? "#10b981" : st === "fail" ? "#ef4444" : "var(--text-dim)",
                    }}
                  >
                    {st === "pass" ? "✓" : st === "fail" ? "✕" : "○"}
                  </span>
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Compact evidence — Plan A */}
      <section style={sectionBox}>
        <div style={sectionTitle}>3. 验收辅助（摘要，不是必读全文）</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.45 }}>
          这些信息帮助你决定，但不能替代你亲自打开成果。完整 Agent 报告默认折叠。
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <SummaryCard
            title="改动要点"
            tone="neutral"
            body={
              evidence.changed.length
                ? evidence.changed.map((x) => `• ${x}`).join("\n")
                : "暂无摘要 — 需要时可展开 Change summary"
            }
          />
          <SummaryCard
            title="测试结论"
            tone={evidence.testStatus === "pass" ? "good" : evidence.testStatus === "fail" ? "bad" : "neutral"}
            body={
              [
                evidence.testStatus ? `status: ${evidence.testStatus}` : "status: 未知",
                evidence.testBlurb,
              ]
                .filter(Boolean)
                .join("\n")
            }
          />
          <SummaryCard
            title="Reviewer 结论"
            tone={
              evidence.reviewStatus === "pass" ? "good" : evidence.reviewStatus === "fail" ? "bad" : "neutral"
            }
            body={
              [
                evidence.reviewStatus ? `status: ${evidence.reviewStatus}` : "status: 未知",
                evidence.primaryVerified === true
                  ? "primary_path_verified: true"
                  : evidence.primaryVerified === false
                    ? "primary_path_verified: 未确认"
                    : undefined,
                evidence.reviewBlurb,
              ]
                .filter(Boolean)
                .join("\n")
            }
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {reportLinks.slice(0, 4).map((c) => (
            <button
              key={c.key}
              type="button"
              style={secondaryBtn}
              onClick={() => {
                setShowEvidenceDrawer(true);
                setExpandedKey(c.key);
              }}
            >
              查看 {c.title}
            </button>
          ))}
          {onOpenFile && byKey.get("change")?.path && (
            <button type="button" style={linkBtn} onClick={() => openPath(byKey.get("change")?.path)}>
              文件面板打开 Change summary
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowEvidenceDrawer((v) => !v)}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {showEvidenceDrawer ? "收起完整报告 ▾" : "展开完整 Agent 报告（Markdown 渲染） ▸"}
        </button>

        {showEvidenceDrawer && (
          <div
            style={{
              marginTop: 10,
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--bg)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                padding: 8,
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-panel)",
              }}
            >
              {reportLinks.map((c) => {
                const on = expandedKey === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setExpandedKey(c.key)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: on ? "var(--accent)" : "transparent",
                      color: on ? "#fff" : "var(--text-muted)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {c.title}
                  </button>
                );
              })}
              {expanded?.path && onOpenFile && (
                <button type="button" style={{ ...linkBtn, marginLeft: "auto" }} onClick={() => openPath(expanded.path)}>
                  在文件面板打开
                </button>
              )}
            </div>
            <div style={{ maxHeight: 360, overflow: "auto", padding: 12 }}>
              {!expanded ? (
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>选择上方报告查看渲染内容。</div>
              ) : expanded.missing ? (
                <div style={{ fontSize: 12, color: "#ef4444" }}>{expanded.error || "文件缺失"}</div>
              ) : expanded.body ? (
                <div className="team-acceptance-md" style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
                  <MarkdownBody cwd={teamRoot} onOpenFile={onOpenFile}>
                    {expanded.body}
                  </MarkdownBody>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>无内容</div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 4. Decision */}
      <section style={sectionBox}>
        <div style={sectionTitle}>4. 你的决定</div>
        {ready && anyUnchecked && checks.length > 0 && (
          <div style={{ fontSize: 12, color: "#d97706", marginBottom: 8 }}>
            还有未勾选的检查项 — 建议先全部点一遍再 Accept。
          </div>
        )}
        {failedChecks.length > 0 && (
          <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>
            已标记失败 {failedChecks.length} 项 — 请用 Rework 并写清问题。
          </div>
        )}
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Rework 时填写：哪里不对、期望行为、复现步骤…"
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            padding: 10,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 13,
            marginBottom: 10,
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            disabled={busy || !ready || failedChecks.length > 0}
            title={
              !ready
                ? "仅在 awaiting_human_acceptance 时可 Accept"
                : failedChecks.length
                  ? "有失败检查项时请 Rework"
                  : allCheckedPass
                    ? "确认 Goal Spec 检查均通过"
                    : "建议先勾选检查项"
            }
            onClick={() => onAccept()}
            style={{
              ...primaryBtn,
              opacity: busy || !ready || failedChecks.length > 0 ? 0.5 : 1,
              cursor: busy || !ready || failedChecks.length > 0 ? "not-allowed" : "pointer",
            }}
          >
            Accept — 验收通过
          </button>
          <button
            type="button"
            disabled={busy || !canRework || (!feedback.trim() && failedChecks.length === 0)}
            onClick={() => {
              const text = buildReworkFeedback();
              if (!text.trim()) return;
              onReject(text);
            }}
            style={{
              ...dangerBtn,
              opacity: busy || !canRework || (!feedback.trim() && failedChecks.length === 0) ? 0.5 : 1,
              cursor:
                busy || !canRework || (!feedback.trim() && failedChecks.length === 0)
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            Reject & rework
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.4 }}>
          Rework 会把反馈注入后续 implement → test → review。Accept 将 Team Run 标为 done。
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "good" | "bad" | "neutral";
}) {
  const border =
    tone === "good"
      ? "color-mix(in srgb, #10b981 35%, var(--border))"
      : tone === "bad"
        ? "color-mix(in srgb, #ef4444 35%, var(--border))"
        : "var(--border)";
  const bg =
    tone === "good"
      ? "color-mix(in srgb, #10b981 8%, var(--bg))"
      : tone === "bad"
        ? "color-mix(in srgb, #ef4444 8%, var(--bg))"
        : "var(--bg)";
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: 10, background: bg, minHeight: 88 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{body}</div>
    </div>
  );
}

function buildEvidenceSummary(input: {
  changeSummary: string;
  testReport: string;
  reviewVerdict: string;
}): EvidenceSummary {
  const changed: string[] = [];
  const whatChanged =
    extractSection(input.changeSummary, /what changed|changes|改动|变更/i) ||
    extractSection(input.changeSummary, /added|新增/i);
  if (whatChanged) {
    for (const line of whatChanged.split(/\n/)) {
      const t = line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim();
      if (!t || t.length < 8 || /^#/.test(t) || t.startsWith("|")) continue;
      changed.push(shortOneLine(t));
      if (changed.length >= 4) break;
    }
  }
  if (changed.length === 0 && input.changeSummary.trim()) {
    const first = input.changeSummary
      .split(/\n/)
      .map((l) => l.replace(/^#+\s*/, "").trim())
      .find((l) => l.length > 20 && !l.startsWith("---"));
    if (first) changed.push(shortOneLine(first));
  }

  const testStatus = detectStatus(input.testReport);
  const testBlurb = firstUsefulLine(
    extractSection(input.testReport, /summary|结论|result|environments?|primary/i) || input.testReport,
  );

  const reviewStatus = detectStatus(input.reviewVerdict);
  const primaryVerified = /primary_path_verified\s*:\s*true/i.test(input.reviewVerdict)
    ? true
    : /primary_path_verified\s*:\s*false/i.test(input.reviewVerdict)
      ? false
      : undefined;
  const reviewBlurb = firstUsefulLine(
    input.reviewVerdict
      .replace(/^---[\s\S]*?---\s*/m, "")
      .split(/\n/)
      .filter((l) => !/^\s*status\s*:/i.test(l) && !/primary_path_verified/i.test(l))
      .join("\n"),
  );

  return {
    changed,
    testStatus,
    testBlurb: testBlurb ? shortOneLine(testBlurb) : undefined,
    reviewStatus,
    reviewBlurb: reviewBlurb ? shortOneLine(reviewBlurb) : undefined,
    primaryVerified,
  };
}

function detectStatus(text: string): "pass" | "fail" | "unknown" {
  if (!text.trim()) return "unknown";
  if (/(?:^|\n)\s*status\s*:\s*pass\s*(?:\n|$)/i.test(text)) return "pass";
  if (/(?:^|\n)\s*status\s*:\s*fail\s*(?:\n|$)/i.test(text)) return "fail";
  if (/\bPASS\b/.test(text) && !/\bFAIL\b/.test(text)) return "pass";
  if (/\bFAIL\b/.test(text)) return "fail";
  return "unknown";
}

function firstUsefulLine(text: string): string | undefined {
  for (const line of text.split(/\n/)) {
    const t = line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim();
    if (!t || t.length < 12) continue;
    if (/^#/.test(t) || t.startsWith("|") || t.startsWith("---") || t.startsWith("```")) continue;
    return t;
  }
  return undefined;
}

function extractHowToRun(input: {
  primaryPath?: string;
  changeSummary: string;
  readme: string;
  cwd: string;
}): { lines: string[]; urls: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const urls = new Set<string>();
  const lines: string[] = [];

  const section =
    extractSection(input.changeSummary, /how to (open|run)|primary path|run\b|open\b/i) ||
    extractSection(input.readme, /how to (open|run)|getting started|quick start|primary path|使用|运行/i) ||
    "";

  const source = section || input.primaryPath || "";
  const rawLines = source
    .split(/\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]\s*|[-*]\s*)/, "").trim())
    .filter(Boolean)
    .filter((l) => !/^#+/.test(l) && !/^\|/.test(l));

  for (const l of rawLines) {
    const urlMatch = l.match(/https?:\/\/[^\s)`"']+/g);
    if (urlMatch) urlMatch.forEach((u) => urls.add(u.replace(/[.,;]+$/, "")));
    if (
      /npm |pnpm |yarn |npx |bun |http:\/\/|https:\/\/|localhost|cd |open |打开|浏览器|install|run dev|serve/i.test(
        l,
      ) ||
      lines.length < 6
    ) {
      if (!lines.includes(l)) lines.push(l);
    }
  }

  if (lines.length === 0 && input.primaryPath) {
    lines.push(...input.primaryPath.split(/\n/).map((s) => s.trim()).filter(Boolean).slice(0, 6));
  }

  if (lines.length === 0) {
    lines.push(`cd ${shorten(input.cwd)}`);
    lines.push("查看 README / package.json 中的启动脚本（常见：npm install && npm run dev）");
  } else if (!lines.some((l) => /cd |工作目录|project root|项目/i.test(l))) {
    lines.unshift(`进入目录：${shorten(input.cwd)}`);
  }

  if (/file:\/\//i.test(source) || /double-click|双击/i.test(source)) {
    warnings.push("文档提到 file:// 或双击打开 — 若项目使用 ES modules，请优先用本地 HTTP（如 npm run dev）。");
  }
  if (
    /do not.*file:\/\//i.test(source) ||
    /不要.*file:\/\//i.test(source) ||
    /Do not.*file:\/\//i.test(input.changeSummary)
  ) {
    warnings.push("实现方明确要求：不要用 file:// 打开。");
  }

  return { lines: lines.slice(0, 8), urls: [...urls], warnings };
}

function extractSection(md: string, titleRe: RegExp): string {
  if (!md.trim()) return "";
  const lines = md.split(/\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,3}\s+(.*)$/);
    if (m && titleRe.test(m[1])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return "";
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,3}\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

function looksLikeCommand(line: string): boolean {
  return /^(npm |pnpm |yarn |npx |bun |cd |node |vite\b)/i.test(line) || /`[^`]+`/.test(line);
}

function stripCodeTicks(line: string): string {
  return line.replace(/`/g, "");
}

function shortOneLine(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

function shorten(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function findArtifact(run: TeamRun, roleId: string): string | undefined {
  const node = run.plan.nodes.find((n) => n.roleId === roleId);
  return node?.artifactPaths?.[node.artifactPaths.length - 1];
}

function findByName(run: TeamRun, fileName: string): string | undefined {
  for (const n of run.plan.nodes as PlanNode[]) {
    const hit = n.artifactPaths?.find((p) => p.endsWith(fileName));
    if (hit) return hit;
  }
  return undefined;
}

const sectionBox: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 14,
  background: "var(--bg)",
  marginBottom: 12,
};

const sectionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
  color: "var(--text)",
};

const codeInline: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "1px 6px",
  borderRadius: 4,
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
};

const linkBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 7,
  border: "1px solid color-mix(in srgb, var(--accent) 40%, var(--border))",
  background: "color-mix(in srgb, var(--accent) 10%, var(--bg))",
  color: "var(--accent)",
  fontSize: 12,
  textDecoration: "none",
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  ...linkBtn,
  border: "1px solid var(--border)",
  background: "var(--bg-panel)",
  color: "var(--text-muted)",
};

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 650,
};

const dangerBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid rgba(239,68,68,0.45)",
  background: "rgba(239,68,68,0.08)",
  color: "#ef4444",
  fontSize: 13,
  fontWeight: 650,
};
