import React, { useEffect, useState } from "react";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fixMermaidBlocks } from "@/lib/markdown/mermaid-sanitize";
import { fixInlineMath } from "@/lib/markdown/inline-math";
import { repairMermaidBlocks } from "@/lib/markdown/mermaid-repair";

interface MarkdownRendererProps {
  children: string;
  isStreaming?: boolean;
}

export function Markdown({
  children,
  isStreaming = false,
}: MarkdownRendererProps) {
  const prepared = fixInlineMath(children ?? "");

  // Diagrams: show the quick sanitized version right away, then — once the
  // text stops changing — swap in a version verified by Mermaid's parser
  // (original → sanitized → up to 2 model repairs).
  const [repaired, setRepaired] = useState<{ src: string; out: string } | null>(null);
  useEffect(() => {
    if (!prepared.includes("```mermaid")) return;
    let cancelled = false;
    const t = setTimeout(() => {
      repairMermaidBlocks(prepared).then((out) => {
        if (!cancelled) setRepaired({ src: prepared, out });
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [prepared]);
  const content =
    repaired?.src === prepared ? repaired.out : fixMermaidBlocks(prepared);

  return (
    <Streamdown
      isAnimating={isStreaming}
      shikiTheme={["github-light", "github-dark"]}
      components={COMPONENTS as any}
      rehypePlugins={REHYPE_PLUGINS as any}
      mermaid={{ config: mermaidConfig() }}
      controls={{
        table: true,
        code: true,
        mermaid: {
          download: true,
          copy: true,
          fullscreen: false,
          panZoom: false,
        },
      }}
    >
      {content}
    </Streamdown>
  );
}

// Diagram look: high-contrast connection lines, readable labels, more spacing.
// Chosen per theme so lines stay clearly visible on dark and light panels.
function mermaidConfig() {
  const dark =
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("dark") ||
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const c = dark
    ? { bg: "#1c1f26", node: "#262b36", border: "#a5b4fc", text: "#f3f4f6", line: "#e5e7eb", label: "#111318", note: "#3b3420" }
    : { bg: "#ffffff", node: "#eef2ff", border: "#4f46e5", text: "#111827", line: "#1f2937", label: "#ffffff", note: "#fff7d6" };
  return {
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      background: c.bg,
      primaryColor: c.node,
      primaryTextColor: c.text,
      primaryBorderColor: c.border,
      secondaryColor: c.node,
      tertiaryColor: c.node,
      lineColor: c.line,
      textColor: c.text,
      edgeLabelBackground: c.label,
      clusterBkg: c.bg,
      clusterBorder: c.border,
      // sequence diagrams
      actorBkg: c.node,
      actorBorder: c.border,
      actorTextColor: c.text,
      actorLineColor: c.line,
      signalColor: c.line,
      signalTextColor: c.text,
      labelBoxBkgColor: c.node,
      labelBoxBorderColor: c.border,
      noteBkgColor: c.note,
      noteTextColor: c.text,
      noteBorderColor: c.border,
      fontSize: "14px",
    },
    flowchart: { curve: "basis", nodeSpacing: 45, rankSpacing: 60, padding: 12, htmlLabels: true },
    sequence: { mirrorActors: false, messageMargin: 40, boxMargin: 8 },
  } as any;
}

// Streamdown's default order is raw → sanitize → katex → harden, and harden
// strips KaTeX's class names, so math showed three times ("≈4\\approx 4≈4").
// Run KaTeX last so its markup and classes survive.
const REHYPE_PLUGINS = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
  defaultRehypePlugins.katex,
];

const COMPONENTS = {
  a: ({ children, href, ...props }: any) => {
    const handleClick = async (e: React.MouseEvent) => {
      e.preventDefault();
      if (href) {
        try {
          await openUrl(href);
        } catch (error) {
          console.error("Failed to open URL:", error);
        }
      }
    };

    return (
      <a
        href={href}
        className="text-gray-600 underline underline-offset-2 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100 cursor-pointer"
        onClick={handleClick}
        {...props}
      >
        {children}
      </a>
    );
  },
};
