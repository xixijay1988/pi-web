import type { PlanNode, RoleId } from "./types";

export type ParsedPlan = {
  nodes: Array<{
    id: string;
    roleId: RoleId;
    title: string;
    deps: string[];
  }>;
  errors: string[];
};

/**
 * Minimal plan.md parser.
 * Expects a "## Nodes" section with list items:
 * - id: architect
 *   roleId: architect
 *   title: ...
 *   deps: [a, b]   or deps: []
 */
export function parsePlanMarkdown(markdown: string): ParsedPlan {
  const errors: string[] = [];
  const nodesSection = extractNodesSection(markdown);
  if (!nodesSection) {
    return { nodes: [], errors: ["plan.md missing ## Nodes section"] };
  }

  const chunks = nodesSection
    .split(/^\s*-\s+/m)
    .map((c) => c.trim())
    .filter(Boolean);

  const nodes: ParsedPlan["nodes"] = [];
  for (const chunk of chunks) {
    const id = matchField(chunk, "id");
    const roleId = matchField(chunk, "roleId");
    const title = matchField(chunk, "title") || id || "untitled";
    const depsRaw = matchField(chunk, "deps");
    if (!id || !roleId) {
      errors.push(`Node missing id/roleId near: ${chunk.slice(0, 60)}`);
      continue;
    }
    nodes.push({
      id,
      roleId,
      title,
      deps: parseDeps(depsRaw),
    });
  }

  if (nodes.length === 0 && errors.length === 0) {
    errors.push("## Nodes section contained no nodes");
  }

  // basic id uniqueness
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) errors.push(`Duplicate node id: ${n.id}`);
    seen.add(n.id);
  }

  return { nodes, errors };
}

export function toPlanNodes(
  parsed: ParsedPlan["nodes"],
  artifactPathsFor?: (node: { id: string; roleId: string }) => string[],
): PlanNode[] {
  return parsed.map((n) => ({
    id: n.id,
    roleId: n.roleId,
    title: n.title,
    deps: n.deps,
    status: "pending" as const,
    attempts: 0,
    artifactPaths: artifactPathsFor?.(n) ?? [],
  }));
}

function extractNodesSection(markdown: string): string | null {
  const match = markdown.match(/##\s*Nodes\b[^\n]*\n([\s\S]*?)(?=\n##\s+\S|$)/i);
  return match?.[1]?.trim() ? match[1] : match ? match[1] : null;
}

function matchField(chunk: string, field: string): string | null {
  const re = new RegExp(`(?:^|\\n)\\s*${field}\\s*:\\s*(.+?)\\s*(?=\\n|$)`, "i");
  const m = chunk.match(re);
  return m ? m[1].trim() : null;
}

function parseDeps(raw: string | null): string[] {
  if (!raw) return [];
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}
