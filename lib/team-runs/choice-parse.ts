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

type ListItem = {
  marker: string;
  value: string;
  lineIndex: number;
  kind: "letter" | "number";
};

const QUESTION_RE =
  /[?？]|你更倾向|二选一|三选一|多选一|还是|哪一个|哪个|选择|选哪个|pick\b|choose\b|which\b|prefer\b|or\b/i;

/** Sequential / procedural phrasing — not a multiple-choice answer set. */
const STEP_RE =
  /^(?:在|到|打开|执行|运行|安装|创建|启动|浏览|进入|点击|输入|然后|接着|首先|其次|最后|step\b|run\b|install\b|open\b|go to\b|navigate\b|execute\b)/i;

const STEP_CONTEXT_RE =
  /固定流程|操作步骤|步骤如下|流程为|按以下步骤|follow these steps|steps?:|procedure|workflow/i;

/**
 * Best-effort extraction of multiple-choice questions from coach text.
 *
 * Prefer lettered A/B/C alternatives. Numbered lists are only treated as
 * choices when they look like alternatives to pick — not procedural steps
 * (e.g. npm install → npm run dev → open URL).
 */
export function parseChoicePrompt(text: string): ChoicePrompt | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  const lines = raw.split(/\n/);
  const items: ListItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const t = stripMd(lines[i]);
    if (!t) continue;

    const letm = t.match(/^([A-Da-d])[.)、:]\s+(.+)$/);
    if (letm) {
      const value = cleanValue(letm[2]);
      if (isPlausibleOptionValue(value)) {
        items.push({ marker: letm[1].toUpperCase(), value, lineIndex: i, kind: "letter" });
      }
      continue;
    }

    const num = t.match(/^(\d+)[.)、:]\s+(.+)$/);
    if (num) {
      const value = cleanValue(num[2]);
      if (isPlausibleOptionValue(value)) {
        items.push({ marker: num[1], value, lineIndex: i, kind: "number" });
      }
    }
  }

  if (items.length < 2) return null;

  // Prefer the last contiguous block of same kind (2–6 items).
  const block = lastContiguousBlock(items);
  if (!block || block.length < 2 || block.length > 6) return null;

  const kind = block[0].kind;
  if (kind === "letter") {
    // Lettered A/B/... is the intended choice format.
    if (!looksLikeLetterSequence(block)) return null;
  } else {
    // Numbered: require choice-ish context and reject procedures.
    if (isProceduralBlock(raw, lines, block)) return null;
    if (!hasChoiceContext(raw, lines, block)) return null;
    // Pure ordered procedure (every item is a step verb) without exclusive alternatives
    const stepish = block.filter((b) => STEP_RE.test(b.value)).length;
    const commandish = block.filter((b) => looksLikeCommandStep(b.value)).length;
    if (stepish === block.length) return null;
    // install+run+open style already handled by isProceduralBlock; if most items are
    // imperative steps AND text has flow language, reject
    if (stepish >= Math.ceil(block.length * 0.6) && STEP_CONTEXT_RE.test(raw)) return null;
    if (commandish === block.length && STEP_CONTEXT_RE.test(raw)) return null;
  }

  const firstIdx = block[0].lineIndex;
  let prompt = lines.slice(0, firstIdx).join("\n").trim();
  prompt = prompt.replace(/(?:\n|^)\s*(?:[A-Da-d]|\d+)[.)、:]\s*$/m, "").trim();
  if (!prompt) {
    // Fallback: nearby sentence before the list
    prompt = "Choose an option:";
  }
  if (prompt.length > 420) prompt = `${prompt.slice(prompt.length - 420)}`;
  // Prefer last question-ish paragraph as prompt surface
  const paras = prompt.split(/\n{2,}/);
  const lastQ = [...paras].reverse().find((p) => QUESTION_RE.test(p)) ?? paras[paras.length - 1];
  prompt = (lastQ || prompt).trim();

  return {
    prompt: prompt || "Choose an option:",
    choices: block.map((b, i) => ({
      id: `c${i}`,
      label: kind === "letter" ? `${b.marker}) ${b.value}` : `${b.marker}. ${b.value}`,
      value: b.value,
    })),
  };
}

function stripMd(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, (m) => m); // keep numbered for main matcher via raw; this only strips bullets
}

function cleanValue(v: string): string {
  return v
    .replace(/^[`*]+|[`*]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlausibleOptionValue(value: string): boolean {
  if (value.length < 2 || value.length > 200) return false;
  // Avoid capturing long prose paragraphs mis-marked
  if (value.length > 120 && /[。；;]/.test(value)) return false;
  return true;
}

function lastContiguousBlock(items: ListItem[]): ListItem[] | null {
  if (items.length === 0) return null;
  // Walk from end; gather same-kind items with nearby line indices
  const last = items[items.length - 1];
  const block: ListItem[] = [last];
  for (let i = items.length - 2; i >= 0; i--) {
    const cur = items[i];
    const prev = block[0];
    if (cur.kind !== prev.kind) break;
    if (prev.lineIndex - cur.lineIndex > 2) break; // allow one blank line
    block.unshift(cur);
  }
  return block;
}

function looksLikeLetterSequence(block: ListItem[]): boolean {
  const expected = "ABCDEFG";
  return block.every((b, i) => b.marker === expected[i]);
}

function hasChoiceContext(raw: string, lines: string[], block: ListItem[]): boolean {
  if (QUESTION_RE.test(raw)) return true;
  const start = Math.max(0, block[0].lineIndex - 6);
  const window = lines.slice(start, block[0].lineIndex + 1).join("\n");
  return QUESTION_RE.test(window);
}

function isProceduralBlock(raw: string, lines: string[], block: ListItem[]): boolean {
  if (STEP_CONTEXT_RE.test(raw)) {
    // If the block sits under a "fixed flow / steps" section, never treat as choices
    const start = Math.max(0, block[0].lineIndex - 8);
    const window = lines.slice(start, block[0].lineIndex).join("\n");
    if (STEP_CONTEXT_RE.test(window) || STEP_CONTEXT_RE.test(raw)) return true;
  }
  // Classic install → run → open URL procedure
  const joined = block.map((b) => b.value).join(" | ");
  if (/npm\s+install/i.test(joined) && /npm\s+run\s+dev|localhost/i.test(joined)) return true;
  if (/安装/.test(joined) && /运行|启动|打开/.test(joined)) return true;
  return false;
}

function looksLikeCommandStep(value: string): boolean {
  return (
    /`[^`]+`/.test(value) ||
    /\bnpm\b|\byarn\b|\bpnpm\b|\bcurl\b|\bhttp:\/\//i.test(value) ||
    /localhost:\d+/i.test(value)
  );
}
