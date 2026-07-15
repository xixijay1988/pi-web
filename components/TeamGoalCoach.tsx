"use client";

import { useState, type CSSProperties } from "react";
import type { GoalSpec } from "@/lib/team-runs/goal-spec";

type CoachMessage = {
  role: "user" | "assistant";
  text: string;
};

export function TeamGoalCoach({
  cwd,
  busy,
  onBusy,
  onError,
  onApplyDraft,
  onOpenSession,
}: {
  cwd: string | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onApplyDraft: (draft: GoalSpec) => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const [idea, setIdea] = useState("");
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionFile, setSessionFile] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalSpec | null>(null);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  const [localBusy, setLocalBusy] = useState(false);

  const running = busy || localBusy;

  const setBusy = (v: boolean) => {
    setLocalBusy(v);
    onBusy(v);
  };

  const send = async (mode: "start" | "continue") => {
    if (!cwd) {
      onError("Select a project cwd first (Chat sidebar / explorer).");
      return;
    }
    const text = mode === "start" ? idea.trim() : reply.trim();
    if (mode === "continue" && !text) {
      onError("Type a reply for the Goal Coach.");
      return;
    }
    if (mode === "continue" && !sessionId) {
      onError("Start Goal Coach first.");
      return;
    }

    setBusy(true);
    onError(null);
    try {
      const userVisible =
        mode === "start"
          ? text || "(Start Goal Coach interview for this project)"
          : text;
      setMessages((prev) => [...prev, { role: "user", text: userVisible }]);
      if (mode === "start") setIdea("");
      else setReply("");

      const res = await fetch("/api/team-runs/goal-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          message: text,
          ...(mode === "continue" && sessionId
            ? { sessionId, sessionFile: sessionFile ?? undefined }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        sessionId?: string;
        sessionFile?: string;
        assistantText?: string;
        draft?: GoalSpec;
        draftErrors?: string[];
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      if (data.sessionId) setSessionId(data.sessionId);
      if (data.sessionFile) setSessionFile(data.sessionFile);
      const assistantText = (data.assistantText ?? "").trim() || "(empty model response)";
      setMessages((prev) => [...prev, { role: "assistant", text: assistantText }]);
      setDraft(data.draft ?? null);
      setDraftErrors(data.draftErrors ?? []);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 10, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Goal Coach</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8, lineHeight: 1.4 }}>
        Discuss with an agent first. When a valid Goal Spec appears, apply it into the form and start.
      </div>

      {messages.length > 0 && (
        <div style={{ maxHeight: 180, overflow: "auto", marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                padding: "6px 8px",
                borderRadius: 6,
                whiteSpace: "pre-wrap",
                background: m.role === "user" ? "var(--user-bg, var(--bg-hover))" : "var(--bg-panel)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>
                {m.role === "user" ? "You" : "Coach"}
              </div>
              {m.text}
            </div>
          ))}
        </div>
      )}

      {!sessionId ? (
        <>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Raw idea (optional) — or leave blank to start an interview"
            rows={3}
            style={inputStyle}
            disabled={running || !cwd}
          />
          <button
            onClick={() => void send("start")}
            disabled={running || !cwd}
            style={btnStyle(running || !cwd)}
          >
            {running ? "Coach thinking…" : "Start Goal Coach"}
          </button>
        </>
      ) : (
        <>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to the coach…"
            rows={2}
            style={inputStyle}
            disabled={running}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => void send("continue")}
              disabled={running || !reply.trim()}
              style={{ ...btnStyle(running || !reply.trim()), flex: 1 }}
            >
              {running ? "Coach thinking…" : "Send reply"}
            </button>
            {onOpenSession && sessionId && (
              <button
                onClick={() => onOpenSession(sessionId)}
                disabled={running}
                style={{ ...btnStyle(running), flex: "0 0 auto", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >
                Open chat
              </button>
            )}
          </div>
        </>
      )}

      {draft && (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-panel)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            Draft Goal Spec {draftErrors.length === 0 ? "✓ ready" : "(needs fixes)"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
            {`Outcome: ${draft.outcome || "—"}\nPrimary Path: ${draft.primaryPath || "—"}\nChecks (${draft.acceptanceChecks.length}):\n${draft.acceptanceChecks.map((c, i) => `  ${i + 1}. ${c}`).join("\n") || "  —"}`}
          </div>
          {draftErrors.length > 0 && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
              {draftErrors.join("; ")}
            </div>
          )}
          <button
            onClick={() => onApplyDraft(draft)}
            disabled={running}
            style={{ ...btnStyle(running), marginTop: 6, background: draftErrors.length === 0 ? "var(--accent)" : "#64748b" }}
          >
            Apply draft to form
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  resize: "vertical",
  padding: 8,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 12,
  boxSizing: "border-box",
  marginBottom: 6,
};

function btnStyle(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 6,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontSize: 12,
  };
}
