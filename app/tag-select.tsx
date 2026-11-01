"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [selection, setSelection] = useState(value || "");
  const selected = onChange ? value || "" : selection;
  const current = options.find((option) => option.value === selected);
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const choices = query.trim()
    ? filtered
    : [{ value: "", label: emptyLabel }, ...filtered];
  useEffect(() => {
    input.current?.setCustomValidity(
      required && !current ? "Choose an expense tag from the list." : "",
    );
  }, [required, current]);
  function show() {
    setQuery("");
    setActive(-1);
    setOpen(true);
  }
  function choose(option: Option) {
    setSelection(option.value);
    onChange?.(option.value);
    setOpen(false);
    setQuery("");
    setActive(-1);
  }
  return (
    <div
      className="field tag-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
          setActive(-1);
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input type="hidden" name={name} value={current?.value || ""} />
      <div className="tag-combobox">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 && choices[active]
              ? `${id}-option-${active}`
              : undefined
          }
          autoComplete="off"
          required={required}
          placeholder={open ? "Type to search tags…" : emptyLabel}
          value={open ? query : current?.label || ""}
          onFocus={show}
          onClick={() => {
            if (!open) show();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                show();
                return;
              }
              setActive((previous) =>
                event.key === "ArrowDown"
                  ? Math.min(previous + 1, choices.length - 1)
                  : Math.max(previous - 1, 0),
              );
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (choices[active]) choose(choices[active]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setQuery("");
              setActive(-1);
            }
          }}
        />
        <button
          type="button"
          className="tag-toggle"
          aria-label={`Show all ${label.toLowerCase()}s`}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            input.current?.focus();
            show();
          }}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && (
        <div
          className="tag-options"
          role="listbox"
          id={`${id}-list`}
          aria-label={`${label} options`}
        >
          {choices.map((option, index) => (
            <button
              type="button"
              role="option"
              id={`${id}-option-${index}`}
              aria-selected={option.value === selected}
              tabIndex={-1}
              className={index === active ? "highlighted" : ""}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          ))}
          {!choices.length && <p role="status">No matching expense tags.</p>}
        </div>
      )}
    </div>
  );
}
