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
    } else {
      if (!/primary_path_verified\s*:\s*true/i.test(content)) {
        hardErrors.push("acceptance.md must include `primary_path_verified: true` when status is pass");
      }
      // Body must show independent primary-path verification (not only tester trust)
      if (!/(primary\s*path|human\s*path|file:\/\/|localhost|how\s+to\s+open|打开|主路径)/i.test(content)) {
        hardErrors.push("acceptance.md pass must describe primary-path verification evidence in the body");
      }
      if (!/(independen|myself|re-?check|亲自|独立|复核|未仅信任)/i.test(content)) {
        hardErrors.push("acceptance.md pass must state independent primary-path verification (not only tester report)");
      }
    }
  }

  if (name === "contract.md") {
    if (!/##\s*Primary Path/i.test(content)) {
      hardErrors.push("contract.md must include a ## Primary Path section");
    }
    if (!/##\s*Acceptance/i.test(content)) {
      hardErrors.push("contract.md must include a ## Acceptance section (checks/criteria)");
    }
    // Primary path section should not be a vague placeholder
    const primaryBody = sectionBody(content, "Primary Path");
    if (primaryBody && primaryBody.length < 12) {
      hardErrors.push("contract.md ## Primary Path section is too short / vague");
    }
    if (primaryBody && /tbd|todo|稍后|待定/i.test(primaryBody)) {
      hardErrors.push("contract.md ## Primary Path must not be TBD/TODO");
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
    if (/(?:primary(?:\s*path)?\s*[:=].*(?:fail|failed|blocked))/i.test(content)) {
      hardErrors.push("test-report.md indicates primary path failed");
    }
    // When overall pass, require explicit primary path pass signal
    if (/(?:^|\n)\s*status\s*:\s*pass\s*(?:\n|$)/i.test(content)) {
      const hasPrimaryPass =
        /primary(?:\s*path)?\s*[:=]\s*pass/i.test(content) ||
        /主路径[^\n]{0,20}(通过|pass)/i.test(content);
      if (!hasPrimaryPass) {
        hardErrors.push(
          "test-report.md status pass must explicitly mark primary path pass (e.g. `primary: pass` under Environments)",
        );
      }
    }
  }

  if (name === "change-summary.md") {
    if (!/##\s*(How to (run|open)|Run|Open|Primary Path)/i.test(content)) {
      hardErrors.push("change-summary.md must include ## How to open/run (or ## Primary Path) for humans");
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

function sectionBody(markdown: string, title: string): string {
  const re = new RegExp(
    `##\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "i",
  );
  const m = markdown.match(re);
  return m?.[1]?.trim() ?? "";
}
