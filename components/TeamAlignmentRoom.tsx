"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { AlignmentRoom } from "@/lib/team-runs/alignment-types";
import type { GoalSpec } from "@/lib/team-runs/goal-spec";

type ModelOption = { id: string; name: string; provider: string };

export function TeamAlignmentRoom({
  cwd,
  busy,
  onBusy,
  onError,
  onApplyDraft,
  onPublishedRun,
  onOpenSession,
}: {
  cwd: string | null;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onError: (message: string | null) => void;
  onApplyDraft: (draft: GoalSpec) => void;
  onPublishedRun?: (runId: string) => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const [idea, setIdea] = useState("");
  const [humanMsg, setHumanMsg] = useState("");
  const [room, setRoom] = useState<AlignmentRoom | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [facProvider, setFacProvider] = useState("");
  const [facModelId, setFacModelId] = useState("");
  const [archProvider, setArchProvider] = useState("");
  const [archModelId, setArchModelId] = useState("");
  const [includeProduct, setIncludeProduct] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [lastMeta, setLastMeta] = useState<string>("");

  const running = busy || localBusy;
  const setBusy = (v: boolean) => {
    setLocalBusy(v);
    onBusy(v);
  };

  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/models?cwd=${encodeURIComponent(cwd)}`);
        const data = (await res.json()) as {
          modelList?: ModelOption[];
          defaultModel?: { provider?: string; modelId?: string };
        };
        if (cancelled) return;
        const list = data.modelList ?? [];
        setModels(list);
        const dp = data.defaultModel?.provider || list[0]?.provider || "";
        const dm = data.defaultModel?.modelId || list[0]?.id || "";
        setFacProvider(dp);
        setFacModelId(dm);
        // architect defaults to second model if available, else same
        const second = list.find((m) => m.provider !== dp || m.id !== dm) ?? list[0];
        setArchProvider(second?.provider || dp);
        setArchModelId(second?.id || dm);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/team-alignments/${encodeURIComponent(id)}`);
    const data = (await res.json()) as { alignment?: AlignmentRoom; error?: string };
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.alignment) setRoom(data.alignment);
  }, []);

  const createRoom = async () => {
    if (!cwd) {
      onError("Select a project cwd first.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const res = await fetch("/api/team-alignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          idea: idea.trim(),
          includeProductCritic: includeProduct,
          facilitator: {
            provider: facProvider || undefined,
            modelId: facModelId || undefined,
            skillNames: ["grill-me", "team-goal"],
          },
          architect: {
            provider: archProvider || undefined,
            modelId: archModelId || undefined,
          },
        }),
      });
      const data = (await res.json()) as { alignment?: AlignmentRoom; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRoom(data.alignment ?? null);
      setLastMeta("Room created — send a message or Advance turns.");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const command = async (type: string, text?: string) => {
    if (!room) return;
    setBusy(true);
    onError(null);
    try {
      const res = await fetch(`/api/team-alignments/${encodeURIComponent(room.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, text, start: true }),
      });
      const data = (await res.json()) as {
        alignment?: AlignmentRoom;
        room?: AlignmentRoom;
        run?: { id: string };
        error?: string;
        errors?: string[];
        seatId?: string;
        missingSkills?: string[];
      };
      if (!res.ok) throw new Error(data.error || data.errors?.join("; ") || `HTTP ${res.status}`);
      const next = data.alignment ?? data.room;
      if (next) setRoom(next);
      if (type === "advance") setLastMeta(`Turn: ${data.seatId ?? "?"}`);
      if (type === "synthesize") setLastMeta("Synthesize pass done");
      if (type === "publish" && data.run?.id) {
        setLastMeta(`Published Team Run ${data.run.id}`);
        onPublishedRun?.(data.run.id);
      }
      if (type === "message") setHumanMsg("");
      // auto-apply draft if ready
      const draft = (next ?? room).draftGoalSpec;
      if (draft && type !== "publish") {
        // surface only; user applies explicitly
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const modelSelect = (
    label: string,
    provider: string,
    modelId: string,
    onChange: (p: string, id: string) => void,
    disabled?: boolean,
  ) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
      <select
        disabled={disabled || models.length === 0}
        value={provider && modelId ? `${provider}:::${modelId}` : ""}
        onChange={(e) => {
          const [p, id] = e.target.value.split(":::");
          onChange(p || "", id || "");
        }}
        style={selectStyle}
      >
        {models.length === 0 ? (
          <option value="">Default model</option>
        ) : (
          models.map((m) => (
            <option key={`${m.provider}/${m.id}`} value={`${m.provider}:::${m.id}`}>
              {m.provider}/{m.name || m.id}
            </option>
          ))
        )}
      </select>
    </label>
  );

  return (
    <div style={{ marginBottom: 10, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Alignment Room (multi-seat)</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8, lineHeight: 1.4 }}>
        Serial multi-model discussion before execute. Facilitator + Architect critic (optional Product).
      </div>

      {!room ? (
        <>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Raw idea / problem statement"
            rows={2}
            style={inputStyle}
            disabled={running || !cwd}
          />
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {modelSelect("Facilitator model", facProvider, facModelId, (p, id) => {
              setFacProvider(p);
              setFacModelId(id);
            }, running)}
            {modelSelect("Architect critic", archProvider, archModelId, (p, id) => {
              setArchProvider(p);
              setArchModelId(id);
            }, running)}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={includeProduct}
              disabled={running}
              onChange={(e) => setIncludeProduct(e.target.checked)}
            />
            Include Product critic seat
          </label>
          <button onClick={() => void createRoom()} disabled={running || !cwd} style={btnStyle(running || !cwd)}>
            {running ? "Creating…" : "Open multi-seat room"}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, lineHeight: 1.4 }}>
            Status: <strong style={{ color: "var(--text)" }}>{room.status}</strong>
            {" · "}turns {room.turnCount}/{room.budget.maxTurns}
            {" · "}next: {room.participants.filter((p) => p.enabled)[room.nextSeatIndex % Math.max(1, room.participants.filter((p) => p.enabled).length)]?.name ?? "—"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {room.participants.filter((p) => p.enabled).map((p) => (
              <span
                key={p.seatId}
                title={`${p.provider}/${p.modelId}`}
                style={{
                  fontSize: 10,
                  padding: "2px 7px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                {p.name}
                {p.sessionId && onOpenSession ? (
                  <button
                    type="button"
                    onClick={() => onOpenSession(p.sessionId!)}
                    style={{ marginLeft: 4, border: "none", background: "transparent", color: "var(--accent)", cursor: "pointer", fontSize: 10 }}
                  >
                    open
                  </button>
                ) : null}
              </span>
            ))}
          </div>

          <div style={{ maxHeight: 200, overflow: "auto", marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {room.transcript.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>No turns yet. Message and/or Advance.</div>
            ) : (
              room.transcript.map((m) => {
                const who =
                  m.from === "human"
                    ? "You"
                    : (room.participants.find((p) => p.seatId === m.from)?.name ?? m.from);
                return (
                  <div
                    key={m.id}
                    style={{
                      fontSize: 11,
                      lineHeight: 1.4,
                      padding: "6px 8px",
                      borderRadius: 6,
                      whiteSpace: "pre-wrap",
                      background: m.from === "human" ? "var(--user-bg, var(--bg-hover))" : "var(--bg-panel)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>
                      {who}{m.kind === "goal_spec" ? " · goal_spec" : ""}
                    </div>
                    {m.text}
                  </div>
                );
              })
            )}
          </div>

          <textarea
            value={humanMsg}
            onChange={(e) => setHumanMsg(e.target.value)}
            placeholder="Add human guidance…"
            rows={2}
            style={inputStyle}
            disabled={running || room.status === "consumed" || room.status === "abandoned"}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            <button
              onClick={() => void command("message", humanMsg)}
              disabled={running || !humanMsg.trim() || room.status === "consumed"}
              style={{ ...btnStyle(running || !humanMsg.trim()), flex: 1 }}
            >
              Send
            </button>
            <button
              onClick={() => void command("advance")}
              disabled={running || room.status === "consumed"}
              style={{ ...btnStyle(running), flex: 1 }}
            >
              {running ? "Running…" : "Next seat turn"}
            </button>
            <button
              onClick={() => void command("synthesize")}
              disabled={running || room.status === "consumed"}
              style={{ ...btnStyle(running), flex: 1 }}
            >
              Synthesize Goal Spec
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                if (room.draftGoalSpec) onApplyDraft(room.draftGoalSpec);
              }}
              disabled={running || !room.draftGoalSpec}
              style={{ ...btnStyle(running || !room.draftGoalSpec), flex: 1, background: "#64748b" }}
            >
              Apply draft to form
            </button>
            <button
              onClick={() => void command("publish")}
              disabled={running || !room.draftGoalSpec || room.status === "consumed"}
              style={{ ...btnStyle(running || !room.draftGoalSpec), flex: 1 }}
              title="Validate Goal Spec, create Team Run, start engine"
            >
              Publish & start Team
            </button>
          </div>
          {lastMeta && (
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>{lastMeta}</div>
          )}
          {room.draftErrors && room.draftErrors.length > 0 && (
            <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4 }}>{room.draftErrors.join("; ")}</div>
          )}
          <button
            type="button"
            onClick={() => void refresh(room.id)}
            disabled={running}
            style={{ ...ghostBtn, marginTop: 6 }}
          >
            Refresh room
          </button>
        </>
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

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "5px 6px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 11,
};

function btnStyle(disabled: boolean): CSSProperties {
  return {
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

const ghostBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
};
