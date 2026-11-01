import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReceipt, compressReceipt } from "../lib/receipts";
test("receipt limits allow large image inputs for compression and cap PDFs", () => {
  assert.doesNotThrow(() =>
    validateReceipt({ type: "image/jpeg", size: 12 * 1024 * 1024 }),
  );
  assert.throws(
    () => validateReceipt({ type: "image/png", size: 21 * 1024 * 1024 }),
    /under 20 MB/,
  );
  assert.throws(
    () => validateReceipt({ type: "application/pdf", size: 6 * 1024 * 1024 }),
    /PDFs must be under 5 MB/,
  );
  assert.throws(
    () => validateReceipt({ type: "image/svg+xml", size: 100 }),
    /Choose/,
  );
});
test("PDFs and small images remain byte-for-byte unchanged", async () => {
  for (const file of [
    new File(["%PDF receipt"], "bill.pdf", { type: "application/pdf" }),
    new File(["small image"], "small.png", { type: "image/png" }),
  ]) {
    assert.equal(await compressReceipt(file), file);
  }
});
