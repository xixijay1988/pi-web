import { en, type TranslationKey } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";
import { interpolate, type TranslationVariables } from "./interpolate";
import type { Locale } from "./locale";

export type { TranslationVariables } from "./interpolate";
export type { Locale } from "./locale";
export type { TranslationKey } from "./dictionaries/en";

export const dictionaries = {
  en,
  "zh-CN": zhCN,
} satisfies Record<Locale, Record<TranslationKey, string>>;

export const translationKeys = Object.keys(en) as TranslationKey[];

export function translate(
  locale: Locale,
  key: TranslationKey,
  variables?: TranslationVariables,
): string {
  const runtimeKey = key as string;
  const localized = (dictionaries[locale] as Record<string, string | undefined>)[runtimeKey];
  const fallback = (en as Record<string, string | undefined>)[runtimeKey];
  const template = localized ?? fallback ?? runtimeKey;
  if (!localized && process.env.NODE_ENV === "development") {
    console.warn(`[i18n] Missing translation key: ${runtimeKey} (${locale})`);
  }
  return interpolate(template, variables);
}
