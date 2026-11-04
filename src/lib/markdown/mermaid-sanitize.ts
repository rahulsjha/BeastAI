// Makes LLM-written Mermaid flowcharts parseable.
//
// Models often put brackets, parentheses or quotes inside node labels
// (e.g. `C[compare target with A[mid]]`), which Mermaid rejects. We rewrite
// every node label as a quoted string with those characters removed, and
// strip the same characters from edge labels (`-->|label|`).

const OPEN_TO_CLOSE: Record<string, string> = { "[": "]", "(": ")", "{": "}" };
const BAD = /["[\](){}]/g;

// Keep comparisons readable: Mermaid renders #lt; / #gt; as < / >.
const cleanLabel = (text: string) =>
  text
    .replace(BAD, " ")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/\s+/g, " ")
    .trim();

function sanitizeLine(line: string): string {
  const trimmed = line.trim();
  // Leave directives, comments, subgraph/end, style and class lines alone.
  if (
    !trimmed ||
    /^(flowchart|graph|subgraph|end\b|%%|style|classDef|class|linkStyle|click|direction)/.test(
      trimmed
    )
  ) {
    return line;
  }

  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];

    // Edge label: |text|
    if (ch === "|") {
      const end = line.indexOf("|", i + 1);
      if (end !== -1) {
        out += "|" + cleanLabel(line.slice(i + 1, end)) + "|";
        i = end + 1;
        continue;
      }
    }

    // Node with a shape: identifier directly followed by [, ( or {
    if (OPEN_TO_CLOSE[ch] && /[A-Za-z0-9_]$/.test(out)) {
      // Shape opener can be doubled: [[ ]], (( )), {{ }}, ([ ]), [( )]
      let opener = ch;
      let j = i + 1;
      if (OPEN_TO_CLOSE[line[j]] && line[j] !== undefined) {
        opener += line[j];
        j += 1;
      }
      // Scan to the matching close at depth 0, counting any bracket type.
      let depth = opener.length;
      let k = j;
      for (; k < line.length && depth > 0; k++) {
        const c = line[k];
        if (OPEN_TO_CLOSE[c]) depth++;
        else if (c === "]" || c === ")" || c === "}") depth--;
      }
      if (depth === 0) {
        const closeLen = opener.length;
        const inner = line.slice(j, k - closeLen);
        const closer = opener
          .split("")
          .reverse()
          .map((o) => OPEN_TO_CLOSE[o])
          .join("");
        out += `${opener}"${cleanLabel(inner)}"${closer}`;
        i = k;
        continue;
      }
    }

    out += ch;
    i++;
  }
  return out;
}

// Arrow tokens, optionally followed by an edge label: -->, ---, -.->, ==>, --o, --x
const ARROW = /(\s*(?:<?[-=.]{2,}[->ox]?|<?-\.+->?)(?:\|[^|]*\|)?\s*)/;

// Bare node names with spaces ("Thread A") are invalid IDs. Turn them into a
// stable ID plus a quoted label: Thread_A["Thread A"].
function fixBareNodes(line: string): string {
  if (!ARROW.test(line) || line.includes("&")) return line;
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const parts = line.trim().split(ARROW);
  return (
    indent +
    parts
      .map((part, idx) => {
        if (idx % 2 === 1) return part; // arrow
        const t = part.trim();
        if (!t || /^[A-Za-z0-9_]+$/.test(t) || /^[A-Za-z0-9_]+\s*[[({]/.test(t)) return part;
        if (/^[^[\](){}"]+$/.test(t)) {
          const id = t.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "N";
          return `${/^[0-9]/.test(id) ? "N" + id : id}["${cleanLabel(t)}"]`;
        }
        return part;
      })
      .join("")
  );
}

const isFlowchart = (code: string) =>
  /^\s*(flowchart|graph)\b/i.test(code.replace(/^\s*(%%.*\n)+/, ""));

export function sanitizeMermaid(code: string): string {
  // The label/ID rewrites below are flowchart syntax only; sequence, class,
  // state, ER, gantt etc. diagrams use different grammars, so leave them as-is.
  if (!isFlowchart(code)) return code;
  return code
    .split("\n")
    .map((l) => sanitizeLine(fixBareNodes(l)))
    .join("\n");
}

/** Sanitizes every ```mermaid block inside a markdown string. */
export function fixMermaidBlocks(markdown: string): string {
  if (!markdown.includes("```mermaid")) return markdown;
  return markdown.replace(
    /```mermaid\n([\s\S]*?)(```|$)/g,
    (_m, body: string, fence: string) =>
      "```mermaid\n" + sanitizeMermaid(body) + fence
  );
}
