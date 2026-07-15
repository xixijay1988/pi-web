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
    } else if (!/primary_path_verified\s*:\s*true/i.test(content)) {
      hardErrors.push("acceptance.md must include `primary_path_verified: true` when status is pass");
    }
  }
  if (name === "contract.md") {
    if (!/##\s*Primary Path/i.test(content)) {
      hardErrors.push("contract.md must include a ## Primary Path section");
    }
    if (!/##\s*Acceptance/i.test(content)) {
      hardErrors.push("contract.md must include a ## Acceptance section (checks/criteria)");
    }
  }
  if (name === "test-report.md") {
    if (!/##\s*Environments?/i.test(content) && !/primary\s*:/i.test(content)) {
      hardErrors.push("test-report.md must document environments (## Environments or primary: ...)");
    }
    if (!/(?:^|\n)\s*status\s*:\s*(pass|fail)\s*(?:\n|$)/i.test(content)) {
      hardErrors.push("test-report.md must include `status: pass` or `status: fail`");
    } else if (/(?:^|\n)\s*status\s*:\s*fail\s*(?:\n|$)/i.test(content)) {
      hardErrors.push("test-report.md status is fail");
    }
    // Primary path must not be reported failed
    if (/(?:primary(?:\s*path)?\s*[:=].*(?:fail|failed|blocked))/i.test(content)) {
      hardErrors.push("test-report.md indicates primary path failed");
    }
  }
  if (name === "change-summary.md") {
    if (!/##\s*(How to (run|open)|Run|Open|Primary Path)/i.test(content)) {
      softWarnings.push("change-summary.md should document how a human opens/runs the result");
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
