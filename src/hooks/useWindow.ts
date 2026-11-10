import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect } from "react";

// Helper function to check if any popover is open in the DOM
const isAnyPopoverOpen = (): boolean => {
  const popoverContents = document.querySelectorAll(
    "[data-radix-popper-content-wrapper]"
  );
  return popoverContents.length > 0;
};

// Height the window needs for the visible card (header + question bar + any
// inline panel such as Live transcript or History). The window used to be a
// fixed 54px when no popover was open, which cut off everything below the header.
const MIN_HEIGHT = 54;
// The answer panel's height is yours to choose (drag its bottom edge, or ⤢);
// it is remembered. The window can grow up to the screen's height.
const PANEL_KEY = "beast_panel_height";
const DEFAULT_PANEL = 600;
export const panelMax = (): number =>
  Math.max(DEFAULT_PANEL, ((typeof window !== "undefined" && window.screen?.availHeight) || 900) - 40);
export const panelMin = 360;
export const getPanelHeight = (): number => {
  try {
    const v = Number(localStorage.getItem(PANEL_KEY));
    if (v) return Math.min(panelMax(), Math.max(panelMin, v));
  } catch {
    /* ignore */
  }
  return DEFAULT_PANEL;
};
/** Change the answer panel's height (the window resizes to match). */
export const setPanelHeight = (h: number) => {
  const v = Math.round(Math.min(panelMax(), Math.max(panelMin, h)));
  try {
    localStorage.setItem(PANEL_KEY, String(v));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("beast:panel-height"));
};
const MAX_HEIGHT_FN = () => panelMax();
const contentHeight = (): number => {
  const card = document.getElementById("app-card");
  if (!card) return MIN_HEIGHT;
  return Math.min(MAX_HEIGHT_FN(), Math.max(MIN_HEIGHT, Math.ceil(card.getBoundingClientRect().height) + 6));
};

let lastHeight = -1;

export const useWindowResize = () => {
  const resizeWindow = useCallback(async (expanded: boolean) => {
    try {
      const window = getCurrentWebviewWindow();
      const popover = expanded || isAnyPopoverOpen();
      // Popovers (answer panel etc.) need room below the card; otherwise fit the card.
      const newHeight = popover
        ? Math.min(MAX_HEIGHT_FN(), Math.max(getPanelHeight(), contentHeight()))
        : contentHeight();
      if (newHeight === lastHeight) return;
      lastHeight = newHeight;

      await invoke("set_window_height", {
        window,
        height: newHeight,
      });
    } catch (error) {
      console.error("Failed to resize window:", error);
    }
  }, []);

  // Setup drag handling and popover monitoring
  useEffect(() => {
    let isDragging = false;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isDragRegion = target.closest('[data-tauri-drag-region="true"]');

      if (isDragRegion) {
        isDragging = true;
      }
    };

    const handleMouseUp = async () => {
      if (isDragging) {
        isDragging = false;

        setTimeout(() => {
          if (!isAnyPopoverOpen()) {
            resizeWindow(false);
          }
        }, 100);
      }
    };

    const observer = new MutationObserver(() => {
      if (!isAnyPopoverOpen()) {
        resizeWindow(false);
      }
    });

    // Re-fit whenever the card's own size changes (question bar, transcript,
    // history, queue …), not only when popovers open or close.
    const cardObserver = new ResizeObserver(() => resizeWindow(false));
    const attachCard = () => {
      const card = document.getElementById("app-card");
      if (card) cardObserver.observe(card);
      return !!card;
    };
    if (!attachCard()) setTimeout(attachCard, 500);

    // Observe the body for changes to detect popover open/close
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    const onPanelHeight = () => resizeWindow(true);
    window.addEventListener("beast:panel-height", onPanelHeight);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("beast:panel-height", onPanelHeight);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      observer.disconnect();
      cardObserver.disconnect();
    };
  }, [resizeWindow]);

  return { resizeWindow };
};

interface UseWindowFocusOptions {
  onFocusLost?: () => void;
  onFocusGained?: () => void;
}

export const useWindowFocus = ({
  onFocusLost,
  onFocusGained,
}: UseWindowFocusOptions = {}) => {
  const handleFocusChange = useCallback(
    async (focused: boolean) => {
      if (focused && onFocusGained) {
        onFocusGained();
      } else if (!focused && onFocusLost) {
        onFocusLost();
      }
    },
    [onFocusLost, onFocusGained]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupFocusListener = async () => {
      try {
        const window = getCurrentWebviewWindow();

        // Listen to focus change events
        unlisten = await window.onFocusChanged(({ payload: focused }) => {
          handleFocusChange(focused);
        });
      } catch (error) {
        console.error("Failed to setup focus listener:", error);
      }
    };

    setupFocusListener();

    // Cleanup
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleFocusChange]);
};
