# Claude CLI provider (subscription, no API key)

Routes Beast's answers through the locally installed `claude` command
(Claude Code), using your own Claude subscription login instead of an API key.
This is the same approach as Pluely's licensed "Connect a CLI" feature and
NexQ's subscription mode.

## How it works

1. **Rust** (`src-tauri/src/claude_cli.rs`, registered in `lib.rs`):
   - `claude_cli_status()` — reports whether `claude` is installed, its path and version.
   - `claude_cli_response(prompt, model, session_id, resume)` — runs
     `claude -p <prompt> --model <model>` (with `--session-id` / `--resume` for
     continuity), strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the
     child so it uses the subscription login, and returns stdout.
2. **TypeScript** (`src/lib/functions/ai-response.function.ts`):
   - When `selectedProvider.provider === "claude-cli"` (`CLAUDE_CLI_PROVIDER_ID`),
     `fetchAIResponse` routes to `fetchClaudeCliResponse`, which keeps one CLI
     session per conversation (new session when history is empty, resume after),
     and yields the answer.
   - Optional `MODEL` variable on the selected provider picks `haiku` (default,
     fastest) / `sonnet` / `opus` / a model id.

## Measured performance

The CLI session engine was tested standalone with a 5-question interview
session (haiku, context carried across turns):

| Turn | Latency |
|------|---------|
| 1 | 6.9s |
| 2 | 6.5s |
| 3 | 6.7s |
| 4 | 7.6s |
| 5 | 6.5s |

All within the 5–10s target, with follow-ups resolving context (e.g. "it" →
the previously discussed topic).

## Remaining work

- **UI selection**: add "Claude CLI (subscription)" to the AI provider picker
  that sets `selectedProvider.provider = "claude-cli"` with an optional `MODEL`.
  The existing picker is curl-based, so this is a small dedicated entry rather
  than a curl template.
- **Build + run test**: requires full Xcode on macOS (the `cidre` audio crate in
  `src-tauri` needs `xcodebuild`), so `cargo`-compiling the command and
  exercising it in the running app must be done on a machine with Xcode
  installed. The TypeScript type-checks clean; the Rust is written but not yet
  compiled here.

## Requirements

- Claude Code installed and logged in (`claude`, then `/login`).
- No API key needed; the subscription login is used.
