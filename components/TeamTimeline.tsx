"use client";

import type { RunEvent, RunStatus } from "@/lib/team-runs/types";

const ACTIVE: RunStatus[] = ["planning", "executing", "replanning", "created"];

export function TeamTimeline({
  events,
  status,
  blockedReason,
}: {
  events: RunEvent[];
  status: RunStatus;
  blockedReason?: string | null;
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
          {ordered.map((e, i) => (
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
              <div>
                <div style={{ color: eventColor(e.type), fontWeight: 600 }}>{e.type}</div>
                {e.message && (
                  <div style={{ color: "var(--text-muted)", marginTop: 2, whiteSpace: "pre-wrap" }}>
                    {e.message}
                  </div>
                )}
                {(e.nodeId || e.dispatchId) && (
                  <div style={{ color: "var(--text-dim)", marginTop: 2 }}>
                    {e.nodeId ? `node ${e.nodeId}` : ""}
                    {e.nodeId && e.dispatchId ? " · " : ""}
                    {e.dispatchId ? `dispatch ${e.dispatchId.slice(0, 8)}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
