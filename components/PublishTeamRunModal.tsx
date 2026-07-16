"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { GoalSpec } from "@/lib/team-runs/goal-spec";
import { validateGoalSpec } from "@/lib/team-runs/goal-spec";

export function PublishTeamRunModal({
  cwd,
  initial,
  notes,
  warnings,
  onClose,
  onPublished,
}: {
  cwd: string;
  initial?: GoalSpec;
  notes?: string;
  warnings?: string[];
  onClose: () => void;
  onPublished: (runId: string) => void;
}) {
  const { t } = useI18n();
  const [outcome, setOutcome] = useState(initial?.outcome ?? "");
  const [primaryPath, setPrimaryPath] = useState(initial?.primaryPath ?? "");
  const [acceptanceText, setAcceptanceText] = useState(
    (initial?.acceptanceChecks ?? []).map((c, i) => `${i + 1}. ${c}`).join("\n"),
  );
  const [constraints, setConstraints] = useState(initial?.constraints ?? "");
  const [outOfScope, setOutOfScope] = useState(initial?.outOfScope ?? "");
  const [extraNotes, setExtraNotes] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    const acceptanceChecks = acceptanceText
      .split(/\n/)
      .map((l) => l.replace(/^\s*(?:\d+[.)]\s*|[-*]\s*)/, "").trim())
      .filter(Boolean);
    return validateGoalSpec(
      {
        outcome: outcome.trim(),
        primaryPath: primaryPath.trim(),
        acceptanceChecks,
        constraints: constraints.trim() || undefined,
        outOfScope: outOfScope.trim() || undefined,
        notes: extraNotes.trim() || undefined,
      },
      { requireStrong: true },
    );
  }, [outcome, primaryPath, acceptanceText, constraints, outOfScope, extraNotes]);

  const publish = async () => {
    if (!preview.ok || !preview.spec) {
      setError(preview.errors.join("; ") || t("team.publish.goalIncomplete"));
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
          outcome: preview.spec.outcome,
          primaryPath: preview.spec.primaryPath,
          acceptanceChecks: preview.spec.acceptanceChecks,
          constraints: preview.spec.constraints,
          outOfScope: preview.spec.outOfScope,
          notes: preview.spec.notes,
          requireStrongGoal: true,
          start: true,
        }),
      });
      const data = (await res.json()) as {
        run?: { id: string };
        error?: string;
        errors?: string[];
      };
      if (!res.ok) throw new Error(data.error || data.errors?.join("; ") || `HTTP ${res.status}`);
      if (!data.run?.id) throw new Error(t("team.publish.noRunId"));
      onPublished(data.run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 650 }}>
              {t("team.publish.title")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.4 }}>
              {t("team.publish.subtitle", { path: shorten(cwd) })}
            </div>
          </div>
          <button onClick={onClose} style={ghostBtn} aria-label={t("common.close")}>✕</button>
        </div>

        {(warnings?.length ?? 0) > 0 && (
          <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 8, lineHeight: 1.4 }}>
            {warnings!.join("; ")}
          </div>
        )}

        <Field label={t("team.publish.outcome")}>
          <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} style={fieldStyle} />
        </Field>
        <Field label={t("team.publish.primaryPath")}>
          <textarea
            value={primaryPath}
            onChange={(e) => setPrimaryPath(e.target.value)}
            rows={2}
            style={fieldStyle}
            placeholder={t("team.publish.primaryPathPlaceholder")}
          />
        </Field>
        <Field label={t("team.publish.acceptanceChecks")}>
          <textarea value={acceptanceText} onChange={(e) => setAcceptanceText(e.target.value)} rows={4} style={fieldStyle} />
        </Field>
        <details style={{ marginBottom: 8 }}>
          <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
            {t("team.publish.optional")}
          </summary>
          <Field label={t("team.publish.constraints")}>
            <textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} rows={2} style={fieldStyle} />
          </Field>
          <Field label={t("team.publish.outOfScope")}>
            <textarea value={outOfScope} onChange={(e) => setOutOfScope(e.target.value)} rows={2} style={fieldStyle} />
          </Field>
          <Field label={t("team.publish.discussionNotes")}>
            <textarea value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} rows={4} style={fieldStyle} />
          </Field>
        </details>

        {!preview.ok && (
          <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>
            {preview.errors.join("; ")}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ ...secondaryBtn, flex: 1 }}>
            {t("common.cancel")}
          </button>
          <button
            onClick={() => void publish()}
            disabled={busy || !preview.ok}
            style={{
              ...primaryBtn,
              flex: 2,
              opacity: busy || !preview.ok ? 0.55 : 1,
              cursor: busy || !preview.ok ? "not-allowed" : "pointer",
            }}
          >
            {busy
              ? t("team.publish.publishing")
              : t("team.publish.confirmStart")}
          </button>
        </div>
      </div>
    </div>
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

function shorten(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

const fieldStyle: CSSProperties = {
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

const primaryBtn: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
};

const secondaryBtn: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 12,
};

const ghostBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};
