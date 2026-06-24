import type { PointerEvent as ReactPointerEvent } from "react";

import { cx } from "./cx";
import { sanitize } from "./sanitize";

interface IconProps {
  /** Raw inline-SVG string (or a plain text label, e.g. an ordered-list number). */
  icon?: string | null;
  className?: string;
  /**
   * Optional pointer-down handler. Crepe's Vue `Icon` bound its `onClick` to
   * `onPointerdown` so the editor selection survives the click (the link tooltip
   * relies on this); pointerdown also lets icon buttons keep the class +
   * `> svg` CSS structure the ported theme keys off of (no extra wrapper).
   */
  onPointerDown?: (e: ReactPointerEvent<HTMLSpanElement>) => void;
}

/**
 * React replacement for Crepe's Vue `Icon` (components/__internal__/icon.tsx):
 * a `<span>` whose sanitized SVG/text is injected as innerHTML. Same DOMPurify
 * behavior, same `milkdown-icon` class contract the ported theme keys off of.
 */
export function Icon({ icon, className, onPointerDown }: IconProps) {
  return (
    <span
      className={cx("milkdown-icon", className)}
      onPointerDown={onPointerDown}
      dangerouslySetInnerHTML={
        icon ? { __html: sanitize(icon.trim()) } : undefined
      }
    />
  );
}
