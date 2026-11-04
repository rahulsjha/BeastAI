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
