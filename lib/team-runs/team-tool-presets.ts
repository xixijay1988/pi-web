import { PRESET_DEFAULT, PRESET_FULL, PRESET_NONE } from "../tool-presets";
import type { TeamToolPreset } from "./types";

/** Map Team Run tool presets onto pi built-in tool name lists. */
export function toolNamesForTeamPreset(preset: TeamToolPreset): string[] {
  switch (preset) {
    case "none":
      return [...PRESET_NONE];
    case "default":
      return [...PRESET_DEFAULT];
    case "full":
      return [...PRESET_FULL];
    case "readonly":
      // read/search tools only — no edit/write/bash by default.
      // Tester may need bash later; engine can override via toolNames.
      return ["read", "grep", "find", "ls"];
    case "team_writer":
      // Orchestrator: inspect + write (prompt must constrain to .team/).
      return ["read", "grep", "find", "ls", "write", "edit"];
    default:
      return [...PRESET_DEFAULT];
  }
}

export function resolveToolNames(preset: TeamToolPreset, toolNames?: string[]): string[] {
  if (toolNames && toolNames.length > 0) return [...toolNames];
  return toolNamesForTeamPreset(preset);
}
