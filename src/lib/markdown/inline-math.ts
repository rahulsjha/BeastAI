// Streamdown only renders `$$…$$` math (single `$` is off so prices like "$5"
// stay text). Models often write inline math as `$n^{2}$`, which then shows
// raw. Promote a single-dollar span to `$$…$$` only when it contains math
// syntax (\ ^ _ { }), and never inside code.

const INLINE = /(^|[^$\\])\$(?!\$)([^$\n]*?[\\^_{}][^$\n]*?)\$(?!\$)/g;
// Short variables like $n$ or $k$ (a letter + up to 2 word chars).
const VAR = /(^|[^$\\\w])\$([A-Za-z]\w{0,2})\$(?![$\w])/g;

export function fixInlineMath(markdown: string): string {
  if (!markdown.includes("$")) return markdown;
  // Split on fenced code blocks and inline code; only touch prose parts.
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(INLINE, "$1$$$$$2$$$$").replace(VAR, "$1$$$$$2$$$$")))
    .join("");
}
