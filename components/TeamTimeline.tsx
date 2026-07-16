"use client";

import { validationFailureDetails } from "@/lib/team-runs/validation-failure";
import type { PlanNode, RunEvent, RunStatus } from "@/lib/team-runs/types";

const ACTIVE: RunStatus[] = ["planning", "executing", "replanning", "created"];

export function TeamTimeline({
  events,
  status,
  blockedReason,
  nodes = [],
  onOpenFile,
}: {
  events: RunEvent[];
  status: RunStatus;
  blockedReason?: string | null;
  nodes?: PlanNode[];
  onOpenFile?: (path: string) => void;
}) {
  const ordered = events.slice().reverse();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Timeline</div>
        {ACTIVE.includes(status) && (
          <span style={{ fontSize: 10, color: "#f59e0b" }}>live</span>
        )}
      </div>

      {blockedReason && (status === "blocked" || status === "failed") && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "#ef4444",
            fontSize: 12,
          }}
        >
          <strong>Blocked / failed:</strong> {blockedReason}
        </div>
      )}

      {ordered.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>No events yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {ordered.map((e, i) => {
            const validationFailure = validationFailureDetails(e, nodes);
            return (
              <div
                key={`${e.at}-${e.type}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr",
                  gap: 8,
                  padding: "7px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 11,
                }}
              >
                <div style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                  {formatTime(e.at)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: eventColor(e.type), fontWeight: 600 }}>{e.type}</div>
                  {validationFailure ? (
                    <div
                      style={{
                        marginTop: 5,
                        padding: "8px 9px",
                        borderRadius: 7,
                        border: "1px solid rgba(239,68,68,0.35)",
                        background: "rgba(239,68,68,0.08)",
                      }}
                    >
                      <div style={{ color: "#ef4444", fontWeight: 600 }}>Hard validation failed</div>
                      <ul style={{ margin: "5px 0 0", paddingLeft: 17, color: "var(--text-muted)" }}>
                        {validationFailure.hardErrors.map((error, errorIndex) => (
                          <li key={`${error}-${errorIndex}`} style={{ marginBottom: 3 }}>{error}</li>
                        ))}
                      </ul>
                      {validationFailure.artifactPaths.map((path) => (
                        <div key={path} style={{ marginTop: 5, wordBreak: "break-all", color: "var(--text-dim)" }}>
                          {path}
                          {onOpenFile && (
                            <button
                              type="button"
                              onClick={() => onOpenFile(path)}
                              style={openFileButtonStyle}
                            >
                              Open file
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : e.message ? (
                    <div style={{ color: "var(--text-muted)", marginTop: 2, whiteSpace: "pre-wrap" }}>
                      {e.message}
                    </div>
                  ) : null}
                  {(e.nodeId || e.dispatchId) && (
                    <div style={{ color: "var(--text-dim)", marginTop: 2 }}>
                      {e.nodeId ? `node ${e.nodeId}` : ""}
                      {e.nodeId && e.dispatchId ? " · " : ""}
                      {e.dispatchId ? `dispatch ${e.dispatchId.slice(0, 8)}` : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const openFileButtonStyle: React.CSSProperties = {
  marginLeft: 6,
  border: "none",
  background: "transparent",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 10,
  padding: 0,
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function eventColor(type: string): string {
  if (type.includes("fail") || type === "blocked" || type === "cancelled") return "#ef4444";
  if (type.includes("ok") || type === "done" || type === "accepted" || type === "plan_accepted") return "var(--accent)";
  if (type.includes("dispatch") || type.includes("planning") || type.includes("replan")) return "#f59e0b";
  return "var(--text)";
}

export function latestBlockedReason(events: RunEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "blocked" || e.type === "failed" || e.type === "planning_failed") {
      return e.message || e.type;
    }
  }
  return null;
}
