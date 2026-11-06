// Makes every Mermaid diagram in an answer render, with several attempts:
//   1. the model's original code, if Mermaid parses it;
//   2. our sanitized version (flowchart label/ID fixes);
//   3. up to MAX_AI_TRIES quick repairs by Groq, each validated by Mermaid's own
//      parser before it is used.
// Results are cached per diagram so a block is only repaired once.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { sanitizeMermaid } from "./mermaid-sanitize";

const MAX_AI_TRIES = 2;
const cache = new Map<string, Promise<string>>();

let mermaidPromise: Promise<any> | null = null;
const loadMermaid = () =>
  (mermaidPromise ??= import("mermaid").then((m) => {
    m.default.initialize({ startOnLoad: false });
    return m.default;
  }));

async function parseError(code: string): Promise<string | null> {
  try {
    const mermaid = await loadMermaid();
    await mermaid.parse(code);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function askModelToFix(code: string, error: string): Promise<string | null> {
  const key = (import.meta as any).env?.VITE_GROQ_API_KEY;
  if (!key) return null;
  const doFetch = (window as any).__PLUELY_WEBTEST__ ? fetch : tauriFetch;
  try {
    const res = await doFetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You fix Mermaid diagram syntax. Keep the same diagram type and meaning. " +
              "Put labels with special characters in double quotes. Reply with ONLY the corrected Mermaid code, no fences, no prose.",
          },
          { role: "user", content: `Mermaid error:\n${error}\n\nDiagram:\n${code}` },
        ],
      }),
    });
    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    return text.replace(/^```(?:mermaid)?\s*/i, "").replace(/```\s*$/, "").trim() || null;
  } catch {
    return null;
  }
}

async function repairOne(code: string): Promise<string> {
  if (!(await parseError(code))) return code; // 1. original is fine
  const sanitized = sanitizeMermaid(code);
  let lastError = await parseError(sanitized);
  if (!lastError) return sanitized; // 2. sanitized parses
  let candidate = code;
  for (let i = 0; i < MAX_AI_TRIES; i++) { // 3. ask the model, validate each try
    const fixed = await askModelToFix(candidate, lastError ?? "parse error");
    if (!fixed) break;
    lastError = await parseError(fixed);
    if (!lastError) return fixed;
    candidate = fixed;
  }
  return sanitized; // give up: show the best effort (Mermaid shows its error)
}

export function repairMermaid(code: string): Promise<string> {
  const key = code.trim();
  if (!cache.has(key)) cache.set(key, repairOne(key));
  return cache.get(key)!;
}

const BLOCK = /```mermaid\n([\s\S]*?)```/g;

/** Returns the markdown with every complete mermaid block replaced by a version that parses. */
export async function repairMermaidBlocks(markdown: string): Promise<string> {
  const blocks = [...markdown.matchAll(BLOCK)];
  if (!blocks.length) return markdown;
  const fixed = await Promise.all(blocks.map((m) => repairMermaid(m[1])));
  let i = 0;
  return markdown.replace(BLOCK, () => "```mermaid\n" + fixed[i++] + "\n```");
}

/** True when Mermaid's parser accepts the diagram. */
export async function mermaidParses(code: string): Promise<boolean> {
  return (await parseError(code)) === null;
}
