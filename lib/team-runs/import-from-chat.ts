import type { AgentMessage } from "../types";
import type { GoalSpec } from "./goal-spec";
import { extractGoalSpecFromCoachText } from "./goal-coach";

function blockText(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const b = block as { type?: string; text?: string; thinking?: string };
  if (b.type === "text" && typeof b.text === "string") return b.text;
  return "";
}

/** Flatten one chat message to plain text (skips tool calls / thinking). */
export function messagePlainText(message: AgentMessage): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content.trim();
    if (Array.isArray(message.content)) {
      return message.content.map(blockText).filter(Boolean).join("\n").trim();
    }
    return "";
  }
  if (message.role === "assistant") {
    if (!Array.isArray(message.content)) return "";
    return message.content.map(blockText).filter(Boolean).join("\n").trim();
  }
  return "";
}

export function messagesToTranscript(
  messages: AgentMessage[],
  opts?: { maxMessages?: number; maxChars?: number },
): string {
  const maxMessages = opts?.maxMessages ?? 40;
  const maxChars = opts?.maxChars ?? 12_000;
  const slice = messages.slice(-maxMessages);
  const lines: string[] = [];
  for (const m of slice) {
    const text = messagePlainText(m);
    if (!text) continue;
    const who = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : m.role;
    lines.push(`### ${who}\n${text}`);
  }
  let out = lines.join("\n\n");
  if (out.length > maxChars) out = out.slice(out.length - maxChars);
  return out;
}

export type ChatGoalImport = {
  draft?: GoalSpec;
  draftErrors: string[];
  draftWarnings: string[];
  /** Best-effort discussion notes for Team create */
  notes: string;
  /** Where draft came from */
  source: "goal_spec_fence" | "transcript_only";
};

/**
 * Scan chat messages (newest first for fence) for a Goal Spec draft.
 * Prefer explicit ```goal_spec blocks from assistant (or user paste).
 */
export function extractGoalSpecFromMessages(messages: AgentMessage[]): ChatGoalImport {
  const transcript = messagesToTranscript(messages);
  // Prefer the most recent goal_spec fence anywhere in the conversation
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messagePlainText(messages[i]);
    if (!text) continue;
    const extracted = extractGoalSpecFromCoachText(text);
    if (extracted.draft) {
      return {
        draft: extracted.draft,
        draftErrors: extracted.errors,
        draftWarnings: extracted.warnings,
        notes: transcript,
        source: "goal_spec_fence",
      };
    }
  }

  // Whole transcript fallback (user may have a single long doc)
  const whole = extractGoalSpecFromCoachText(transcript);
  if (whole.draft) {
    return {
      draft: whole.draft,
      draftErrors: whole.errors,
      draftWarnings: whole.warnings,
      notes: transcript,
      source: "goal_spec_fence",
    };
  }

  return {
    draftErrors: [],
    draftWarnings: ["No ```goal_spec fence found — fill Outcome / Primary Path / checks manually"],
    notes: transcript,
    source: "transcript_only",
  };
}
