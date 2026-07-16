"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { GoalSpec } from "@/lib/team-runs/goal-spec";
import { parseChoicePrompt } from "@/lib/team-runs/choice-parse";
import { AlignmentChoiceBar, AlignmentSelectDialog } from "./AlignmentChoiceBar";
import { MarkdownBody } from "./MarkdownBody";
import { useI18n } from "@/hooks/useI18n";

type CoachMessage = { role: "user" | "assistant"; text: string };
type SkillOption = { name: string; description: string; disableModelInvocation?: boolean };
type ModelOption = { id: string; name: string; provider: string };

const PRESET_SKILLS = ["grill-me", "team-goal", "grilling"] as const;

/**
 * Full-screen alignment discussion workspace (replaces cramped sidebar coach UI).
 * Single-facilitator Goal Coach with large transcript + clickable choice prompts.
 */
export function TeamAlignmentWorkspace({
  open,
  cwd,
  onClose,
  onApplyDraft,
  onOpenSession,
  onError,
}: {
  open: boolean;
  cwd: string | null;
  onClose: () => void;
  onApplyDraft: (draft: GoalSpec) => void;
  onOpenSession?: (sessionId: string) => void;
  onError?: (message: string | null) => void;
}) {
  const { t } = useI18n();
  const [idea, setIdea] = useState("");
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionFile, setSessionFile] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalSpec | null>(null);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(["grill-me", "team-goal"]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [provider, setProvider] = useState("");
  const [modelId, setModelId] = useState("");
  const [missingSkills, setMissingSkills] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [choiceDialogOpen, setChoiceDialogOpen] = useState(true);

  const reportError = (msg: string | null) => {
    setLocalError(msg);
    onError?.(msg);
  };

  useEffect(() => {
    if (!open || !cwd) return;
    let cancelled = false;
    (async () => {
      try {
        const [skillsRes, modelsRes] = await Promise.all([
          fetch(`/api/skills?cwd=${encodeURIComponent(cwd)}`),
          fetch(`/api/models?cwd=${encodeURIComponent(cwd)}`),
        ]);
        const skillsData = (await skillsRes.json()) as { skills?: SkillOption[] };
        const modelsData = (await modelsRes.json()) as {
          modelList?: ModelOption[];
          defaultModel?: { provider?: string; modelId?: string };
        };
        if (cancelled) return;
        const list = skillsData.skills ?? [];
        setSkills(list);
        setSelectedSkills((prev) => {
          const names = new Set(list.map((s) => s.name));
          const kept = prev.filter((n) => names.has(n));
          if (kept.length > 0) return kept;
          const presets = PRESET_SKILLS.filter((n) => names.has(n));
          return presets.length ? [...presets] : prev;
        });
        const modelList = modelsData.modelList ?? [];
        setModels(modelList);
        if (modelsData.defaultModel?.provider && modelsData.defaultModel?.modelId) {
          setProvider(modelsData.defaultModel.provider);
          setModelId(modelsData.defaultModel.modelId);
        } else if (modelList[0]) {
          setProvider(modelList[0].provider);
          setModelId(modelList[0].id);
        }
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cwd]);

  const skillChoices = useMemo(() => {
    const byName = new Map(skills.map((s) => [s.name, s]));
    const names = [
      ...PRESET_SKILLS,
      ...skills.map((s) => s.name).filter((n) => !PRESET_SKILLS.includes(n as (typeof PRESET_SKILLS)[number])),
    ];
    return [...new Set(names)].map((name) => byName.get(name) ?? { name, description: "" });
  }, [skills]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const choicePrompt = lastAssistant ? parseChoicePrompt(lastAssistant.text) : null;

  const send = async (mode: "start" | "continue", textOverride?: string) => {
    if (!cwd) {
      reportError(t("team.workspace.selectProject"));
      return;
    }
    const text = (textOverride ?? (mode === "start" ? idea : reply)).trim();
    if (mode === "continue" && !text) {
      reportError(t("team.workspace.typeReply"));
      return;
    }
    if (mode === "continue" && !sessionId) {
      reportError(t("team.workspace.startFirst"));
      return;
    }

    setBusy(true);
    reportError(null);
    try {
      const userVisible =
        mode === "start"
          ? text || `(Start alignment with skills: ${selectedSkills.join(", ") || "none"})`
          : text;
      setMessages((prev) => [...prev, { role: "user", text: userVisible }]);
      if (mode === "start" && !textOverride) setIdea("");
      if (mode === "continue" && !textOverride) setReply("");
      if (textOverride) setReply("");

      const res = await fetch("/api/team-runs/goal-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          message: text,
          skillNames: mode === "start" ? selectedSkills : undefined,
          ...(provider && modelId ? { provider, modelId } : {}),
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
        missingSkills?: string[];
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.sessionId) setSessionId(data.sessionId);
      if (data.sessionFile) setSessionFile(data.sessionFile);
      setMissingSkills(data.missingSkills ?? []);
      const assistantText = (data.assistantText ?? "").trim() || "(empty model response)";
      setMessages((prev) => [...prev, { role: "assistant", text: assistantText }]);
      setDraft(data.draft ?? null);
      setDraftErrors(data.draftErrors ?? []);
      setChoiceDialogOpen(true);
    } catch (e) {
      reportError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickChoice = (value: string) => {
    setChoiceDialogOpen(false);
    void send(sessionId ? "continue" : "start", value);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>{t("team.workspace.title")}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
            {t("team.workspace.subtitle")}
          </div>
        </div>
        {sessionId && onOpenSession && (
          <button type="button" onClick={() => onOpenSession(sessionId)} style={headerBtn} disabled={busy}>
            {t("team.workspace.openSession")}
          </button>
        )}
        <button type="button" onClick={onClose} style={headerBtn}>
          {t("common.close")}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* Transcript */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)" }}>
          <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            <div style={{ maxWidth: 820, margin: "0 auto" }}>
              {messages.length === 0 ? (
                <div style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.5, paddingTop: 40 }}>
                  {t("team.workspace.emptyIntro")}
                </div>
              ) : (
                messages.map((m, i) => {
                  const isLastAssistant = m.role === "assistant" && i === messages.length - 1;
                  const choices = isLastAssistant ? parseChoicePrompt(m.text) : null;
                  return (
                    <div
                      key={`${m.role}-${i}`}
                      style={{
                        marginBottom: 14,
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: m.role === "user" ? "var(--user-bg, var(--bg-hover))" : "var(--bg-panel)",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
                        {m.role === "user" ? t("team.workspace.you") : t("team.workspace.coach")}
                      </div>
                      {m.role === "assistant" ? (
                        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
                          <MarkdownBody>{m.text}</MarkdownBody>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", color: "var(--text)" }}>
                          {m.text}
                        </div>
                      )}
                      {choices && isLastAssistant && (
                        <AlignmentChoiceBar
                          prompt={choices}
                          disabled={busy}
                          onPick={pickChoice}
                        />
                      )}
                    </div>
                  );
                })
              )}
              {busy && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
                  {t("team.workspace.thinking")}
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "12px 20px", background: "var(--bg-panel)" }}>
            <div style={{ maxWidth: 820, margin: "0 auto" }}>
              {localError && (
                <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>{localError}</div>
              )}
              {!sessionId ? (
                <>
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder={t("team.workspace.ideaPlaceholder")}
                    rows={3}
                    style={composer}
                    disabled={busy || !cwd}
                  />
                  <button
                    type="button"
                    onClick={() => void send("start")}
                    disabled={busy || !cwd}
                    style={primaryBtn(busy || !cwd)}
                  >
                    {busy ? t("team.workspace.starting") : t("team.workspace.start")}
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={t("team.workspace.replyPlaceholder")}
                    rows={3}
                    style={composer}
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) {
                        e.preventDefault();
                        void send("continue");
                      }
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void send("continue")}
                      disabled={busy || !reply.trim()}
                      style={{ ...primaryBtn(busy || !reply.trim()), flex: 1 }}
                    >
                      {busy ? t("team.workspace.sending") : t("team.workspace.send")}
                    </button>
                    {choicePrompt && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setChoiceDialogOpen(true)}
                        style={{ ...secondaryBtn, flex: "0 0 auto" }}
                      >
                        {t("team.workspace.showChoices")}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right rail: config + draft */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            overflow: "auto",
            padding: 14,
            background: "var(--bg-panel)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Section title={t("team.workspace.skills")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {skillChoices.slice(0, 14).map((s) => {
                const on = selectedSkills.includes(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    disabled={busy || Boolean(sessionId)}
                    title={s.description || s.name}
                    onClick={() =>
                      setSelectedSkills((prev) =>
                        prev.includes(s.name) ? prev.filter((x) => x !== s.name) : [...prev, s.name],
                      )
                    }
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: on ? "var(--accent)" : "transparent",
                      color: on ? "#fff" : "var(--text-muted)",
                      fontSize: 11,
                      cursor: busy || sessionId ? "not-allowed" : "pointer",
                    }}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            {sessionId && (
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>{t("team.workspace.skillsLocked")}</div>
            )}
            {missingSkills.length > 0 && (
              <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 6 }}>
                {t("team.workspace.missing", { skills: missingSkills.join(", ") })}
              </div>
            )}
          </Section>

          <Section title={t("team.workspace.model")}>
            <select
              value={provider && modelId ? `${provider}:::${modelId}` : ""}
              disabled={busy || Boolean(sessionId) || models.length === 0}
              onChange={(e) => {
                const [p, id] = e.target.value.split(":::");
                setProvider(p || "");
                setModelId(id || "");
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 12,
              }}
            >
              {models.length === 0 ? (
                <option value="">{t("team.workspace.sessionDefault")}</option>
              ) : (
                models.map((m) => (
                  <option key={`${m.provider}/${m.id}`} value={`${m.provider}:::${m.id}`}>
                    {m.provider} / {m.name || m.id}
                  </option>
                ))
              )}
            </select>
          </Section>

          <Section title={t("team.workspace.draftTitle")}>
            {!draft ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45 }}>
                {t("team.workspace.draftEmpty")}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap", color: "var(--text)" }}>
                  {`Outcome: ${draft.outcome || "—"}\n\nPrimary Path:\n${draft.primaryPath || "—"}\n\nChecks:\n${draft.acceptanceChecks.map((c, i) => `${i + 1}. ${c}`).join("\n") || "—"}`}
                </div>
                {draftErrors.length > 0 && (
                  <div style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>{draftErrors.join("; ")}</div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onApplyDraft(draft);
                    onClose();
                  }}
                  style={{
                    ...primaryBtn(busy),
                    marginTop: 10,
                    background: draftErrors.length === 0 ? "var(--accent)" : "#64748b",
                  }}
                >
                  {t("team.workspace.applyClose")}
                </button>
              </>
            )}
          </Section>

          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45 }}>
            {t("team.workspace.tip")}
          </div>
        </div>
      </div>

      {choicePrompt && choiceDialogOpen && sessionId && !busy && (
        <AlignmentSelectDialog
          title={t("team.workspace.choiceTitle")}
          prompt={choicePrompt}
          disabled={busy}
          onPick={pickChoice}
          onDismiss={() => setChoiceDialogOpen(false)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

const composer: CSSProperties = {
  width: "100%",
  resize: "vertical",
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  lineHeight: 1.45,
  boxSizing: "border-box",
  marginBottom: 8,
};

const headerBtn: CSSProperties = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};

function primaryBtn(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
