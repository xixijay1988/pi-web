import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import {
  projectAlignmentNotesPath,
  teamAlignmentPath,
  teamAlignmentsDir,
} from "./paths";
import { atomicWriteJson } from "./store";
import { DEFAULT_ALIGNMENT_BUDGET, defaultAlignmentParticipants } from "./alignment-defaults";
import type {
  AlignmentListItem,
  AlignmentMessage,
  AlignmentParticipant,
  AlignmentRoom,
} from "./alignment-types";
import { writeFileSync } from "fs";

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readAlignment(id: string, agentDir?: string): AlignmentRoom | null {
  const path = teamAlignmentPath(id, agentDir);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as AlignmentRoom;
}

export function writeAlignment(room: AlignmentRoom, agentDir?: string): AlignmentRoom {
  const next: AlignmentRoom = { ...room, updatedAt: nowIso() };
  atomicWriteJson(teamAlignmentPath(next.id, agentDir), next);
  return next;
}

export function listAlignments(agentDir?: string): AlignmentListItem[] {
  const dir = teamAlignmentsDir(agentDir);
  if (!existsSync(dir)) return [];
  const items: AlignmentListItem[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const room = JSON.parse(readFileSync(join(dir, name), "utf8")) as AlignmentRoom;
      items.push({
        id: room.id,
        cwd: room.cwd,
        status: room.status,
        idea: room.idea,
        updatedAt: room.updatedAt,
        participantNames: room.participants.filter((p) => p.enabled).map((p) => p.name),
        turnCount: room.turnCount,
      });
    } catch {
      // skip
    }
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
}

export type CreateAlignmentInput = {
  cwd: string;
  idea?: string;
  participants?: AlignmentParticipant[];
  facilitator?: { provider?: string; modelId?: string; skillNames?: string[] };
  architect?: { provider?: string; modelId?: string };
  includeProductCritic?: boolean;
  agentDir?: string;
};

export function createAlignmentRoom(input: CreateAlignmentInput): AlignmentRoom {
  const createdAt = nowIso();
  const participants =
    input.participants ??
    defaultAlignmentParticipants({
      facilitator: input.facilitator,
      architect: input.architect,
      includeProductCritic: input.includeProductCritic,
    });

  const room: AlignmentRoom = {
    id: randomUUID(),
    cwd: input.cwd,
    status: "active",
    idea: (input.idea ?? "").trim(),
    participants: participants.map((p) => ({ ...p })),
    transcript: [],
    nextSeatIndex: 0,
    turnCount: 0,
    budget: { ...DEFAULT_ALIGNMENT_BUDGET },
    createdAt,
    updatedAt: createdAt,
  };

  ensureDir(teamAlignmentsDir(input.agentDir));
  return writeAlignment(room, input.agentDir);
}

export function appendAlignmentMessage(
  room: AlignmentRoom,
  message: Omit<AlignmentMessage, "id" | "at"> & { id?: string; at?: string },
  agentDir?: string,
): AlignmentRoom {
  const full: AlignmentMessage = {
    id: message.id ?? randomUUID(),
    at: message.at ?? nowIso(),
    from: message.from,
    text: message.text,
    kind: message.kind,
  };
  return writeAlignment(
    {
      ...room,
      transcript: [...room.transcript, full],
    },
    agentDir,
  );
}

export function updateParticipantSession(
  room: AlignmentRoom,
  seatId: string,
  session: { sessionId: string; sessionFile: string },
  agentDir?: string,
): AlignmentRoom {
  const participants = room.participants.map((p) =>
    p.seatId === seatId
      ? { ...p, sessionId: session.sessionId, sessionFile: session.sessionFile }
      : p,
  );
  return writeAlignment({ ...room, participants }, agentDir);
}

export function deleteAlignment(id: string, agentDir?: string): boolean {
  const path = teamAlignmentPath(id, agentDir);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

export function writeAlignmentNotes(cwd: string, room: AlignmentRoom): void {
  const lines = [
    `# Alignment notes`,
    ``,
    `Room: ${room.id}`,
    `Idea: ${room.idea || "(none)"}`,
    ``,
    `## Transcript`,
    ``,
  ];
  for (const m of room.transcript) {
    const who = m.from === "human" ? "Human" : (room.participants.find((p) => p.seatId === m.from)?.name ?? m.from);
    lines.push(`### ${who} (${m.kind})`, m.text, ``);
  }
  writeFileSync(projectAlignmentNotesPath(cwd), lines.join("\n"), "utf8");
}

export function enabledParticipants(room: AlignmentRoom): AlignmentParticipant[] {
  return room.participants.filter((p) => p.enabled);
}

export function pickNextParticipant(room: AlignmentRoom): AlignmentParticipant | null {
  const enabled = enabledParticipants(room);
  if (enabled.length === 0) return null;
  const idx = room.nextSeatIndex % enabled.length;
  return enabled[idx] ?? null;
}

export function advanceSeatIndex(room: AlignmentRoom): number {
  const enabled = enabledParticipants(room);
  if (enabled.length === 0) return 0;
  return (room.nextSeatIndex + 1) % enabled.length;
}

export function formatTranscriptForPrompt(room: AlignmentRoom, maxChars = 10_000): string {
  const lines: string[] = [];
  for (const m of room.transcript) {
    const who =
      m.from === "human"
        ? "Human"
        : (room.participants.find((p) => p.seatId === m.from)?.name ?? m.from);
    lines.push(`### ${who}\n${m.text}`);
  }
  let out = lines.join("\n\n");
  if (out.length > maxChars) out = out.slice(out.length - maxChars);
  return out;
}
