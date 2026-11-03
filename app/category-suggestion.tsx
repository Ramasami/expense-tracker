"use client";
import { useMemo } from "react";
import { type RecordData } from "../lib/finance";
import { suggestCategory } from "../lib/smart-finance";
import "./smart-finance.css";
export default function CategorySuggestion({
  row,
  history,
  tags,
  disabled,
  onApply,
}: {
  row: Partial<RecordData>;
  history: RecordData[];
  tags: RecordData[];
  disabled?: boolean;
  onApply: (id: string) => void;
}) {
  const suggestion = useMemo(
    () => suggestCategory(row, history, tags),
    [row, history, tags],
  );
  if (!suggestion || row.tagId === suggestion.tagId) return null;
  return (
    <div className="category-suggestion">
      <span>
        <b>
          {suggestion.confidence}: {suggestion.name}
        </b>
        <small>
          Based on {suggestion.count} confirmed{" "}
          {suggestion.count === 1 ? "entry" : "entries"} for this merchant in
          this account.
        </small>
      </span>
      <button
        type="button"
        className="outline"
        disabled={disabled}
        onClick={() => onApply(suggestion.tagId)}
      >
        Use {suggestion.name}
      </button>
    </div>
  );
}
