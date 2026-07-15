import { existsSync, readFileSync } from "fs";
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";

export type SkillRef = {
  name: string;
  description: string;
  filePath: string;
  body: string;
};

/** List skills available for a cwd (same loader as /api/skills). */
export async function listSkillsForCwd(cwd: string): Promise<
  Array<{ name: string; description: string; filePath: string; disableModelInvocation: boolean }>
> {
  const loader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
  await loader.reload();
  const { skills } = loader.getSkills();
  return skills.map((s) => ({
    name: s.name,
    description: s.description,
    filePath: s.filePath,
    disableModelInvocation: Boolean(s.disableModelInvocation),
  }));
}

/**
 * Resolve skill names to file bodies. Unknown names are skipped (listed in missing).
 * Matching is case-insensitive on skill name.
 */
export async function loadSkillBodies(
  cwd: string,
  skillNames: string[],
): Promise<{ skills: SkillRef[]; missing: string[] }> {
  const wanted = [...new Set(skillNames.map((s) => s.trim()).filter(Boolean))];
  if (wanted.length === 0) return { skills: [], missing: [] };

  const listed = await listSkillsForCwd(cwd);
  const byName = new Map(listed.map((s) => [s.name.toLowerCase(), s]));
  const skills: SkillRef[] = [];
  const missing: string[] = [];

  for (const name of wanted) {
    const hit = byName.get(name.toLowerCase());
    if (!hit) {
      missing.push(name);
      continue;
    }
    if (!existsSync(hit.filePath)) {
      missing.push(name);
      continue;
    }
    let raw = readFileSync(hit.filePath, "utf8");
    // Drop YAML frontmatter for injection body
    if (raw.startsWith("---")) {
      const end = raw.indexOf("\n---", 3);
      if (end !== -1) {
        const after = raw.slice(end + 4);
        raw = after.replace(/^\r?\n/, "");
      }
    }
    skills.push({
      name: hit.name,
      description: hit.description,
      filePath: hit.filePath,
      body: raw.trim(),
    });
  }

  return { skills, missing };
}

/** Markdown block to inject into facilitator system prompt or kickoff. */
export function formatSkillsForFacilitator(skills: SkillRef[]): string {
  if (skills.length === 0) return "";
  const parts = [
    "## Attached Skills (follow these for this alignment discussion)",
    "The human attached the following Skills. Obey their process, then produce a strong Goal Spec",
    "with a fenced ```goal_spec block when ready. Do not implement product code.",
    "",
  ];
  for (const s of skills) {
    parts.push(`### Skill: ${s.name}`);
    if (s.description) parts.push(`_${s.description}_`, "");
    parts.push(s.body, "");
  }
  return parts.join("\n").trim() + "\n";
}

export function mergeSystemPromptWithSkills(basePrompt: string, skillsBlock: string): string {
  const base = basePrompt.trim();
  const skills = skillsBlock.trim();
  if (!skills) return base;
  const marker = "<!-- team-alignment-skills -->";
  if (base.includes(marker)) {
    // replace previous skills block roughly
    return base.replace(
      new RegExp(`${marker}[\\s\\S]*?(?=$|<!-- )`),
      `${marker}\n${skills}\n`,
    );
  }
  return `${base}\n\n${marker}\n${skills}`;
}
