import { readTeamRun } from "@/lib/team-runs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** SSE placeholder for WS3; currently emits periodic snapshots. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const run = readTeamRun(id);
  if (!run) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        if (closed) return;
        const latest = readTeamRun(id);
        if (!latest) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "not found" })}\n\n`));
          return;
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ run: latest, events: latest.events.slice(-50) })}\n\n`),
        );
      };
      send();
      timer = setInterval(send, 2000);
      req.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* ignore */ }
      });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
