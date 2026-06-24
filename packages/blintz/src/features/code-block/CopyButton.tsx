import { Icon } from "../../shared/Icon";

/**
 * Copy button — React port of Crepe's Vue `CopyButton`
 * (`code-block/view/components/copy-button.tsx`). Copies the code text with the
 * same `navigator.clipboard` → hidden-`<textarea>` fallback, then fires `onCopy`.
 */
interface CopyButtonProps {
  copyText: string;
  copyIcon: string;
  onCopy: (text: string) => void;
  text: string;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    return await navigator.clipboard.writeText(text);
  } catch {
    const element = document.createElement("textarea");
    const previouslyFocusedElement = document.activeElement;

    element.value = text;

    // Prevent keyboard from showing on mobile
    element.setAttribute("readonly", "");

    element.style.contain = "strict";
    element.style.position = "absolute";
    element.style.left = "-9999px";
    element.style.fontSize = "12pt"; // Prevent zooming on iOS

    const selection = document.getSelection();
    const originalRange = selection
      ? selection.rangeCount > 0 && selection.getRangeAt(0)
      : null;

    document.body.appendChild(element);
    element.select();

    // Explicit selection workaround for iOS
    element.selectionStart = 0;
    element.selectionEnd = text.length;

    document.execCommand("copy");
    document.body.removeChild(element);

    if (originalRange) {
      selection!.removeAllRanges(); // originalRange can't be truthy when selection is falsy
      selection!.addRange(originalRange);
    }

    // Get the focus back on the previously focused element, if any
    if (previouslyFocusedElement) {
      (previouslyFocusedElement as HTMLElement).focus();
    }
  }
}

export function CopyButton({
  copyText,
  copyIcon,
  onCopy,
  text,
}: CopyButtonProps) {
  const onCopyCode = () => {
    copyToClipboard(text)
      .then(() => onCopy(text))
      .catch(console.error);
  };

  return (
    <button type="button" className="copy-button" onClick={onCopyCode}>
      <Icon icon={copyIcon} />
      {copyText}
    </button>
  );
}
