"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
  const ready = run.status === "awaiting_human_acceptance";
  const canRework = ready || run.status === "blocked";

  useEffect(() => {
    let cancelled = false;
    const specs: Array<{ key: string; title: string; path?: string }> = [
      { key: "goal", title: "Goal", path: `${run.cwd.replace(/\/$/, "")}/.team/goal.md` },
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
      for (const spec of specs) {
        if (!spec.path) {
          next.push({ ...spec, missing: true });
          continue;
        }
        try {
          const res = await fetch(`/api/files/${encodeFilePathForApi(spec.path)}?type=read`);
          const data = await res.json().catch(() => ({})) as { content?: string; error?: string };
          if (!res.ok) {
            next.push({
              ...spec,
              path: spec.path,
              missing: true,
              error: data.error ? `${data.error} (${res.status})` : `HTTP ${res.status}`,
            });
            continue;
          }
          next.push({
            ...spec,
            path: spec.path,
            body: typeof data.content === "string" ? data.content : undefined,
            missing: typeof data.content !== "string",
          });
        } catch (e) {
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
          {ready ? "Reviewer passed — confirm or request rework" : run.status === "blocked" ? "Blocked — add feedback to rework" : `Status: ${run.status}`}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, whiteSpace: "pre-wrap" }}>
        {run.goal}
      </div>

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
          If something is wrong, describe the concrete issues (what broke, expected behavior). Reject & rework will re-run implement/test/review with your notes.
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            disabled={!ready || busy}
            onClick={onAccept}
            title={ready ? "Mark this Team Run done" : "Accept is only available while awaiting human acceptance"}
            style={btnStyle(true, !ready || !!busy)}
          >
            Accept & mark done
          </button>
          <button
            disabled={!canRework || busy || !feedback.trim()}
            onClick={() => {
              const msg = feedback.trim();
              if (!msg) return;
              onReject(msg);
            }}
            title={!feedback.trim() ? "Write feedback first" : "Re-run implement/test/review with your notes"}
            style={btnStyle(false, !canRework || !!busy || !feedback.trim())}
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
