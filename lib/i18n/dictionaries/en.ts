export const en = {
  "common.failedCount": "Failed {count} items",
  "navigation.chat": "Chat",
  "navigation.team": "Team",
  "navigation.chatMode": "Chat mode",
  "navigation.teamMode": "Team mode",
  "navigation.hideSidebar": "Hide sidebar",
  "navigation.showSidebar": "Show sidebar",
  "settings.models": "Models",
  "settings.skills": "Skills",
  "settings.plugins": "Plugins",
  "settings.roles": "Roles",
  "settings.language": "Interface language",
  "settings.languageCurrent": "Interface language: {language}",
  "settings.switchToEnglish": "Switch to English",
  "settings.switchToChinese": "Switch to Simplified Chinese",
  "settings.english": "English",
  "settings.chinese": "Simplified Chinese",
  "theme.switchToLight": "Switch to light mode",
  "theme.switchToDark": "Switch to dark mode",
} as const;

export type TranslationKey = keyof typeof en;
