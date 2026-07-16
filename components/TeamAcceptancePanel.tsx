"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { encodeFilePathForApi } from "@/lib/file-paths";
import type { PlanNode, TeamRun } from "@/lib/team-runs/types";

type ArtifactCard = {
  key: string;
  title: string;
  path?: string;
  body?: string;
  missing?: boolean;
  error?: string;
};

type CheckState = "unchecked" | "pass" | "fail";

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
  const [activeKey, setActiveKey] = useState<string>("change");
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
  }, [run.id, run.goal, run.goalSpec?.primaryPath]);

  useEffect(() => {
    let cancelled = false;
    const specs: Array<{ key: string; title: string; path?: string }> = [
      {
        key: "goal",
        title: "Goal Spec",
        path: `${teamRoot}/.team/goal-spec.md`,
      },
      { key: "goal_fallback", title: "Goal", path: `${teamRoot}/.team/goal.md` },
      {
        key: "readme",
        title: "README",
        path: `${teamRoot}/README.md`,
      },
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
      if (!cancelled) {
        setCards(next);
        const prefer =
          next.find((c) => c.key === "change" && c.body)?.key ||
          next.find((c) => c.key === "readme" && c.body)?.key ||
          next.find((c) => c.body)?.key ||
          "change";
        setActiveKey(prefer);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [run, teamRoot]);

  const changeBody = cards.find((c) => c.key === "change")?.body ?? "";
  const readmeBody = cards.find((c) => c.key === "readme")?.body ?? "";
  const howToRun = useMemo(
    () => extractHowToRun({
      primaryPath: run.goalSpec?.primaryPath,
      changeSummary: changeBody,
      readme: readmeBody,
      cwd: teamRoot,
    }),
    [run.goalSpec?.primaryPath, changeBody, readmeBody, teamRoot],
  );

  const active = cards.find((c) => c.key === activeKey) ?? cards[0];
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
        minHeight: ready ? 520 : undefined,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            {ready ? "等待你的验收" : run.status === "done" ? "已验收完成" : run.status === "blocked" ? "阻塞 — 可返工" : `验收 · ${run.status}`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {ready
              ? "Reviewer 已通过。请按下方「如何运行」亲自打开成果，勾选检查项后再 Accept 或 Rework。"
              : "查看产物与检查项；需要改进时填写反馈并 Rework。"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "right" }}>
          <div>工作目录</div>
          <code style={{ fontSize: 11, color: "var(--text)" }}>{shorten(teamRoot)}</code>
        </div>
      </div>

      {/* How to run — primary guidance */}
      <section style={sectionBox}>
        <div style={sectionTitle}>1. 如何打开 / 运行成果</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.45 }}>
          请在本机终端进入工作目录后操作。不要只看 Agent 报告 — 以你浏览器里的实际结果为准。
        </div>
        {howToRun.lines.length > 0 ? (
          <ol style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
            {howToRun.lines.map((line, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {looksLikeCommand(line) ? (
                  <code style={codeInline}>{line}</code>
                ) : (
                  line
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
            未从 change-summary / Goal Spec 解析到运行步骤。请打开 Change summary 或 README。
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
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              style={linkBtn}
            >
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
                onClick={() => openPath(cards.find((c) => c.key === "change")?.path)}
                disabled={!cards.find((c) => c.key === "change")?.path}
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
            <span style={{ color: "var(--text-muted)" }}>Primary Path（Goal Spec）：</span>
            <div style={{ whiteSpace: "pre-wrap", color: "var(--text)", marginTop: 4 }}>{run.goalSpec.primaryPath}</div>
          </div>
        )}
      </section>

      {/* Checklist */}
      <section style={sectionBox}>
        <div style={sectionTitle}>2. 按 Goal Spec 逐项验收</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
          点击切换：未检 → 通过 → 失败。建议全部通过后再 Accept。
        </div>
        {checks.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>无结构化检查项 — 请阅读 Goal Spec 后自行判断。</div>
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

      {/* Artifacts browser — large */}
      <section style={{ ...sectionBox, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 0" }}>
          <div style={sectionTitle}>3. 成果物与报告（在这里查看细节）</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.45 }}>
            左侧选文档；右侧阅读全文。点「在文件面板打开」可放大对照代码。
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(140px, 200px) 1fr",
            minHeight: 280,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div style={{ borderRight: "1px solid var(--border)", overflow: "auto", background: "var(--bg)" }}>
            {cards.map((c) => {
              const selected = c.key === (active?.key ?? activeKey);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setActiveKey(c.key)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: selected ? "var(--bg-selected)" : "transparent",
                    color: c.missing ? "var(--text-dim)" : "var(--text)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: selected ? 650 : 500 }}>{c.title}</div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                    {c.missing ? "缺失" : c.body ? `${c.body.length} chars` : "—"}
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 280 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-panel)",
              }}
            >
              <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{active?.title ?? "—"}</div>
              {active?.path && (
                <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
                  {shorten(active.path)}
                </span>
              )}
              {active?.path && onOpenFile && !active.missing && (
                <button type="button" style={linkBtn} onClick={() => openPath(active.path)}>
                  在文件面板打开
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 12, background: "var(--bg)" }}>
              {active?.missing ? (
                <div style={{ fontSize: 12, color: "#ef4444" }}>
                  {active.error || "文件缺失或无法读取"}
                </div>
              ) : active?.body ? (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text)",
                  }}
                >
                  {active.body}
                </pre>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>加载中或无内容</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Decision */}
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
          Rework 会把你的反馈注入后续 implement → test → review 的 brief。Accept 将 Team Run 标为 done。
        </div>
      </section>
    </div>
  );
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
    // keep actionable lines
    if (
      /npm |pnpm |yarn |npx |bun |http:\/\/|https:\/\/|localhost|cd |open |打开|浏览器|install|run dev|serve/i.test(l) ||
      lines.length < 6
    ) {
      if (!lines.includes(l)) lines.push(l);
    }
  }

  // fallbacks from primary path alone
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
  if (/do not.*file:\/\//i.test(source) || /不要.*file:\/\//i.test(source) || /Do not.*file:\/\//i.test(input.changeSummary)) {
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

function shortOneLine(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
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
