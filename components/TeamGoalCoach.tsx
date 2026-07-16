"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { GoalSpec } from "@/lib/team-runs/goal-spec";

type CoachMessage = {
  role: "user" | "assistant";
  text: string;
};

type SkillOption = {
  name: string;
  description: string;
  disableModelInvocation?: boolean;
};

type ModelOption = {
  id: string;
  name: string;
  provider: string;
};

const PRESET_SKILLS = ["grill-me", "team-goal", "grilling"] as const;

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
  const { t } = useI18n();
  const [idea, setIdea] = useState("");
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionFile, setSessionFile] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalSpec | null>(null);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(["grill-me", "team-goal"]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [provider, setProvider] = useState("");
  const [modelId, setModelId] = useState("");
  const [missingSkills, setMissingSkills] = useState<string[]>([]);

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
        const [skillsRes, modelsRes] = await Promise.all([
          fetch(`/api/skills?cwd=${encodeURIComponent(cwd)}`),
          fetch(`/api/models?cwd=${encodeURIComponent(cwd)}`),
        ]);
        const skillsData = (await skillsRes.json()) as { skills?: SkillOption[]; error?: string };
        const modelsData = (await modelsRes.json()) as {
          modelList?: ModelOption[];
          defaultModel?: { provider?: string; modelId?: string };
        };
        if (cancelled) return;
        const list = skillsData.skills ?? [];
        setSkills(list);
        // Keep presets that exist; if none exist yet, still show selected for user awareness
        setSelectedSkills((prev) => {
          const names = new Set(list.map((s) => s.name));
          const kept = prev.filter((n) => names.has(n));
          if (kept.length > 0) return kept;
          const availablePresets = PRESET_SKILLS.filter((n) => names.has(n));
          return availablePresets.length ? [...availablePresets] : prev;
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
        // non-fatal; coach can still run with session defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const skillChoices = useMemo(() => {
    const byName = new Map(skills.map((s) => [s.name, s]));
    const names = [
      ...PRESET_SKILLS,
      ...skills.map((s) => s.name).filter((n) => !PRESET_SKILLS.includes(n as (typeof PRESET_SKILLS)[number])),
    ];
    return [...new Set(names)].map((name) => byName.get(name) ?? { name, description: "" });
  }, [skills]);

  const modelValue = provider && modelId ? `${provider}:::${modelId}` : "";

  const toggleSkill = (name: string) => {
    if (sessionId) return; // lock skills for sticky session after start (P0 simplicity)
    setSelectedSkills((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  };

  const send = async (mode: "start" | "continue") => {
    if (!cwd) {
      onError(t("team.coach.selectProject"));
      return;
    }
    const text = mode === "start" ? idea.trim() : reply.trim();
    if (mode === "continue" && !text) {
      onError(t("team.coach.typeReply"));
      return;
    }
    if (mode === "continue" && !sessionId) {
      onError(t("team.coach.startFirst"));
      return;
    }

    setBusy(true);
    onError(null);
    try {
      const userVisible =
        mode === "start"
          ? text || t("team.coach.startWithoutIdea", {
              skills: selectedSkills.join(", ") || t("team.coach.noSkills"),
            })
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
        attachedSkills?: string[];
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      if (data.sessionId) setSessionId(data.sessionId);
      if (data.sessionFile) setSessionFile(data.sessionFile);
      setMissingSkills(data.missingSkills ?? []);
      const assistantText =
        (data.assistantText ?? "").trim() || t("team.coach.emptyResponse");
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
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {t("team.coach.title")}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8, lineHeight: 1.4 }}>
        {t("team.coach.subtitle")}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          {t("team.coach.skills")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {skillChoices.slice(0, 12).map((s) => {
            const on = selectedSkills.includes(s.name);
            return (
              <button
                key={s.name}
                type="button"
                disabled={running || Boolean(sessionId)}
                title={s.description || s.name}
                onClick={() => toggleSkill(s.name)}
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "#fff" : "var(--text-muted)",
                  fontSize: 11,
                  cursor: running || sessionId ? "not-allowed" : "pointer",
                  opacity: running || sessionId ? 0.7 : 1,
                }}
              >
                {s.name}
              </button>
            );
          })}
        </div>
        {sessionId && (
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
            {t("team.coach.skillsLocked")}
          </div>
        )}
        {missingSkills.length > 0 && (
          <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 4 }}>
            {t("team.coach.missingSkills", { skills: missingSkills.join(", ") })}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          {t("team.coach.model")}
        </div>
        <select
          value={modelValue}
          disabled={running || Boolean(sessionId) || models.length === 0}
          onChange={(e) => {
            const [p, id] = e.target.value.split(":::");
            setProvider(p || "");
            setModelId(id || "");
          }}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 12,
          }}
        >
          {models.length === 0 ? (
            <option value="">{t("team.coach.sessionDefaultModel")}</option>
          ) : (
            models.map((m) => (
              <option key={`${m.provider}/${m.id}`} value={`${m.provider}:::${m.id}`}>
                {m.provider} / {m.name || m.id}
              </option>
            ))
          )}
        </select>
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
                {m.role === "user"
                  ? t("team.coach.you")
                  : t("team.coach.coach")}
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
            placeholder={t("team.coach.ideaPlaceholder")}
            rows={3}
            style={inputStyle}
            disabled={running || !cwd}
          />
          <button
            onClick={() => void send("start")}
            disabled={running || !cwd}
            style={btnStyle(running || !cwd)}
          >
            {running
              ? t("team.coach.thinking")
              : t("team.coach.start")}
          </button>
        </>
      ) : (
        <>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t("team.coach.replyPlaceholder")}
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
              {running
                ? t("team.coach.thinking")
                : t("team.coach.sendReply")}
            </button>
            {onOpenSession && sessionId && (
              <button
                onClick={() => onOpenSession(sessionId)}
                disabled={running}
                style={{
                  ...btnStyle(running),
                  flex: "0 0 auto",
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {t("team.coach.openChat")}
              </button>
            )}
          </div>
        </>
      )}

      {draft && (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-panel)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            {draftErrors.length === 0
              ? t("team.coach.draftReady")
              : t("team.coach.draftNeedsFixes")}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
            {t("team.coach.draftSummary", {
              outcome: draft.outcome || "—",
              primaryPath: draft.primaryPath || "—",
              count: draft.acceptanceChecks.length,
              checks:
                draft.acceptanceChecks.map((c, i) => `  ${i + 1}. ${c}`).join("\n") ||
                "  —",
            })}
          </div>
          {draftErrors.length > 0 && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
              {draftErrors.join("; ")}
            </div>
          )}
          <button
            onClick={() => onApplyDraft(draft)}
            disabled={running}
            style={{
              ...btnStyle(running),
              marginTop: 6,
              background: draftErrors.length === 0 ? "var(--accent)" : "#64748b",
            }}
          >
            {t("team.coach.applyDraft")}
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
