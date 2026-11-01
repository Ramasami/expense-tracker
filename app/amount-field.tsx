"use client";
import { useEffect, useId, useRef, useState } from "react";
import { amountFromExpression } from "../lib/amount-expression";
export default function AmountField({
  label = "Amount (₹)",
  value,
}: {
  label?: string;
  value?: string | number;
}) {
  const [expression, setExpression] = useState(String(value ?? ""));
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  let result: number | undefined;
  let error = "";
  try {
    if (expression.trim()) result = amountFromExpression(expression);
  } catch (e) {
    error = (e as Error).message;
  }
  useEffect(() => {
    input.current?.setCustomValidity(error);
  }, [error]);
  return (
    <label className="field">
      {label}
      <input
        aria-label={label}
        ref={input}
        name="amount"
        type="text"
        inputMode="text"
        autoComplete="off"
        required
        maxLength={160}
        value={expression}
        aria-describedby={id}
        placeholder="123+345+13*2"
        onChange={(event) => setExpression(event.target.value)}
      />
      <small
        id={id}
        className={error ? "amount-help invalid" : "amount-help"}
        aria-live="polite"
      >
        {error ||
          (result !== undefined
            ? `= ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(result)}`
            : "Add, subtract, multiply or divide.")}
      </small>
    </label>
  );
}
