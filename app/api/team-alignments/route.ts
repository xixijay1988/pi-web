import { NextResponse } from "next/server";
import { existsSync } from "fs";
import {
  createAlignmentRoom,
  listAlignments,
} from "@/lib/team-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ alignments: listAlignments() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cwd?: unknown;
      idea?: unknown;
      facilitator?: { provider?: string; modelId?: string; skillNames?: string[] };
      architect?: { provider?: string; modelId?: string };
      includeProductCritic?: unknown;
    };
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }
    const room = createAlignmentRoom({
      cwd,
      idea: typeof body.idea === "string" ? body.idea : "",
      facilitator: body.facilitator,
      architect: body.architect,
      includeProductCritic: body.includeProductCritic === true,
    });
    return NextResponse.json({ alignment: room });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
