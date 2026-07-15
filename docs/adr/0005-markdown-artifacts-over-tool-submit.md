# Convention-path Markdown artifacts as the handoff bus

Structured handoffs could be forced JSON tool calls, parsed freeform assistant JSON, or files on disk.

**Decision:** v1 handoffs are convention-path Markdown under `.team/steps/.../vN/`. Engine hard-validates files. Optional submit_* tools are deferred until file parsing proves insufficient.

**Why:** Fits pi's file tools, is human-readable, git-friendly, and recoverable after session death. Tool-only submit couples success to a single tool call surviving retries and model compliance.

**Consequences:** Parsers must be tolerant but versioned; prompts must name exact output paths; sticky sessions still get self-contained briefs so memory cannot replace files.
