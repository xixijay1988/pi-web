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
import {
  formatSkillsForFacilitator,
  loadSkillBodies,
  mergeSystemPromptWithSkills,
} from "@/lib/team-runs/skills-inject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  cwd?: unknown;
  message?: unknown;
  sessionId?: unknown;
  sessionFile?: unknown;
  provider?: unknown;
  modelId?: unknown;
  skillNames?: unknown;
};

/**
 * POST /api/team-runs/goal-coach
 * Alignment Facilitator (Goal Coach): sticky session, optional Skills + model.
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

    const skillNames = Array.isArray(body.skillNames)
      ? body.skillNames.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
      : [];

    const { skills, missing } = await loadSkillBodies(cwd, skillNames);
    const skillsBlock = formatSkillsForFacilitator(skills);
    const systemPrompt = mergeSystemPromptWithSkills(GOAL_COACH_ROLE.systemPrompt, skillsBlock);

    const role = {
      ...GOAL_COACH_ROLE,
      systemPrompt,
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

    try {
      await ensured.session.send({ type: "set_session_name", name: goalCoachSessionName() });
    } catch {
      // ignore
    }

    const isKickoff = !existingId;
    const promptText = isKickoff
      ? buildGoalCoachKickoffMessage(message, { skillNames: skills.map((s) => s.name) })
      : buildGoalCoachFollowUpMessage(message);
    if (!promptText.trim()) {
      return NextResponse.json({ error: "message required for follow-up" }, { status: 400 });
    }

    // On kickoff with skills, prepend a short system-visible note in the user turn if injection was empty
    const fullPrompt =
      isKickoff && skillsBlock
        ? `${promptText}\n\n(Skill instructions were also attached to your system context.)`
        : promptText;

    await ensured.session.send({ type: "prompt", message: fullPrompt });
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
          missingSkills: missing,
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
          missingSkills: missing,
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
      attachedSkills: skills.map((s) => s.name),
      missingSkills: missing,
      wait,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
