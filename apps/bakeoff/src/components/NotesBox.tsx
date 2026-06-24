import { useEffect, useState } from "react";

interface Props {
  libraryId: string;
  libraryName: string;
}

const key = (id: string) => `md-bakeoff:notes:${id}`;

/**
 * Free-text evaluation notes per library, persisted to localStorage so the
 * human can jot impressions while testing without losing them on reload.
 */
export function NotesBox({ libraryId, libraryName }: Props) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(localStorage.getItem(key(libraryId)) ?? "");
  }, [libraryId]);

  const onChange = (value: string) => {
    setNotes(value);
    localStorage.setItem(key(libraryId), value);
  };

  return (
    <div className="notes">
      <label className="notes-label" htmlFor={`notes-${libraryId}`}>
        Your notes on {libraryName}{" "}
        <span className="notes-hint">(saved locally)</span>
      </label>
      <textarea
        id={`notes-${libraryId}`}
        className="notes-textarea"
        placeholder="Editing UX, round-trip surprises, theming quirks, would-you-ship…"
        value={notes}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
