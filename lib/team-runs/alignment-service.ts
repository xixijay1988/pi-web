import type { RoleTemplate } from "./types";
import type { AlignmentParticipant, AlignmentRoom } from "./alignment-types";
import {
  appendAlignmentMessage,
  advanceSeatIndex,
  formatTranscriptForPrompt,
  pickNextParticipant,
  readAlignment,
  updateParticipantSession,
  writeAlignment,
  writeAlignmentNotes,
} from "./alignment-store";
import { extractGoalSpecFromCoachText } from "./goal-coach";
import {
  formatSkillsForFacilitator,
  loadSkillBodies,
  mergeSystemPromptWithSkills,
} from "./skills-inject";
import { ensureRoleSession } from "./engine/sessions";
import { waitForSessionIdle } from "./engine/wait";
import { validateGoalSpec } from "./goal-spec";

function participantAsRole(p: AlignmentParticipant, systemPrompt: string): RoleTemplate {
  return {
    roleId: `align_${p.seatId}`,
    name: p.name,
    description: p.description,
    systemPrompt,
    provider: p.provider,
    modelId: p.modelId,
    toolPreset: p.toolPreset,
  };
}

async function buildSystemPrompt(cwd: string, p: AlignmentParticipant): Promise<{
  systemPrompt: string;
  missingSkills: string[];
  attachedSkills: string[];
}> {
  const { skills, missing } = await loadSkillBodies(cwd, p.skillNames ?? []);
  const block = formatSkillsForFacilitator(skills);
  return {
    systemPrompt: mergeSystemPromptWithSkills(p.systemPrompt, block),
    missingSkills: missing,
    attachedSkills: skills.map((s) => s.name),
  };
}

function buildTurnPrompt(room: AlignmentRoom, seat: AlignmentParticipant, mode: "advance" | "synthesize"): string {
  const transcript = formatTranscriptForPrompt(room);
  const idea = room.idea || "(no initial idea — use transcript)";
  if (mode === "synthesize") {
    return [
      "Synthesize a strong Goal Spec from the Alignment Room transcript.",
      "This is pre-execution only — do not implement.",
      "",
      `## Original idea`,
      idea,
      "",
      `## Shared transcript`,
      transcript || "(empty)",
      "",
      "When ready, emit exactly one fenced ```goal_spec block with Outcome, Primary Path, ≥3 Acceptance Checks,",
      "and optional Constraints / Out of Scope. If information is still missing, ask the human at most 3 questions instead.",
    ].join("\n");
  }

  if (seat.seatId === "facilitator") {
    return [
      "You are the Facilitator in a multi-seat Alignment Room.",
      "Interview / refine toward a strong Goal Spec. Other seats may critique next.",
      "Do not implement product code.",
      "",
      `## Original idea`,
      idea,
      "",
      `## Shared transcript so far`,
      transcript || "(empty — start the interview)",
      "",
      "If the Goal Spec is ready, emit a ```goal_spec fence. Otherwise ask focused questions.",
    ].join("\n");
  }

  return [
    `You are ${seat.name} (${seat.seatId}) in a multi-seat Alignment Room.`,
    "Read the transcript. Give a concise critique or answers. Do not implement.",
    "",
    `## Original idea`,
    idea,
    "",
    `## Shared transcript`,
    transcript || "(empty)",
    "",
    "Respond with critique, risks, and concrete Goal Spec improvements. Prefer bullets.",
  ].join("\n");
}

async function runSeatTurn(
  room: AlignmentRoom,
  seat: AlignmentParticipant,
  mode: "advance" | "synthesize",
  agentDir?: string,
): Promise<{ room: AlignmentRoom; missingSkills: string[]; attachedSkills: string[] }> {
  if (room.status === "consumed" || room.status === "abandoned") {
    throw new Error(`Alignment room is ${room.status}`);
  }
  if (room.turnCount >= room.budget.maxTurns) {
    throw new Error(`Alignment turn budget exceeded (${room.budget.maxTurns})`);
  }
  const created = Date.parse(room.createdAt);
  if (Number.isFinite(created) && Date.now() - created > room.budget.maxDurationMs) {
    throw new Error("Alignment duration budget exceeded");
  }

  const { systemPrompt, missingSkills, attachedSkills } = await buildSystemPrompt(room.cwd, seat);
  const role = participantAsRole(seat, systemPrompt);
  const ensured = await ensureRoleSession({
    cwd: room.cwd,
    role,
    sessionId: seat.sessionId,
    sessionFile: seat.sessionFile,
  });

  try {
    await ensured.session.send({
      type: "set_session_name",
      name: `Align: ${seat.name}`,
    });
  } catch {
    // ignore
  }

  room = updateParticipantSession(
    room,
    seat.seatId,
    { sessionId: ensured.sessionId, sessionFile: ensured.sessionFile },
    agentDir,
  );

  const prompt = buildTurnPrompt(room, seat, mode);
  await ensured.session.send({ type: "prompt", message: prompt });
  const wait = await waitForSessionIdle(ensured.session, {
    isCurrent: () => ensured.session.isAlive(),
    timeoutMs: 10 * 60 * 1000,
  });
  if (wait === "timeout") throw new Error(`Seat ${seat.seatId} timed out`);
  if (wait === "destroyed") throw new Error(`Seat ${seat.seatId} session destroyed`);

  const last = (await ensured.session.send({ type: "get_last_assistant_text" })) as { text?: string };
  const text = (last?.text ?? "").trim() || "(empty model response)";

  const extracted = extractGoalSpecFromCoachText(text);
  const kind: "assistant" | "goal_spec" = extracted.draft ? "goal_spec" : "assistant";

  room = appendAlignmentMessage(
    room,
    { from: seat.seatId, text, kind },
    agentDir,
  );

  room = writeAlignment(
    {
      ...room,
      turnCount: room.turnCount + 1,
      nextSeatIndex: mode === "synthesize" ? room.nextSeatIndex : advanceSeatIndex(room),
      draftGoalSpec: extracted.draft ?? room.draftGoalSpec,
      draftErrors: extracted.draft ? extracted.errors : room.draftErrors,
      status:
        extracted.draft && extracted.errors.length === 0
          ? "ready_for_goal"
          : room.status === "ready_for_goal"
            ? "ready_for_goal"
            : "active",
    },
    agentDir,
  );

  return { room, missingSkills, attachedSkills };
}

export async function alignmentHumanMessage(
  alignmentId: string,
  text: string,
  agentDir?: string,
): Promise<AlignmentRoom> {
  let room = readAlignment(alignmentId, agentDir);
  if (!room) throw new Error("Alignment room not found");
  const trimmed = text.trim();
  if (!trimmed) throw new Error("message required");
  if (room.status === "consumed" || room.status === "abandoned") {
    throw new Error(`Alignment room is ${room.status}`);
  }
  room = appendAlignmentMessage(room, { from: "human", text: trimmed, kind: "user" }, agentDir);
  // After human input, prefer facilitator next
  const enabled = room.participants.filter((p) => p.enabled);
  const facIdx = enabled.findIndex((p) => p.seatId === "facilitator");
  return writeAlignment(
    {
      ...room,
      nextSeatIndex: facIdx >= 0 ? facIdx : room.nextSeatIndex,
      status: room.status === "ready_for_goal" ? "active" : room.status,
    },
    agentDir,
  );
}

export async function alignmentAdvance(
  alignmentId: string,
  agentDir?: string,
): Promise<{ room: AlignmentRoom; seatId: string; missingSkills: string[]; attachedSkills: string[] }> {
  const room0 = readAlignment(alignmentId, agentDir);
  if (!room0) throw new Error("Alignment room not found");
  const seat = pickNextParticipant(room0);
  if (!seat) throw new Error("No enabled participants");
  const { room, missingSkills, attachedSkills } = await runSeatTurn(room0, seat, "advance", agentDir);
  return { room, seatId: seat.seatId, missingSkills, attachedSkills };
}

export async function alignmentSynthesize(
  alignmentId: string,
  agentDir?: string,
): Promise<{ room: AlignmentRoom; missingSkills: string[]; attachedSkills: string[] }> {
  const room0 = readAlignment(alignmentId, agentDir);
  if (!room0) throw new Error("Alignment room not found");
  const fac =
    room0.participants.find((p) => p.seatId === "facilitator" && p.enabled) ??
    room0.participants.find((p) => p.enabled);
  if (!fac) throw new Error("No facilitator/enabled seat");
  return runSeatTurn(room0, fac, "synthesize", agentDir);
}

export function alignmentAbandon(alignmentId: string, agentDir?: string): AlignmentRoom {
  const room = readAlignment(alignmentId, agentDir);
  if (!room) throw new Error("Alignment room not found");
  return writeAlignment({ ...room, status: "abandoned" }, agentDir);
}

export function alignmentMarkConsumed(
  alignmentId: string,
  teamRunId: string,
  agentDir?: string,
): AlignmentRoom {
  const room = readAlignment(alignmentId, agentDir);
  if (!room) throw new Error("Alignment room not found");
  const next = writeAlignment(
    { ...room, status: "consumed", teamRunId },
    agentDir,
  );
  try {
    writeAlignmentNotes(room.cwd, next);
  } catch {
    // non-fatal
  }
  return next;
}

export function alignmentExportDraft(alignmentId: string, agentDir?: string): {
  room: AlignmentRoom;
  ok: boolean;
  errors: string[];
} {
  const room = readAlignment(alignmentId, agentDir);
  if (!room) throw new Error("Alignment room not found");
  if (!room.draftGoalSpec) {
    return { room, ok: false, errors: ["No draft Goal Spec yet — run synthesize or continue discussion"] };
  }
  const v = validateGoalSpec(room.draftGoalSpec, { requireStrong: true });
  return { room, ok: v.ok, errors: v.errors };
}
