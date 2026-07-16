"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getFileName } from "@/lib/file-paths";
import type { TeamRunListItem } from "@/lib/team-runs/types";
import { useTeamRun } from "@/hooks/useTeamRun";
import { latestBlockedReason, TeamTimeline } from "./TeamTimeline";
import { latestValidationFailure } from "@/lib/team-runs/validation-failure";
import { TeamAcceptancePanel } from "./TeamAcceptancePanel";
import { TeamAlignmentRoom } from "./TeamAlignmentRoom";
import { TeamAlignmentWorkspace } from "./TeamAlignmentWorkspace";
import type { GoalSpec } from "@/lib/team-runs/goal-spec";

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function statusColor(status: string): string {
  switch (status) {
    case "done":
      return "var(--accent)";
    case "blocked":
    case "failed":
    case "cancelled":
      return "#ef4444";
    case "executing":
    case "planning":
    case "replanning":
      return "#f59e0b";
    case "awaiting_human_acceptance":
      return "#3b82f6";
    case "paused":
      return "var(--text-muted)";
    default:
      return "var(--text-dim)";
  }
}

export function TeamMode({
  cwd,
  selectedRunId,
  onSelectedRunIdChange,
  onOpenSession,
  onOpenFile,
}: {
  cwd: string | null;
  selectedRunId?: string | null;
  onSelectedRunIdChange?: (id: string | null) => void;
  onOpenSession?: (sessionId: string) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
}) {
  const [runs, setRuns] = useState<TeamRunListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(selectedRunId ?? null);
  const { run, setRun, error, setError, loading } = useTeamRun(selectedId);

  useEffect(() => {
    if (selectedRunId && selectedRunId !== selectedId) {
      setSelectedId(selectedRunId);
    }
  }, [selectedRunId, selectedId]);

  const selectRun = (id: string | null) => {
    setSelectedId(id);
    onSelectedRunIdChange?.(id);
  };
  const [createMode, setCreateMode] = useState<"quick" | "align">("align");
  const [outcome, setOutcome] = useState("");
  const [primaryPath, setPrimaryPath] = useState("");
  const [acceptanceText, setAcceptanceText] = useState("");
  const [constraints, setConstraints] = useState("");
  const [outOfScope, setOutOfScope] = useState("");
  const [alignDraft, setAlignDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [alignWorkspaceOpen, setAlignWorkspaceOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/team-runs");
      const d = await res.json() as { runs?: TeamRunListItem[]; error?: string };
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setRuns(d.runs ?? []);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), 5000);
    return () => clearInterval(t);
  }, [loadList]);

  // Keep list row status in sync with SSE-driven selected run
  useEffect(() => {
    if (!run) return;
    setRuns((prev) =>
      prev.map((r) =>
        r.id === run.id
          ? {
              ...r,
              status: run.status,
              updatedAt: run.updatedAt,
              goal: run.goal,
            }
          : r,
      ),
    );
  }, [run]);

  const createRun = async () => {
    if (!cwd) {
      setError("Select a project cwd first (Chat sidebar / explorer).");
      return;
    }
    const acceptanceChecks = acceptanceText
      .split(/\n/)
      .map((l) => l.replace(/^\s*(?:\d+[.)]\s*|[-*]\s*)/, "").trim())
      .filter(Boolean);
    const resolvedOutcome = outcome.trim() || alignDraft.trim();
    if (!resolvedOutcome) {
      setError("Outcome / goal is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          outcome: resolvedOutcome,
          primaryPath: primaryPath.trim(),
          acceptanceChecks,
          constraints: constraints.trim() || undefined,
          outOfScope: outOfScope.trim() || undefined,
          notes: createMode === "align" && alignDraft.trim() ? alignDraft.trim() : undefined,
          requireStrongGoal: true,
          start: true,
        }),
      });
      const d = await res.json() as { run?: { id: string }; error?: string; errors?: string[] };
      if (!res.ok) throw new Error(d.error || d.errors?.join("; ") || `HTTP ${res.status}`);
      setOutcome("");
      setPrimaryPath("");
      setAcceptanceText("");
      setConstraints("");
      setOutOfScope("");
      setAlignDraft("");
      await loadList();
      if (d.run) selectRun(d.run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyGoalDraft = (draft: GoalSpec) => {
    setOutcome(draft.outcome || "");
    setPrimaryPath(draft.primaryPath || "");
    setAcceptanceText((draft.acceptanceChecks || []).map((c, i) => `${i + 1}. ${c}`).join("\n"));
    if (draft.constraints) setConstraints(draft.constraints);
    if (draft.outOfScope) setOutOfScope(draft.outOfScope);
    if (draft.notes) setAlignDraft(draft.notes);
    setError(null);
  };

  const command = async (
    type: string,
    text?: string,
    extra?: { failedChecks?: string[]; resetFrom?: string },
  ) => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/team-runs/${encodeURIComponent(selectedId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          text,
          failedChecks: extra?.failedChecks,
          resetFrom: extra?.resetFrom,
        }),
      });
      const d = await res.json() as { run?: typeof run; error?: string };
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      if (d.run) setRun(d.run);
      await loadList();
      if (type === "note") setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openRoleSession = async (sessionId: string) => {
    if (!run) return;
    if (["planning", "executing", "replanning"].includes(run.status)) {
      const ok = window.confirm(
        "This Team Run is still auto-running.\n\nOpening the role session is fine (observe).\nIf you send messages there, pause the run first so the engine does not race you.\n\nPause now?",
      );
      if (ok) await command("pause");
    }
    onOpenSession?.(sessionId);
  };

  const budgetView = useMemo(() => {
    if (!run) return null;
    const maxAttempts = run.budget.maxAttemptsPerNode;
    const maxReplans = run.budget.maxReplans;
    const elapsedMs = Date.now() - Date.parse(run.createdAt);
    const maxMs = run.budget.maxRunDurationMs;
    const current = run.plan.nodes.find((n) =>
      n.status === "running" || n.status === "starting" || n.status === "validating",
    );
    return {
      maxAttempts,
      maxReplans,
      replanCount: run.replanCount,
      elapsedLabel: formatDuration(Math.max(0, elapsedMs)),
      maxLabel: formatDuration(maxMs),
      currentNodeId: current?.id,
    };
  }, [run]);

  const blockedReason = run ? latestBlockedReason(run.events) : null;
  const validationFailure = run ? latestValidationFailure(run.events, run.plan.nodes) : null;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, background: "var(--bg)" }}>
      <div
        style={{
          width: 280,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-panel)",
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)", overflow: "auto", maxHeight: "55%" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>New Team Run</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {([
              ["align", "Align then start"],
              ["quick", "Quick form"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setCreateMode(id)}
                style={{
                  flex: 1,
                  padding: "5px 6px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: createMode === id ? "var(--accent)" : "transparent",
                  color: createMode === id ? "#fff" : "var(--text-muted)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {!cwd && (
            <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>
              Select a project cwd in the Chat sidebar first.
            </div>
          )}

          {createMode === "align" && (
            <>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8, lineHeight: 1.45 }}>
                Open the full-screen discussion workspace to grill requirements with Skills and clickable choices.
                Multi-seat room stays available below. Then confirm Goal Spec and start.
              </div>
              <button
                type="button"
                onClick={() => setAlignWorkspaceOpen(true)}
                disabled={!cwd || busy}
                style={{
                  width: "100%",
                  marginBottom: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: !cwd || busy ? "not-allowed" : "pointer",
                  opacity: !cwd || busy ? 0.6 : 1,
                }}
              >
                Open discussion workspace
              </button>
              <details style={{ marginBottom: 10 }}>
                <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
                  Multi-seat Alignment Room (advanced)
                </summary>
                <div style={{ marginTop: 8 }}>
                  <TeamAlignmentRoom
                    cwd={cwd}
                    busy={busy}
                    onBusy={setBusy}
                    onError={setError}
                    onApplyDraft={applyGoalDraft}
                    onOpenSession={onOpenSession}
                    onPublishedRun={(runId) => {
                      selectRun(runId);
                      void loadList();
                    }}
                  />
                </div>
              </details>
            </>
          )}

          <Field label="Outcome *">
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="What should exist when done?"
              rows={2}
              style={fieldStyle}
            />
          </Field>
          <Field label="Primary Path *">
            <textarea
              value={primaryPath}
              onChange={(e) => setPrimaryPath(e.target.value)}
              placeholder="How a human opens/uses it (e.g. double-click index.html / npx serve .)"
              rows={2}
              style={fieldStyle}
            />
          </Field>
          <Field label="Acceptance checks * (one per line, ≥3)">
            <textarea
              value={acceptanceText}
              onChange={(e) => setAcceptanceText(e.target.value)}
              placeholder={"1. Add non-empty todo → item appears\n2. Refresh keeps todos\n3. Toggle complete works"}
              rows={4}
              style={fieldStyle}
            />
          </Field>
          {createMode === "align" && (
            <Field label="Discussion notes (optional)">
              <textarea
                value={alignDraft}
                onChange={(e) => setAlignDraft(e.target.value)}
                placeholder="Paste extra decisions / coach notes..."
                rows={3}
                style={fieldStyle}
              />
            </Field>
          )}
          <details style={{ marginBottom: 8 }}>
            <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>Optional constraints</summary>
            <Field label="Constraints">
              <textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} rows={2} style={fieldStyle} />
            </Field>
            <Field label="Out of scope">
              <textarea value={outOfScope} onChange={(e) => setOutOfScope(e.target.value)} rows={2} style={fieldStyle} />
            </Field>
          </details>

          <button
            onClick={() => void createRun()}
            disabled={busy || !cwd}
            style={{
              marginTop: 4,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: busy || !cwd ? "not-allowed" : "pointer",
              opacity: busy || !cwd ? 0.6 : 1,
              fontSize: 12,
            }}
          >
            Confirm Goal Spec & start
          </button>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
            Serial engine: plan → architect → implement → test → review → your acceptance.
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {listError && (
            <div style={{ padding: 12, fontSize: 12, color: "#ef4444" }}>{listError}</div>
          )}
          {runs.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--text-dim)" }}>No Team Runs yet</div>
          ) : (
            runs.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRun(r.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  background: selectedId === r.id ? "var(--bg-selected)" : "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.goal}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--text-dim)" }}>
                  <span style={{ color: statusColor(r.status) }}>{r.status}</span>
                  <span>{shortenPath(r.cwd)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {(error) && (
          <div style={{ padding: "8px 14px", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 12 }}>
            {error}
          </div>
        )}
        {!selectedId || !run ? (
          <div style={{ margin: "auto", color: "var(--text-dim)", fontSize: 13 }}>
            {loading ? "Loading…" : "Select or create a Team Run"}
          </div>
        ) : (
          <>
            <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Team Run</div>
                <span style={{ fontSize: 12, color: statusColor(run.status) }}>{run.status}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap" }}>{run.goal}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
                {shortenPath(run.cwd)} · {run.id.slice(0, 8)}
                {budgetView?.currentNodeId ? ` · current node ${budgetView.currentNodeId}` : ""}
              </div>

              {budgetView && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 10,
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  <Chip>replans {budgetView.replanCount}/{budgetView.maxReplans}</Chip>
                  <Chip>max attempts/node {budgetView.maxAttempts}</Chip>
                  <Chip>elapsed {budgetView.elapsedLabel} / {budgetView.maxLabel}</Chip>
                </div>
              )}

              {(validationFailure || (blockedReason && (run.status === "blocked" || run.status === "failed"))) && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(239,68,68,0.4)",
                    background: "rgba(239,68,68,0.08)",
                    fontSize: 11,
                  }}
                >
                  <div style={{ color: "#ef4444", fontWeight: 700, marginBottom: 5 }}>Needs attention</div>
                  {blockedReason && (
                    <div style={{ color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>{blockedReason}</div>
                  )}
                  {validationFailure?.nodeId && (
                    <div style={{ color: "var(--text-dim)", marginTop: 5 }}>
                      Failed node: <strong style={{ color: "var(--text)" }}>{validationFailure.nodeId}</strong>
                    </div>
                  )}
                  {validationFailure && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--text-muted)" }}>
                      {validationFailure.hardErrors.map((failure, index) => (
                        <li key={`${failure}-${index}`} style={{ marginBottom: 3 }}>{failure}</li>
                      ))}
                    </ul>
                  )}
                  {validationFailure?.artifactPaths.map((path) => (
                    <div key={path} style={{ marginTop: 6, color: "var(--text-dim)", wordBreak: "break-all" }}>
                      {shortenPath(path)}
                      {onOpenFile && (
                        <button
                          type="button"
                          onClick={() => onOpenFile(path, getFileName(path))}
                          style={{
                            marginLeft: 8,
                            border: "none",
                            background: "transparent",
                            color: "var(--accent)",
                            cursor: "pointer",
                            fontSize: 10,
                          }}
                        >
                          Open file
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <ActionBtn disabled={busy} onClick={() => void command("pause")}>Pause</ActionBtn>
                <ActionBtn disabled={busy} onClick={() => void command("resume")}>Resume</ActionBtn>
                <ActionBtn disabled={busy} onClick={() => void command("cancel")}>Cancel</ActionBtn>
              </div>

              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 10 }}>
                {run.status === "awaiting_human_acceptance"
                  ? "验收阶段：主区域已放大。请按「如何运行」打开成果，对照检查项后再 Accept / Rework。"
                  : "Observe role sessions anytime. Sending chat to a role while auto-running can race the engine — pause first (prompted when opening a session)."}
              </div>
            </div>

            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding:
                    run.status === "awaiting_human_acceptance" || run.status === "done" || run.status === "blocked"
                      ? 16
                      : 14,
                  borderRight: "1px solid var(--border)",
                  minWidth: 0,
                }}
              >
                                {(run.status === "awaiting_human_acceptance" || run.status === "done" || run.status === "blocked") && (
                  <TeamAcceptancePanel
                    run={run}
                    busy={busy}
                    onAccept={() => void command("accept")}
                    onReject={(payload) =>
                      void command("rework", payload.text, { failedChecks: payload.failedChecks })
                    }
                    onOpenFile={onOpenFile ? (path) => onOpenFile(path, getFileName(path)) : undefined}
                  />
                )}

                {(run.status === "awaiting_human_acceptance" || run.status === "done" || run.status === "blocked") ? (
                  <details style={{ marginTop: 4, marginBottom: 12 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)", userSelect: "none" }}>
                      Plan nodes & role sessions（验收时默认折叠，点击展开）
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      <Section title="Plan nodes">
                  {run.plan.nodes.map((n) => {
                    const role = run.roleSnapshots.find((r) => r.roleId === n.roleId);
                    const active = n.status === "running" || n.status === "starting" || n.status === "validating";
                    return (
                      <div
                        key={n.id}
                        style={{
                          padding: "8px 10px",
                          border: active ? "1px solid color-mix(in srgb, #f59e0b 50%, var(--border))" : "1px solid var(--border)",
                          borderRadius: 8,
                          marginBottom: 8,
                          background: active ? "color-mix(in srgb, #f59e0b 8%, var(--bg-panel))" : "var(--bg-panel)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {role?.name ?? n.roleId} · {n.title}
                          </div>
                          <div style={{ fontSize: 11, color: statusColor(n.status) }}>{n.status}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                          {role?.provider && role?.modelId
                            ? `${role.provider}/${role.modelId}`
                            : "model not set"}
                          {n.sessionId ? ` · session ${n.sessionId.slice(0, 8)}` : " · no session yet"}
                          {` · attempts ${n.attempts}`}
                        </div>
                        {n.lastError && (
                          <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{n.lastError}</div>
                        )}
                        {n.artifactPaths?.[0] && (
                          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                            {shortenPath(n.artifactPaths[n.artifactPaths.length - 1])}
                            {onOpenFile && (
                              <button
                                onClick={() => onOpenFile(n.artifactPaths[n.artifactPaths.length - 1], getFileName(n.artifactPaths[n.artifactPaths.length - 1]))}
                                style={{
                                  marginLeft: 8,
                                  border: "none",
                                  background: "transparent",
                                  color: "var(--accent)",
                                  cursor: "pointer",
                                  fontSize: 10,
                                }}
                              >
                                open
                              </button>
                            )}
                          </div>
                        )}
                        {n.sessionId && onOpenSession && (
                          <button
                            onClick={() => void openRoleSession(n.sessionId!)}
                            style={{
                              marginTop: 6,
                              fontSize: 11,
                              border: "1px solid var(--border)",
                              background: "transparent",
                              color: "var(--accent)",
                              borderRadius: 4,
                              padding: "3px 8px",
                              cursor: "pointer",
                            }}
                          >
                            Open role session
                          </button>
                        )}
                      </div>
                    );
                  })}
                </Section>

                <Section title="Role snapshots">
                  {run.roleSnapshots.map((r) => (
                    <div key={r.roleId} style={{ fontSize: 12, marginBottom: 6, color: "var(--text-muted)" }}>
                      <strong style={{ color: "var(--text)" }}>{r.name}</strong> ({r.roleId}) · {r.toolPreset}
                      {r.provider ? ` · ${r.provider}/${r.modelId}` : ""}
                    </div>
                  ))}
                </Section>
                    </div>
                  </details>
                ) : (
                  <>
                    <Section title="Plan nodes">
                  {run.plan.nodes.map((n) => {
                    const role = run.roleSnapshots.find((r) => r.roleId === n.roleId);
                    const active = n.status === "running" || n.status === "starting" || n.status === "validating";
                    return (
                      <div
                        key={n.id}
                        style={{
                          padding: "8px 10px",
                          border: active ? "1px solid color-mix(in srgb, #f59e0b 50%, var(--border))" : "1px solid var(--border)",
                          borderRadius: 8,
                          marginBottom: 8,
                          background: active ? "color-mix(in srgb, #f59e0b 8%, var(--bg-panel))" : "var(--bg-panel)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {role?.name ?? n.roleId} · {n.title}
                          </div>
                          <div style={{ fontSize: 11, color: statusColor(n.status) }}>{n.status}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                          {role?.provider && role?.modelId
                            ? `${role.provider}/${role.modelId}`
                            : "model not set"}
                          {n.sessionId ? ` · session ${n.sessionId.slice(0, 8)}` : " · no session yet"}
                          {` · attempts ${n.attempts}`}
                        </div>
                        {n.lastError && (
                          <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{n.lastError}</div>
                        )}
                        {n.artifactPaths?.[0] && (
                          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                            {shortenPath(n.artifactPaths[n.artifactPaths.length - 1])}
                            {onOpenFile && (
                              <button
                                onClick={() => onOpenFile(n.artifactPaths[n.artifactPaths.length - 1], getFileName(n.artifactPaths[n.artifactPaths.length - 1]))}
                                style={{
                                  marginLeft: 8,
                                  border: "none",
                                  background: "transparent",
                                  color: "var(--accent)",
                                  cursor: "pointer",
                                  fontSize: 10,
                                }}
                              >
                                open
                              </button>
                            )}
                          </div>
                        )}
                        {n.sessionId && onOpenSession && (
                          <button
                            onClick={() => void openRoleSession(n.sessionId!)}
                            style={{
                              marginTop: 6,
                              fontSize: 11,
                              border: "1px solid var(--border)",
                              background: "transparent",
                              color: "var(--accent)",
                              borderRadius: 4,
                              padding: "3px 8px",
                              cursor: "pointer",
                            }}
                          >
                            Open role session
                          </button>
                        )}
                      </div>
                    );
                  })}
                </Section>

                <Section title="Role snapshots">
                  {run.roleSnapshots.map((r) => (
                    <div key={r.roleId} style={{ fontSize: 12, marginBottom: 6, color: "var(--text-muted)" }}>
                      <strong style={{ color: "var(--text)" }}>{r.name}</strong> ({r.roleId}) · {r.toolPreset}
                      {r.provider ? ` · ${r.provider}/${r.modelId}` : ""}
                    </div>
                  ))}
                </Section>
                  </>
                )}

              </div>

              <div
                style={{
                  width:
                    run.status === "awaiting_human_acceptance" || run.status === "done" || run.status === "blocked"
                      ? 250
                      : 340,
                  flexShrink: 0,
                  overflow: "auto",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <TeamTimeline
                  events={run.events}
                  status={run.status}
                  blockedReason={blockedReason}
                  nodes={run.plan.nodes}
                  onOpenFile={onOpenFile ? (path) => onOpenFile(path, getFileName(path)) : undefined}
                />

                <Section title="Human note">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Note for next planning cycle (does not chat a worker role)"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: 8,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: 12,
                    }}
                  />
                  <ActionBtn disabled={busy || !note.trim()} onClick={() => void command("note", note.trim())}>
                    Add note
                  </ActionBtn>
                  {run.humanNotes.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {run.humanNotes.slice().reverse().map((n, i) => (
                        <div key={`${n.at}-${i}`} style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                          <div style={{ color: "var(--text-dim)" }}>{new Date(n.at).toLocaleString()}</div>
                          <div>{n.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </div>
          </>
        )}
      </div>
      {alignWorkspaceOpen && (
        <TeamAlignmentWorkspace
          open={alignWorkspaceOpen}
          cwd={cwd}
          onClose={() => setAlignWorkspaceOpen(false)}
          onApplyDraft={applyGoalDraft}
          onOpenSession={onOpenSession}
          onError={setError}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>{title}</div>
      {children}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--bg-panel)",
        color: "var(--text)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        border: "1px solid var(--border)",
        borderRadius: 999,
        padding: "3px 8px",
        background: "var(--bg-panel)",
      }}
    >
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  resize: "vertical",
  padding: 8,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 12,
  boxSizing: "border-box",
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
