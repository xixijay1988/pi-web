export type ParsedChoice = {
  id: string;
  label: string;
  /** Text to send when the user picks this option */
  value: string;
};

export type ChoicePrompt = {
  prompt: string;
  choices: ParsedChoice[];
};

/**
 * Best-effort extraction of multiple-choice questions from coach/assistant text.
 * Supports:
 * - 1. / 1) / 1:
 * - A. / A) / A:
 * - - / * bullets (only when 2–8 short items look like options)
 */
export function parseChoicePrompt(text: string): ChoicePrompt | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  const lines = raw.split(/\n/);
  const numbered: { label: string; value: string }[] = [];
  const lettered: { label: string; value: string }[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const num = t.match(/^(?:#{1,6}\s*)?(?:[-*]\s*)?(\d+)[.)、:]\s+(.+)$/);
    if (num) {
      const value = num[2].trim();
      if (value.length >= 2 && value.length <= 240) {
        numbered.push({ label: `${num[1]}. ${value}`, value });
      }
      continue;
    }
    const letm = t.match(/^(?:#{1,6}\s*)?(?:[-*]\s*)?([A-Da-d])[.)、:]\s+(.+)$/);
    if (letm) {
      const value = letm[2].trim();
      if (value.length >= 2 && value.length <= 240) {
        lettered.push({ label: `${letm[1].toUpperCase()}. ${value}`, value });
      }
    }
  }

  let picks = lettered.length >= 2 ? lettered : numbered.length >= 2 ? numbered : [];
  // Prefer a trailing option block (last 2–8 contiguous options)
  if (picks.length > 8) picks = picks.slice(-8);
  if (picks.length < 2 || picks.length > 8) return null;

  // Prompt = text before the first matched option line, truncated
  const firstValue = picks[0].value;
  const idx = raw.indexOf(firstValue);
  let prompt = idx > 0 ? raw.slice(0, idx).trim() : raw;
  // drop trailing list markers from prompt
  prompt = prompt.replace(/(?:\n|^)\s*(?:\d+[.)]|[A-Da-d][.)])\s*$/m, "").trim();
  if (prompt.length > 400) prompt = `${prompt.slice(0, 400)}…`;

  return {
    prompt: prompt || "Choose an option:",
    choices: picks.map((p, i) => ({
      id: `c${i}`,
      label: p.label,
      value: p.value,
    })),
  };
}
