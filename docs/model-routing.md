# Beast model routing & interview modes

How the assistant picks a model per task, with measured timings. All numbers were
measured locally on 2026-11-01 (10 interview questions + 3 coding tasks).

## Routing rule

| Task type | Model | Via | Why |
|---|---|---|---|
| **General interview** — conceptual, system design, explanations | **Groq** (`gpt-oss-20b`, or `gpt-oss-120b`) | Groq API key | Fast; sub-2s answers with diagrams |
| **Coding** — writing code, debugging, anything where the code must run | **Claude Opus 5.5, effort: high** | `claude` CLI (subscription) | Highest correctness; speed is secondary here |

Rule of thumb: **speed for talking, accuracy for coding.** If a question expects
working/debuggable code, route to Opus via CLI and accept ~15s. Everything else
goes to Groq for near-instant answers.

## Measured results

| Model | Avg time | Rich answer | Code 3/3 runs | Diagrams | Cost |
|---|---|---|---|---|---|
| Groq `gpt-oss-20b` | **0.86s** | 0.8–1.1s | 1/3 (writes prose into code) | yes | ~free |
| Groq `gpt-oss-120b` | **1.66s** | 1.8–2.5s | 3/3 | yes | ~$0.0005/ans |
| Claude Haiku 5.5 (CLI) | ~9s | 9–13s | 3/3 | yes | $0 (plan) |
| **Claude Opus 5.5, high effort (CLI)** | **14.9s** | — | **3/3, most thorough** | n/a | $0 (plan) |

- Interview answers: **Groq wins decisively** — ~10x faster than the Claude subscription, diagrams intact.
- Coding: **Opus 5.5 high effort** gave the strongest, fully-runnable code (one task returned both iterative and recursive solutions). Groq 20b is fast but unreliable on code; 120b is a fast middle ground.

## The three interview modes (prompts)

**System Design** (→ Groq)
> Definition (1 line) → key points (3–6 bullets) → small mermaid diagram → short code snippet → trade-offs (2–3 bullets). Interview-ready, concise.

**Conceptual** (→ Groq)
> Concept (1–2 line definition) → use case (2–4 bullets) → small mermaid diagram → one-line example. Bullet form only.

**Coding** (→ Opus 5.5, high effort, CLI)
> Approach (3–5 bullets) → dry run of one example → complete runnable Python program (main + example inputs, prints output; code block is pure code) → complexity (1 line).

**Debug** (→ Opus 5.5 via CLI; not yet built)
> Capture the screen every 5s, feed to the model, report before/after changes and a 1–2 line issue explanation.

## How it's wired

- Groq: add as a bring-your-own provider (OpenAI-compatible endpoint
  `https://api.groq.com/openai/v1/chat/completions`). Needs the `User-Agent`
  header set (Groq's edge blocks the default `Python-urllib` UA with a 403).
- Opus coding: `claude -p "<coding prompt>" --model opus --effort high`, with
  `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` stripped so it uses the subscription.

## Notes

- `gpt-oss-20b` sometimes writes dry-run text (e.g. a `→` arrow) inside the code
  block, which breaks execution. Use `gpt-oss-120b` if coding ever routes to Groq.
- Opus high-effort coding is ~15s — deliberately slow for correctness. Do not
  route interview chatter here.
