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

export function sanitizeMermaid(code: string): string {
  return code.split("\n").map(sanitizeLine).join("\n");
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
