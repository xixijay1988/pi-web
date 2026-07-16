export type Locale = "en" | "zh-CN";

export const LOCALE_STORAGE_KEY = "pi-locale";

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  return null;
}

export function detectBrowserLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale === "zh-CN") return locale;
  }
  return "en";
}

export function resolveInitialLocale(
  storedValue: unknown,
  browserLanguages: readonly string[],
): Locale {
  return normalizeLocale(storedValue) ?? detectBrowserLocale(browserLanguages);
}
