"use client";
import { useState } from "react";
import { RecordData } from "../lib/finance";
import { budgetTagIds } from "../lib/planning";
export default function BudgetTagPicker({
  tags,
  budget,
}: {
  tags: RecordData[];
  budget: RecordData;
}) {
  const initial = budgetTagIds(budget),
    [selected, setSelected] = useState<string[]>(initial),
    [scope, setScope] = useState(initial.length ? "selected" : "all"),
    [query, setQuery] = useState("");
  const choices = tags.filter(
    (tag) =>
      tag.type === "Expense" &&
      (tag.status === "Active" || selected.includes(tag.id)) &&
      tag.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <fieldset className="budget-tag-picker">
      <legend>Expense tags</legend>
      <input type="hidden" name="tagScope" value={scope} />
      <div className="pill-options">
        <button
          type="button"
          aria-pressed={scope === "all"}
          onClick={() => setScope("all")}
        >
          All expense tags
        </button>
        <button
          type="button"
          aria-pressed={scope === "selected"}
          onClick={() => setScope("selected")}
        >
          Choose tags {selected.length > 0 && `(${selected.length})`}
        </button>
      </div>
      {scope === "selected" && (
        <>
          {selected.map((id) => (
            <input key={id} type="hidden" name="tagIds" value={id} />
          ))}
          <input
            aria-label="Search budget tags"
            placeholder="Search expense tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="budget-tag-list">
            {choices.map((tag) => (
              <label key={tag.id}>
                <input
                  type="checkbox"
                  value={tag.id}
                  checked={selected.includes(tag.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, tag.id]
                        : selected.filter((id) => id !== tag.id),
                    )
                  }
                />
                <span>
                  {tag.name}
                  {tag.status !== "Active" ? " (archived)" : ""}
                </span>
              </label>
            ))}
            {!choices.length && <small>No matching expense tags.</small>}
          </div>
          <small>
            {selected.length} selected · each matching purchase counts once
          </small>
        </>
      )}
    </fieldset>
  );
}
