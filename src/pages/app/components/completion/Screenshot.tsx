import { Button } from "@/components";
import { LaptopMinimalIcon, Loader2, MousePointer2Icon } from "lucide-react";
import { UseCompletionReturn } from "@/types";
import { MAX_FILES } from "@/config";
import { useApp } from "@/contexts";

export const Screenshot = ({
  screenshotConfiguration,
  attachedFiles,
  isLoading,
  captureFullScreen,
  isScreenshotLoading,
}: UseCompletionReturn) => {
  const { supportsImages } = useApp();

  const isDisabled =
    attachedFiles.length >= MAX_FILES ||
    isLoading ||
    isScreenshotLoading ||
    !supportsImages;

  return (
    <Button
      size="icon"
      className="cursor-pointer"
      title={
        !supportsImages
          ? "Screenshot not supported by current AI provider"
          : "Screenshot: captures the screen, then lets you send it or add more screenshots / text first. (⌘↵ captures and sends at once.)"
      }
      id="screenshot-button"
      onClick={() => void captureFullScreen()}
      disabled={isDisabled}
    >
      {isScreenshotLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : screenshotConfiguration.enabled ? (
        <LaptopMinimalIcon className="h-4 w-4" />
      ) : (
        <MousePointer2Icon className="h-4 w-4" />
      )}
    </Button>
  );
};
