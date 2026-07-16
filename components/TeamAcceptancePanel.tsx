"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import { encodeFilePathForApi } from "@/lib/file-paths";
import {
  acceptanceChecklistStorageKey,
  parseAcceptanceChecklistState,
  serializeAcceptanceChecklistState,
  type AcceptanceCheckState,
} from "@/lib/team-runs/acceptance-checklist-state";
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
  onReject: (payload: { text: string; failedChecks: string[] }) => void;
  onOpenFile?: (path: string) => void;
}) {
  const { t } = useI18n();
  const [cards, setCards] = useState<ArtifactCard[]>([]);
  const [feedback, setFeedback] = useState("");
  const [checkState, setCheckState] = useState<Record<string, AcceptanceCheckState>>({});
  const [loadedChecklistKey, setLoadedChecklistKey] = useState<string | null>(null);
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
          ? t("team.acceptance.primaryPathCheck", {
              path: shortOneLine(run.goalSpec.primaryPath),
            })
          : t("team.acceptance.primaryPathDocumentCheck"),
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
  }, [run.goalSpec, t]);

  const checklistStorageKey = acceptanceChecklistStorageKey(run.id);
  const checklistSignature = checks.map((check) => check.id).join("\n");

  useEffect(() => {
    const allowedIds = checklistSignature ? checklistSignature.split("\n") : [];
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(checklistStorageKey);
    } catch {
      raw = null;
    }
    const restored = parseAcceptanceChecklistState(raw, allowedIds);
    setCheckState(restored);
    setLoadedChecklistKey(checklistStorageKey);
    setExpandedKey(null);
    setShowEvidenceDrawer(false);
  }, [checklistStorageKey, checklistSignature]);

  useEffect(() => {
    if (loadedChecklistKey !== checklistStorageKey) return;
    const serialized = serializeAcceptanceChecklistState(checkState);
    try {
      if (serialized === "{}") window.localStorage.removeItem(checklistStorageKey);
      else window.localStorage.setItem(checklistStorageKey, serialized);
    } catch {
      return;
    }
  }, [checkState, checklistStorageKey, loadedChecklistKey]);

  useEffect(() => {
    let cancelled = false;
    const specs: Array<{ key: string; title: string; path?: string }> = [
      {
        key: "goal",
        title: t("team.acceptance.artifactGoalSpec"),
        path: `${teamRoot}/.team/goal-spec.md`,
      },
      {
        key: "goal_fallback",
        title: t("team.acceptance.artifactGoal"),
        path: `${teamRoot}/.team/goal.md`,
      },
      { key: "readme", title: "README", path: `${teamRoot}/README.md` },
      {
        key: "contract",
        title: t("team.acceptance.artifactContract"),
        path: findArtifact(run, "architect") ?? findByName(run, "contract.md"),
      },
      {
        key: "change",
        title: t("team.acceptance.artifactChangeSummary"),
        path: findArtifact(run, "implementer") ?? findByName(run, "change-summary.md"),
      },
      {
        key: "test",
        title: t("team.acceptance.artifactTestReport"),
        path: findArtifact(run, "tester") ?? findByName(run, "test-report.md"),
      },
      {
        key: "acceptance",
        title: t("team.acceptance.artifactReviewerVerdict"),
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
  }, [run, teamRoot, t]);

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
        fallbackRunScript: t("team.acceptance.fallbackRunScript"),
        enterDirectory: t("team.acceptance.enterDirectory", {
          path: shorten(teamRoot),
        }),
        fileProtocolWarning: t("team.acceptance.fileProtocolWarning"),
        noFileProtocolWarning: t("team.acceptance.noFileProtocolWarning"),
      }),
    [run.goalSpec?.primaryPath, changeBody, readmeBody, teamRoot, t],
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
      const next: AcceptanceCheckState = cur === "unchecked" ? "pass" : cur === "pass" ? "fail" : "unchecked";
      return { ...prev, [id]: next };
    });
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
              ? t("team.acceptance.awaiting")
              : run.status === "done"
                ? t("team.acceptance.done")
                : run.status === "blocked"
                  ? t("team.acceptance.blocked")
                  : t("team.acceptance.status", { status: run.status })}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {ready
              ? t("team.acceptance.readyHelp")
              : t("team.acceptance.defaultHelp")}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "right" }}>
          <div>{t("team.acceptance.workingDirectory")}</div>
          <code style={{ fontSize: 11, color: "var(--text)" }}>{shorten(teamRoot)}</code>
        </div>
      </div>

      {/* 1. How to run */}
      <section style={sectionBox}>
        <div style={sectionTitle}>{t("team.acceptance.howToRunTitle")}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.45 }}>
          {t("team.acceptance.howToRunHelp")}
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
            {t("team.acceptance.noRunSteps")}
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
              {t("team.acceptance.openUrl", { url })}
            </a>
          ))}
          {onOpenFile && (
            <>
              <button type="button" style={secondaryBtn} onClick={() => openPath(teamRoot + "/README.md")}>
                {t("team.acceptance.openReadme")}
              </button>
              <button
                type="button"
                style={secondaryBtn}
                onClick={() => openPath(byKey.get("change")?.path)}
                disabled={!byKey.get("change")?.path}
              >
                {t("team.acceptance.openChangeSummary")}
              </button>
              <button type="button" style={secondaryBtn} onClick={() => openPath(teamRoot + "/package.json")}>
                {t("team.acceptance.openPackageJson")}
              </button>
            </>
          )}
        </div>
        {run.goalSpec?.primaryPath && (
          <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45 }}>
            <span style={{ color: "var(--text-muted)" }}>
              {t("team.acceptance.primaryPathLabel")}
            </span>
            <div style={{ whiteSpace: "pre-wrap", color: "var(--text)", marginTop: 4 }}>
              {run.goalSpec.primaryPath}
            </div>
          </div>
        )}
      </section>

      {/* 2. Checklist */}
      <section style={sectionBox}>
        <div style={sectionTitle}>{t("team.acceptance.checklistTitle")}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
          {t("team.acceptance.checklistHelp")}
        </div>
        {checks.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {t("team.acceptance.noChecks")}
          </div>
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
        <div style={sectionTitle}>{t("team.acceptance.evidenceTitle")}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.45 }}>
          {t("team.acceptance.evidenceHelp")}
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
            title={t("team.acceptance.changesTitle")}
            tone="neutral"
            body={
              evidence.changed.length
                ? evidence.changed.map((x) => `• ${x}`).join("\n")
                : t("team.acceptance.noChangeSummary")
            }
          />
          <SummaryCard
            title={t("team.acceptance.testConclusion")}
            tone={evidence.testStatus === "pass" ? "good" : evidence.testStatus === "fail" ? "bad" : "neutral"}
            body={
              [
                evidence.testStatus
                  ? `status: ${evidence.testStatus}`
                  : t("team.acceptance.statusUnknown"),
                evidence.testBlurb,
              ]
                .filter(Boolean)
                .join("\n")
            }
          />
          <SummaryCard
            title={t("team.acceptance.reviewerConclusion")}
            tone={
              evidence.reviewStatus === "pass" ? "good" : evidence.reviewStatus === "fail" ? "bad" : "neutral"
            }
            body={
              [
                evidence.reviewStatus
                  ? `status: ${evidence.reviewStatus}`
                  : t("team.acceptance.statusUnknown"),
                evidence.primaryVerified === true
                  ? "primary_path_verified: true"
                  : evidence.primaryVerified === false
                    ? "primary_path_verified: false"
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
              {t("team.acceptance.viewReport", { title: c.title })}
            </button>
          ))}
          {onOpenFile && byKey.get("change")?.path && (
            <button type="button" style={linkBtn} onClick={() => openPath(byKey.get("change")?.path)}>
              {t("team.acceptance.openChangeInFiles")}
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
          {showEvidenceDrawer
            ? t("team.acceptance.collapseReports")
            : t("team.acceptance.expandReports")}
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
                  {t("team.acceptance.openInFiles")}
                </button>
              )}
            </div>
            <div style={{ maxHeight: 360, overflow: "auto", padding: 12 }}>
              {!expanded ? (
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {t("team.acceptance.chooseReport")}
                </div>
              ) : expanded.missing ? (
                <div style={{ fontSize: 12, color: "#ef4444" }}>
                  {expanded.error || t("team.acceptance.fileMissing")}
                </div>
              ) : expanded.body ? (
                <div className="team-acceptance-md" style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
                  <MarkdownBody cwd={teamRoot} onOpenFile={onOpenFile}>
                    {expanded.body}
                  </MarkdownBody>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {t("team.acceptance.noContent")}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 4. Decision */}
      <section style={sectionBox}>
        <div style={sectionTitle}>{t("team.acceptance.decisionTitle")}</div>
        {ready && anyUnchecked && checks.length > 0 && (
          <div style={{ fontSize: 12, color: "#d97706", marginBottom: 8 }}>
            {t("team.acceptance.uncheckedWarning")}
          </div>
        )}
        {failedChecks.length > 0 && (
          <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>
            {t("team.acceptance.failedWarning", { count: failedChecks.length })}
          </div>
        )}
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t("team.acceptance.feedbackPlaceholder")}
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
                ? t("team.acceptance.acceptUnavailable")
                : failedChecks.length
                  ? t("team.acceptance.reworkFailedChecks")
                  : allCheckedPass
                    ? t("team.acceptance.allChecksPass")
                    : t("team.acceptance.checkFirst")
            }
            onClick={() => onAccept()}
            style={{
              ...primaryBtn,
              opacity: busy || !ready || failedChecks.length > 0 ? 0.5 : 1,
              cursor: busy || !ready || failedChecks.length > 0 ? "not-allowed" : "pointer",
            }}
          >
            {t("team.acceptance.accept")}
          </button>
          <button
            type="button"
            disabled={busy || !canRework || (!feedback.trim() && failedChecks.length === 0)}
            onClick={() => {
              const free = feedback.trim();
              const fails = failedChecks.map((c) => c.label);
              if (!free && fails.length === 0) return;
              onReject({ text: free, failedChecks: fails });
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
            {t("team.acceptance.rework")}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.4 }}>
          {t("team.acceptance.decisionHelp")}
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
  fallbackRunScript: string;
  enterDirectory: string;
  fileProtocolWarning: string;
  noFileProtocolWarning: string;
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
    lines.push(input.fallbackRunScript);
  } else if (!lines.some((l) => /cd |工作目录|project root|项目/i.test(l))) {
    lines.unshift(input.enterDirectory);
  }

  if (/file:\/\//i.test(source) || /double-click|双击/i.test(source)) {
    warnings.push(input.fileProtocolWarning);
  }
  if (
    /do not.*file:\/\//i.test(source) ||
    /不要.*file:\/\//i.test(source) ||
    /Do not.*file:\/\//i.test(input.changeSummary)
  ) {
    warnings.push(input.noFileProtocolWarning);
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
