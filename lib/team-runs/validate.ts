import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import { hashContent } from "./paths";
import type { ValidationResult } from "./types";

const STATUS_RE = /(?:^|\n)\s*status\s*:\s*(pass|fail)\s*(?:\n|$)/i;

export function validateArtifactFile(filePath: string): ValidationResult {
  const hardErrors: string[] = [];
  const softWarnings: string[] = [];

  if (!existsSync(filePath)) {
    return { ok: false, hardErrors: [`Missing artifact: ${filePath}`], softWarnings };
  }

  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (err) {
    return {
      ok: false,
      hardErrors: [`Cannot read artifact: ${filePath} (${err instanceof Error ? err.message : String(err)})`],
      softWarnings,
    };
  }

  if (!content.trim()) {
    hardErrors.push(`Artifact is empty: ${filePath}`);
  }

  const name = basename(filePath);
  if (name === "acceptance.md") {
    const match = content.match(STATUS_RE);
    if (!match) {
      hardErrors.push("acceptance.md must include `status: pass` or `status: fail`");
    } else if (match[1].toLowerCase() === "fail") {
      hardErrors.push("acceptance.md status is fail");
    }
  }

  if (content.trim().length > 0 && content.trim().length < 20) {
    softWarnings.push("Artifact body is very short");
  }

  return {
    ok: hardErrors.length === 0,
    hardErrors,
    softWarnings,
    contentHash: hardErrors.length === 0 ? hashContent(content) : undefined,
  };
}

export function validateArtifacts(paths: string[]): ValidationResult {
  const hardErrors: string[] = [];
  const softWarnings: string[] = [];
  const hashes: string[] = [];

  if (paths.length === 0) {
    return { ok: false, hardErrors: ["No artifact paths configured for node"], softWarnings };
  }

  for (const p of paths) {
    const r = validateArtifactFile(p);
    hardErrors.push(...r.hardErrors);
    softWarnings.push(...r.softWarnings);
    if (r.contentHash) hashes.push(r.contentHash);
  }

  return {
    ok: hardErrors.length === 0,
    hardErrors,
    softWarnings,
    contentHash: hashes.length ? hashContent(hashes.join("|")) : undefined,
  };
}
