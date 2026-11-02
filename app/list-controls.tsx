"use client";
import type { ReactNode } from "react";
export default function ListControls({
  label,
  search,
  onSearch,
  sort,
  onSort,
  sorts,
  children,
}: {
  label: string;
  search: string;
  onSearch: (s: string) => void;
  sort: string;
  onSort: (s: string) => void;
  sorts: [string, string][];
  children?: ReactNode;
}) {
  return (
    <div className="list-tools">
      <input
        aria-label={`Search ${label}`}
        type="search"
        placeholder={`Search ${label.toLowerCase()}`}
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
      <details>
        <summary>Sort & filter</summary>
        <div className="form-grid">
          <label className="field">
            Sort {label.toLowerCase()}
            <select
              aria-label={`Sort ${label}`}
              value={sort}
              onChange={(event) => onSort(event.target.value)}
            >
              {sorts.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          {children}
        </div>
      </details>
    </div>
  );
}
