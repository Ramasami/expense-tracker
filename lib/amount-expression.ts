/** Arithmetic only: no JavaScript evaluation, names, function calls or property access. */
export function amountFromExpression(input: string | number): number {
  const source = String(input)
    .replace(/×/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/−/g, "-")
    .replace(/\s/g, "");
  if (!source || source.length > 160 || !/^[\d.+*/()\-]+$/.test(source))
    throw Error("Use numbers and +, −, ×, ÷ or parentheses.");
  let at = 0;
  function atom(): number {
    if (source[at] === "+" || source[at] === "-") {
      const sign = source[at++];
      return (sign === "-" ? -1 : 1) * atom();
    }
    if (source[at] === "(") {
      at++;
      const value = sum();
      if (source[at++] !== ")") throw Error("Close the parentheses.");
      return value;
    }
    const match = source.slice(at).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw Error("Enter a complete calculation.");
    at += match[0].length;
    return Number(match[0]);
  }
  function product(): number {
    let value = atom();
    while (source[at] === "*" || source[at] === "/") {
      const op = source[at++];
      const next = atom();
      if (op === "/" && next === 0) throw Error("Cannot divide by zero.");
      value = op === "*" ? value * next : value / next;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (source[at] === "+" || source[at] === "-") {
      const op = source[at++];
      const next = product();
      value = op === "+" ? value + next : value - next;
    }
    return value;
  }
  const result = sum();
  if (at !== source.length) throw Error("Check the calculation and operators.");
  if (
    !Number.isFinite(result) ||
    result <= 0 ||
    result > Number.MAX_SAFE_INTEGER / 100
  )
    throw Error("The amount must be a positive, finite number.");
  const rounded = Math.round((result + Number.EPSILON) * 100) / 100;
  if (rounded <= 0) throw Error("The amount must be at least ₹0.01.");
  return rounded;
}
