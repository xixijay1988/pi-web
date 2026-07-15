"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamRun } from "@/lib/team-runs/types";

export function useTeamRun(runId: string | null) {
  const [run, setRun] = useState<TeamRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/team-runs/${encodeURIComponent(id)}`);
      const d = await res.json() as { run?: TeamRun; error?: string };
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setRun(d.run ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setError(null);
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    void load(runId);

    esRef.current?.close();
    const es = new EventSource(`/api/team-runs/${encodeURIComponent(runId)}/events`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { run?: TeamRun; error?: string };
        if (data.error) {
          setError(data.error);
          return;
        }
        if (data.run) setRun(data.run);
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => {
      // browser will retry EventSource; also fall back to one-shot load
      void load(runId);
    };

    return () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
    };
  }, [runId, load]);

  return { run, setRun, error, setError, loading, reload: () => (runId ? load(runId) : Promise.resolve()) };
}
