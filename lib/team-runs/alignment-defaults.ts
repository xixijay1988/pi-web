import { GOAL_COACH_ROLE } from "./goal-coach";
import type { AlignmentBudget, AlignmentParticipant } from "./alignment-types";

export const DEFAULT_ALIGNMENT_BUDGET: AlignmentBudget = {
  maxTurns: 24,
  maxDurationMs: 60 * 60 * 1000,
};

export function defaultAlignmentParticipants(opts?: {
  facilitator?: { provider?: string; modelId?: string; skillNames?: string[] };
  architect?: { provider?: string; modelId?: string };
  includeProductCritic?: boolean;
  product?: { provider?: string; modelId?: string };
}): AlignmentParticipant[] {
  const facProvider = opts?.facilitator?.provider ?? "";
  const facModel = opts?.facilitator?.modelId ?? "";
  const archProvider = opts?.architect?.provider ?? facProvider;
  const archModel = opts?.architect?.modelId ?? facModel;
  const productProvider = opts?.product?.provider ?? facProvider;
  const productModel = opts?.product?.modelId ?? facModel;

  const seats: AlignmentParticipant[] = [
    {
      seatId: "facilitator",
      name: "Goal Coach",
      description: "Interviews and synthesizes Goal Spec",
      systemPrompt: GOAL_COACH_ROLE.systemPrompt,
      provider: facProvider,
      modelId: facModel,
      toolPreset: "readonly",
      skillNames: opts?.facilitator?.skillNames ?? ["grill-me", "team-goal"],
      enabled: true,
    },
    {
      seatId: "architect_critic",
      name: "Architect critic",
      description: "Challenges Primary Path and environment risks",
      systemPrompt: [
        "You are the Architect critic in an Alignment Room (pre-execution only).",
        "Do NOT implement code. Do NOT write project files.",
        "Review the shared transcript and challenge:",
        "- Is Primary Path the real human path (file:// vs server vs app)?",
        "- Environment risks (ES modules, CORS, auth, localStorage)",
        "- Missing acceptance checks a human can observe",
        "- Scope creep vs out-of-scope",
        "Be concise. Ask at most 3 sharp questions OR propose concrete Goal Spec edits.",
        "If the Goal Spec is already strong, say what still worries you in 3 bullets.",
        "Never emit a final ```goal_spec unless the facilitator asked you to draft one;",
        "prefer critique; the facilitator synthesizes.",
      ].join("\n"),
      provider: archProvider,
      modelId: archModel,
      toolPreset: "readonly",
      skillNames: [],
      enabled: true,
    },
  ];

  if (opts?.includeProductCritic) {
    seats.push({
      seatId: "product_critic",
      name: "Product critic",
      description: "Challenges acceptance checks and out of scope",
      systemPrompt: [
        "You are the Product critic in an Alignment Room (pre-execution only).",
        "Focus on Outcome clarity, acceptance checks, and out-of-scope.",
        "Do not implement. Keep replies short and actionable.",
      ].join("\n"),
      provider: productProvider,
      modelId: productModel,
      toolPreset: "readonly",
      skillNames: [],
      enabled: true,
    });
  }

  return seats;
}
