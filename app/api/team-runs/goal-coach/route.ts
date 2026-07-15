import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { ensureRoleSession } from "@/lib/team-runs/engine/sessions";
import { waitForSessionIdle } from "@/lib/team-runs/engine/wait";
import {
  GOAL_COACH_ROLE,
  buildGoalCoachFollowUpMessage,
  buildGoalCoachKickoffMessage,
  extractGoalSpecFromCoachText,
  goalCoachSessionName,
} from "@/lib/team-runs/goal-coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  cwd?: unknown;
  message?: unknown;
  sessionId?: unknown;
  sessionFile?: unknown;
  provider?: unknown;
  modelId?: unknown;
};

/**
 * POST /api/team-runs/goal-coach
 * Start or continue a Goal Coach session that helps draft a strong Goal Spec.
 * Body: { cwd, message, sessionId?, sessionFile?, provider?, modelId? }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    const message = typeof body.message === "string" ? body.message : "";
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }

    const role = {
      ...GOAL_COACH_ROLE,
      provider: typeof body.provider === "string" ? body.provider : GOAL_COACH_ROLE.provider,
      modelId: typeof body.modelId === "string" ? body.modelId : GOAL_COACH_ROLE.modelId,
    };

    const existingId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const existingFile = typeof body.sessionFile === "string" ? body.sessionFile.trim() : "";

    const ensured = await ensureRoleSession({
      cwd,
      role,
      sessionId: existingId || undefined,
      sessionFile: existingFile || undefined,
    });

    // Best-effort name for sidebar grouping / recognition
    try {
      await ensured.session.send({ type: "set_session_name", name: goalCoachSessionName() });
    } catch {
      // ignore
    }

    const isKickoff = !existingId;
    const promptText = isKickoff
      ? buildGoalCoachKickoffMessage(message)
      : buildGoalCoachFollowUpMessage(message);
    if (!promptText.trim()) {
      return NextResponse.json({ error: "message required for follow-up" }, { status: 400 });
    }

    await ensured.session.send({ type: "prompt", message: promptText });
    const wait = await waitForSessionIdle(ensured.session, {
      isCurrent: () => ensured.session.isAlive(),
      timeoutMs: 10 * 60 * 1000,
    });
    if (wait === "timeout") {
      return NextResponse.json(
        {
          error: "Goal Coach timed out waiting for model response",
          sessionId: ensured.sessionId,
          sessionFile: ensured.sessionFile,
          wait,
        },
        { status: 504 },
      );
    }
    if (wait === "destroyed") {
      return NextResponse.json(
        {
          error: "Goal Coach session ended unexpectedly",
          sessionId: ensured.sessionId,
          sessionFile: ensured.sessionFile,
          wait,
        },
        { status: 500 },
      );
    }

    const last = (await ensured.session.send({ type: "get_last_assistant_text" })) as { text?: string };
    const assistantText = last?.text ?? "";
    const extracted = extractGoalSpecFromCoachText(assistantText);

    return NextResponse.json({
      sessionId: ensured.sessionId,
      sessionFile: ensured.sessionFile,
      assistantText,
      draft: extracted.draft,
      draftErrors: extracted.errors,
      draftWarnings: extracted.warnings,
      wait,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
