import { computePosition } from "@floating-ui/dom";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../../shared/Icon";
import { cx } from "../../shared/cx";
import type { CodeBlockConfig } from "./config";
import type { LanguageInfo } from "./loader";

/**
 * Language picker — React port of Crepe's Vue `LanguagePicker`
 * (`code-block/view/components/language-picker.tsx`). A button showing the
 * current language ("Text" when none) that opens a floating, searchable dropdown
 * of registered languages. Selecting one calls `setLanguage`, which writes the
 * node attr (`setAttrs({ language })`) — the controller then reacts to the attr
 * change to lazily load the CM language pack (we never reconfigure CM from here).
 *
 * Faithfully preserved load-bearing bits: `@floating-ui/dom` positioning,
 * window click-outside, the `setTimeout(focus)` on open, and
 * `preventDefault()/stopPropagation()` on the toggle (so the click doesn't blur
 * CodeMirror / collapse the PM selection before the dropdown opens).
 */
interface LanguagePickerProps {
  language: string;
  config: CodeBlockConfig;
  setLanguage: (language: string) => void;
  getAllLanguages: () => LanguageInfo[];
  getReadOnly: () => boolean;
}

export function LanguagePicker({
  language,
  config,
  setLanguage,
  getAllLanguages,
  getReadOnly,
}: LanguagePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState("");

  // Position the floating dropdown under the trigger + focus the search box when
  // it opens (mirrors the Vue `watch([showPicker, …])`).
  useEffect(() => {
    if (!showPicker) return;
    setFilter("");
    const trigger = triggerRef.current;
    const list = pickerRef.current;
    if (!trigger || !list) return;

    computePosition(trigger, list, { placement: "bottom-start" })
      .then(({ x, y }) => {
        Object.assign(list.style, { left: `${x}px`, top: `${y}px` });
      })
      .catch(console.error);

    const id = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [showPicker]);

  // Window click-outside to dismiss (capture-free, same as upstream).
  useEffect(() => {
    if (!showPicker) return;
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (triggerRef.current?.contains(target)) return;
      if (!pickerRef.current?.contains(target)) setShowPicker(false);
    };
    window.addEventListener("click", clickHandler);
    return () => window.removeEventListener("click", clickHandler);
  }, [showPicker]);

  const onTogglePicker = (e: React.MouseEvent) => {
    // Load-bearing: keep the PM selection / CM focus intact while toggling.
    e.preventDefault();
    e.stopPropagation();
    if (getReadOnly()) return;
    setShowPicker((prev) => !prev);
  };

  const languages = useMemo(() => {
    if (!showPicker) return [] as LanguageInfo[];

    const all = getAllLanguages() ?? [];
    const selected = all.find(
      (info) => info.name.toLowerCase() === language.toLowerCase(),
    );

    const currentValue = filter.toLowerCase();
    const filtered = all.filter(
      (info) =>
        (info.name.toLowerCase().includes(currentValue) ||
          info.alias.some((alias) =>
            alias.toLowerCase().includes(currentValue),
          )) &&
        info !== selected,
    );

    if (filtered.length === 0) return [] as LanguageInfo[];
    if (!selected) return filtered;
    return [selected, ...filtered];
  }, [showPicker, filter, language, getAllLanguages]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="language-button"
        onClick={onTogglePicker}
        data-expanded={String(showPicker)}
      >
        {language || "Text"}
        <div className="expand-icon">
          <Icon icon={config.expandIcon} />
        </div>
      </button>
      <div ref={pickerRef} className="language-picker">
        {showPicker ? (
          <div className="list-wrapper">
            <div className="search-box">
              <div className="search-icon">
                <Icon icon={config.searchIcon} />
              </div>
              <input
                ref={searchRef}
                className="search-input"
                placeholder={config.searchPlaceholder}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setFilter("");
                }}
              />
              <div
                className={cx("clear-icon", filter.length === 0 && "hidden")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setFilter("");
                }}
              >
                <Icon icon={config.clearSearchIcon} />
              </div>
            </div>
            <ul
              className="language-list"
              role="listbox"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const active = document.activeElement;
                  if (active instanceof HTMLElement && active.dataset.language) {
                    setLanguage(active.dataset.language);
                    setShowPicker(false);
                  }
                }
              }}
            >
              {!languages.length ? (
                <li className="language-list-item no-result">
                  {config.noResultText}
                </li>
              ) : (
                languages.map((info) => {
                  const isSelected =
                    info.name.toLowerCase() === language.toLowerCase();
                  return (
                    <li
                      key={info.name}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                      className="language-list-item"
                      data-language={info.name}
                      onClick={() => {
                        setLanguage(info.name);
                        setShowPicker(false);
                      }}
                    >
                      {config.renderLanguage(info.name, isSelected)}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  );
}
