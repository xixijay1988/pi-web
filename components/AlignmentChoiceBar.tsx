"use client";

import { useI18n } from "@/hooks/useI18n";

import type { CSSProperties } from "react";
import type { ChoicePrompt } from "@/lib/team-runs/choice-parse";

/** Inline choice chips under a coach message (not a blocking modal). */
export function AlignmentChoiceBar({
  prompt,
  disabled,
  onPick,
}: {
  prompt: ChoicePrompt;
  disabled?: boolean;
  onPick: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
        {t("team.choice.quickReply")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {prompt.choices.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(c.value)}
            style={choiceBtn(Boolean(disabled))}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Full-screen style select dialog (similar to Chat extension select). */
export function AlignmentSelectDialog({
  title,
  prompt,
  disabled,
  onPick,
  onDismiss,
}: {
  title?: string;
  prompt: ChoicePrompt;
  disabled?: boolean;
  onPick: (value: string) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.35)",
      }}
      onClick={onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          maxHeight: "80vh",
          overflow: "auto",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--bg-panel)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
          padding: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 6 }}>
          {title ?? t("team.choice.choose")}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {prompt.prompt}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {prompt.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(c.value)}
              style={choiceBtn(Boolean(disabled))}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {t("team.choice.typeOwn")}
        </button>
      </div>
    </div>
  );
}

function choiceBtn(disabled: boolean): CSSProperties {
  return {
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 13,
    lineHeight: 1.4,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}
