"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useI18n } from "@/hooks/useI18n";
import type { RoleTemplate, TeamToolPreset } from "@/lib/team-runs/types";

type ModelEntry = { id: string; name: string; provider: string };

const PRESETS: TeamToolPreset[] = ["none", "default", "full", "readonly", "team_writer"];

export function RolesConfig({
  cwd,
  onClose,
}: {
  cwd?: string | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const [scope, setScope] = useState<"global" | "project">("global");
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const selected = useMemo(
    () => roles.find((r) => r.roleId === selectedId) ?? roles[0] ?? null,
    [roles, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (scope === "global") {
        const res = await fetch("/api/team-roles");
        const d = await res.json() as { roles?: RoleTemplate[]; error?: string };
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        setRoles(d.roles ?? []);
        setSelectedId((id) => id ?? d.roles?.[0]?.roleId ?? null);
      } else {
        if (!cwd) throw new Error(t("roles.selectProject"));
        const res = await fetch(`/api/team-roles/project?cwd=${encodeURIComponent(cwd)}`);
        const d = await res.json() as { overrides?: RoleTemplate[]; resolved?: RoleTemplate[]; error?: string };
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        // Edit overrides if present; else show resolved as starting point for override list
        const list = (d.overrides && d.overrides.length > 0) ? d.overrides : (d.resolved ?? []);
        setRoles(list);
        setSelectedId((id) => id ?? list[0]?.roleId ?? null);
      }

      if (cwd) {
        const modelRes = await fetch(`/api/models?cwd=${encodeURIComponent(cwd)}`);
        if (modelRes.ok) {
          const md = await modelRes.json() as { modelList?: ModelEntry[] };
          setModels(md.modelList ?? []);
        }
      } else {
        setModels([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [scope, cwd, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateSelected = (patch: Partial<RoleTemplate>) => {
    if (!selected) return;
    setRoles((prev) =>
      prev.map((r) => (r.roleId === selected.roleId ? { ...r, ...patch } : r)),
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (scope === "global") {
        const res = await fetch("/api/team-roles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles }),
        });
        const d = await res.json() as { roles?: RoleTemplate[]; error?: string };
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        setRoles(d.roles ?? roles);
      } else {
        if (!cwd) throw new Error(t("roles.selectProject"));
        const res = await fetch("/api/team-roles/project", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd, roles }),
        });
        const d = await res.json() as { overrides?: RoleTemplate[]; error?: string };
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        setRoles(d.overrides ?? roles);
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const modelOptions = models.map((m) => ({
    value: `${m.provider}:::${m.id}`,
    label: `${m.provider} / ${m.name || m.id}`,
  }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? 12 : 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          height: isMobile ? "100%" : "min(720px, 92vh)",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: isMobile ? 10 : 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t("roles.title")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {t("roles.subtitle")}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              borderRadius: 6,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            {t("common.close")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
          {(["global", "project"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              disabled={s === "project" && !cwd}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: scope === s ? "var(--accent)" : "transparent",
                color: scope === s ? "#fff" : "var(--text)",
                cursor: s === "project" && !cwd ? "not-allowed" : "pointer",
                opacity: s === "project" && !cwd ? 0.5 : 1,
                fontSize: 12,
              }}
            >
              {s === "global" ? t("roles.global") : t("roles.projectOverride")}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => void save()}
            disabled={saving || loading}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: saving ? "wait" : "pointer",
              fontSize: 12,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {savedFlash ? t("common.saved") : saving ? t("common.saving") : t("common.save")}
          </button>
        </div>

        {error && (
          <div style={{ padding: "8px 16px", color: "#ef4444", fontSize: 12 }}>{error}</div>
        )}

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div
            style={{
              width: isMobile ? 120 : 200,
              borderRight: "1px solid var(--border)",
              overflow: "auto",
              padding: 8,
            }}
          >
            {loading ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: 8 }}>{t("common.loading")}</div>
            ) : (
              roles.map((r) => (
                <button
                  key={r.roleId}
                  onClick={() => setSelectedId(r.roleId)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: selected?.roleId === r.roleId ? "var(--bg-selected)" : "transparent",
                    color: "var(--text)",
                    cursor: "pointer",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{r.roleId}</div>
                </button>
              ))
            )}
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
            {!selected ? (
              <div style={{ color: "var(--text-dim)", fontSize: 13 }}>{t("roles.noSelection")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
                <Field label={t("roles.displayName")}>
                  <input
                    value={selected.name}
                    onChange={(e) => updateSelected({ name: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
                <Field label={t("roles.roleId")}>
                  <input value={selected.roleId} disabled style={{ ...inputStyle, opacity: 0.7 }} />
                </Field>
                <Field label={t("roles.description")}>
                  <input
                    value={selected.description}
                    onChange={(e) => updateSelected({ description: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
                <Field label={t("roles.model")}>
                  <select
                    value={selected.provider && selected.modelId ? `${selected.provider}:::${selected.modelId}` : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        updateSelected({ provider: "", modelId: "" });
                        return;
                      }
                      const [provider, modelId] = v.split(":::");
                      updateSelected({ provider, modelId });
                    }}
                    style={inputStyle}
                  >
                    <option value="">{t("roles.useGlobalModel")}</option>
                    {modelOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("roles.toolPreset")}>
                  <select
                    value={selected.toolPreset}
                    onChange={(e) => updateSelected({ toolPreset: e.target.value as TeamToolPreset })}
                    style={inputStyle}
                  >
                    {PRESETS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("roles.systemPrompt")}>
                  <textarea
                    value={selected.systemPrompt}
                    onChange={(e) => updateSelected({ systemPrompt: e.target.value })}
                    rows={10}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12 }}
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  outline: "none",
};
