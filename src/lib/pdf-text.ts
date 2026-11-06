// Extracts the text of a PDF in the browser/webview (pdf.js), so PDFs can be
// attached like any other document. Capped to keep prompts reasonable.
const MAX_PAGES = 60;
const MAX_CHARS = 120_000;

export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  let total = 0;
  for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES) && total < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim();
    pages.push(`[page ${i}] ${text}`);
    total += text.length;
  }
  if (doc.numPages > MAX_PAGES) pages.push(`[… ${doc.numPages - MAX_PAGES} more pages not included]`);
  return pages.join("\n").slice(0, MAX_CHARS);
}
