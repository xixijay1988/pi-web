import type { GoalSpec } from "./goal-spec";
import type { TeamToolPreset } from "./types";

export type AlignmentStatus =
  | "active"
  | "ready_for_goal"
  | "consumed"
  | "abandoned";

export type AlignmentMessageKind = "user" | "assistant" | "system" | "goal_spec";

export type AlignmentParticipant = {
  seatId: string;
  name: string;
  description: string;
  systemPrompt: string;
  provider: string;
  modelId: string;
  toolPreset: TeamToolPreset;
  skillNames: string[];
  sessionId?: string;
  sessionFile?: string;
  enabled: boolean;
};

export type AlignmentMessage = {
  id: string;
  at: string;
  from: "human" | string; // seatId
  text: string;
  kind: AlignmentMessageKind;
};

export type AlignmentBudget = {
  maxTurns: number;
  maxDurationMs: number;
};

export type AlignmentRoom = {
  id: string;
  cwd: string;
  status: AlignmentStatus;
  idea: string;
  participants: AlignmentParticipant[];
  transcript: AlignmentMessage[];
  /** Index into enabled participants for next advance */
  nextSeatIndex: number;
  turnCount: number;
  draftGoalSpec?: GoalSpec;
  draftErrors?: string[];
  teamRunId?: string;
  budget: AlignmentBudget;
  createdAt: string;
  updatedAt: string;
};

export type AlignmentListItem = {
  id: string;
  cwd: string;
  status: AlignmentStatus;
  idea: string;
  updatedAt: string;
  participantNames: string[];
  turnCount: number;
};
