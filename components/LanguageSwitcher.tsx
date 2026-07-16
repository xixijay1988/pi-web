"use client";

import { useI18n } from "@/hooks/useI18n";

export function LanguageSwitcher({
  variant,
}: {
  variant: "toolbar" | "settings";
}) {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === "en" ? "zh-CN" : "en";
  const currentLanguage = locale === "en" ? t("settings.english") : t("settings.chinese");
  const actionLabel = locale === "en"
    ? t("settings.switchToChinese")
    : t("settings.switchToEnglish");

  if (variant === "toolbar") {
    return (
      <button
        type="button"
        onClick={() => setLocale(nextLocale)}
        title={actionLabel}
        aria-label={actionLabel}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 54,
          height: 36,
          padding: "0 8px",
          background: "none",
          border: "none",
          borderRight: "1px solid var(--border)",
          color: "var(--text-muted)",
          cursor: "pointer",
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 600,
        }}
        onMouseEnter={(event) => { event.currentTarget.style.color = "var(--text)"; }}
        onMouseLeave={(event) => { event.currentTarget.style.color = "var(--text-muted)"; }}
      >
        {locale === "en" ? "中文" : "English"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setLocale(nextLocale)}
      title={actionLabel}
      aria-label={actionLabel}
      style={{
        width: "100%",
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-panel)",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontSize: 11,
      }}
    >
      <span aria-hidden="true" style={{ fontWeight: 700 }}>文/A</span>
      <span>{t("settings.languageCurrent", { language: currentLanguage })}</span>
    </button>
  );
}
