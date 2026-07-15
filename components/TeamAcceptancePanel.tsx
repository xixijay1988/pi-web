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
  const ready = run.status === "awaiting_human_acceptance";
  const canRework = ready || run.status === "blocked";

  const checks = useMemo(() => {
    const fromSpec = run.goalSpec?.acceptanceChecks?.filter(Boolean) ?? [];
    const base = [
      {
        id: "primary_path",
        label: run.goalSpec?.primaryPath
          ? `Primary Path works: ${run.goalSpec.primaryPath}`
          : "Primary Path works as documented for a human",
      },
      ...fromSpec.map((c, i) => ({ id: `ac_${i}`, label: c })),
    ];
    // de-dupe by label
    const seen = new Set<string>();
    return base.filter((c) => {
      const k = c.label.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [run.goalSpec]);

  useEffect(() => {
    // reset local check marks when run identity / goal changes
    setCheckState({});
  }, [run.id, run.goal, run.goalSpec?.primaryPath]);

  useEffect(() => {
    let cancelled = false;
    const specs: Array<{ key: string; title: string; path?: string }> = [
      {
        key: "goal",
        title: "Goal Spec",
        path: `${run.cwd.replace(/\/$/, "")}/.team/goal-spec.md`,
      },
      { key: "goal_fallback", title: "Goal", path: `${run.cwd.replace(/\/$/, "")}/.team/goal.md` },
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
        title: "Acceptance verdict",
        path: findArtifact(run, "reviewer") ?? findByName(run, "acceptance.md"),
      },
    ];

    (async () => {
      const next: ArtifactCard[] = [];
      let goalSpecLoaded = false;
      for (const spec of specs) {
        if (!spec.path) {
          next.push({ ...spec, missing: true });
          continue;
        }
        if (spec.key === "goal_fallback" && goalSpecLoaded) continue;
        try {
          const res = await fetch(`/api/files/${encodeFilePathForApi(spec.path)}?type=read`);
          const data = await res.json().catch(() => ({})) as { content?: string; error?: string };
          if (!res.ok) {
            if (spec.key === "goal") continue; // try goal.md
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
          if (spec.key === "goal") continue;
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
  }, [run]);

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

  return (
    <div
      style={{
        border: ready ? "1px solid color-mix(in srgb, var(--accent) 45%, var(--border))" : "1px solid var(--border)",
        borderRadius: 10,
        padding: 12,
        background: ready ? "color-mix(in srgb, var(--accent) 6%, var(--bg-panel))" : "var(--bg-panel)",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Final acceptance</div>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {ready
            ? "Reviewer passed — verify Goal Spec checks, then confirm or rework"
            : run.status === "blocked"
              ? "Blocked — mark failed checks + feedback to rework"
              : `Status: ${run.status}`}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, whiteSpace: "pre-wrap" }}>
        {run.goal}
      </div>

      {run.goalSpec?.primaryPath && (
        <div
          style={{
            fontSize: 12,
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>Primary Path</div>
          <div style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>{run.goalSpec.primaryPath}</div>
        </div>
      )}

      {checks.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
            Goal Spec checklist (click: pass → fail → clear)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                    gap: 8,
                    alignItems: "flex-start",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: st === "pass"
                      ? "color-mix(in srgb, #10b981 12%, var(--bg))"
                      : st === "fail"
                        ? "color-mix(in srgb, #ef4444 12%, var(--bg))"
                        : "var(--bg)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                >
                  <span style={{ width: 16, flexShrink: 0, fontWeight: 700, color: st === "pass" ? "#10b981" : st === "fail" ? "#ef4444" : "var(--text-dim)" }}>
                    {st === "pass" ? "✓" : st === "fail" ? "✕" : "○"}
                  </span>
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {cards.map((c) => (
          <div
            key={c.key}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 8,
              background: "var(--bg)",
              minHeight: 96,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{c.title}</div>
              {c.path && onOpenFile && !c.missing && (
                <button
                  onClick={() => onOpenFile(c.path!)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--accent)",
                    fontSize: 10,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Open
                </button>
              )}
            </div>
            {c.missing ? (
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {c.error ? c.error : "Not available yet"}
              </div>
            ) : (
              <pre
                style={{
                  margin: 0,
                  fontSize: 10,
                  lineHeight: 1.4,
                  color: "var(--text-muted)",
                  whiteSpace: "pre-wrap",
                  maxHeight: 120,
                  overflow: "auto",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {truncate(c.body || "", 900)}
              </pre>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
          Fail any checklist item or describe issues below. Rework re-runs implement → test → review with your notes injected into worker briefs.
        </div>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          placeholder="e.g. 添加 Todo 后刷新丢失；完成状态切换无效；筛选 all/active/completed 不对…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 8,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 12,
            marginBottom: 10,
          }}
        />
        {ready && anyUnchecked && (
          <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 8 }}>
            Tip: walk the Primary Path and mark each Goal Spec check before accepting.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            disabled={!ready || busy || failedChecks.length > 0}
            onClick={onAccept}
            title={
              failedChecks.length
                ? "Clear failed checks or use Reject & rework"
                : ready
                  ? allCheckedPass
                    ? "Mark this Team Run done"
                    : "Accept is available; checklist still recommended"
                  : "Accept is only available while awaiting human acceptance"
            }
            style={btnStyle(true, !ready || !!busy || failedChecks.length > 0)}
          >
            Accept & mark done
          </button>
          <button
            disabled={!canRework || busy || (!feedback.trim() && failedChecks.length === 0)}
            onClick={() => {
              const msg = buildReworkFeedback();
              if (!msg.trim()) return;
              onReject(msg);
              setFeedback("");
            }}
            title={
              !feedback.trim() && failedChecks.length === 0
                ? "Mark failed checks or write feedback first"
                : "Re-run implement/test/review with your notes"
            }
            style={btnStyle(false, !canRework || !!busy || (!feedback.trim() && failedChecks.length === 0))}
          >
            Reject & rework
          </button>
        </div>
      </div>
    </div>
  );
}

function findArtifact(run: TeamRun, roleId: string): string | undefined {
  const node = run.plan.nodes.find((n) => n.roleId === roleId);
  return pickLatestPath(node);
}

function findByName(run: TeamRun, fileName: string): string | undefined {
  for (const n of run.plan.nodes) {
    const hit = n.artifactPaths?.find((p) => p.endsWith(fileName));
    if (hit) return hit;
  }
  return undefined;
}

function pickLatestPath(node?: PlanNode): string | undefined {
  if (!node?.artifactPaths?.length) return undefined;
  return node.artifactPaths[node.artifactPaths.length - 1];
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function btnStyle(primary: boolean, disabled: boolean): CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 6,
    border: primary ? "none" : "1px solid var(--border)",
    background: primary ? "var(--accent)" : "transparent",
    color: primary ? "#fff" : "var(--text)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontSize: 12,
  };
}
