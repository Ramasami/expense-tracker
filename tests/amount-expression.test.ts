import { test } from "node:test";
import assert from "node:assert/strict";
import { amountFromExpression as amount } from "../lib/amount-expression";
test("amount expressions respect precedence, parentheses, decimals and displayed operator symbols", () => {
  for (const [expression, result] of [
    ["123+345+13*2", 494],
    ["(123+345+13)*2", 962],
    ["100÷4+2×3", 31],
    ["10-3+2", 9],
    [".1+.2", 0.3],
    ["12.345", 12.35],
    ["10/-2+15", 10],
    ["+42", 42],
    ["5−2", 3],
  ] as const)
    assert.equal(amount(expression), result);
});
test("invalid or unsafe amount expressions never execute code or produce nonpositive/nonfinite amounts", () => {
  for (const expression of [
    "1/0",
    "123+",
    "(1+2",
    "2**3",
    "alert(1)",
    "Math.random()",
    "1;2",
    "0",
    "-5",
    "0.001",
    "9".repeat(160),
    "1+".repeat(100),
  ])
    assert.throws(() => amount(expression), Error, expression);
});
