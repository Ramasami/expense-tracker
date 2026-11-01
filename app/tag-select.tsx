"use client";
import { useId, useState } from "react";
type Option = { value: string; label: string };
export default function TagSelect({
  label = "Expense tag",
  name = "tagId",
  value,
  options,
  required,
  onChange,
  emptyLabel = "Select…",
}: {
  label?: string;
  name?: string;
  value?: string;
  options: Option[];
  required?: boolean;
  onChange?: (value: string) => void;
  emptyLabel?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState(value || "");
  const selected = onChange ? value || "" : selection;
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const current = options.find((option) => option.value === selected);
  return (
    <div className="field tag-picker">
      <label htmlFor={id}>{label}</label>
      <input
        type="search"
        aria-label={`Search ${label.toLowerCase()}s`}
        placeholder="Search expense tags…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select
        id={id}
        aria-label={label}
        name={name}
        required={required}
        value={selected}
        onChange={(event) => {
          setSelection(event.target.value);
          onChange?.(event.target.value);
        }}
      >
        <option value="">{emptyLabel}</option>
        {current && !filtered.some((option) => option.value === selected) && (
          <option hidden value={current.value}>
            {current.label}
          </option>
        )}
        {filtered.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {query.trim() && (
        <small role="status">
          {filtered.length
            ? `${filtered.length} matching tag${filtered.length === 1 ? "" : "s"}`
            : "No matching expense tags. Try another search."}
        </small>
      )}
    </div>
  );
}
