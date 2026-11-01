import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotFromCsv, parseCsv } from "../lib/public-sheet";
import {
  freshState,
  mergeSource,
  applyOperation,
  backupText,
  parseBackup,
} from "../lib/local-store";
const tags = '"Available Tags","Type (Auto lookup)"\n"Groceries","Expense"';
const csv = (amount = 250) =>
  `"Date","Description / Merchant","Tag","Type","Amount (₹)","Payment Method","Person / Account","Notes","Month (Auto)"\n"01 Nov 2026","Market","Groceries","Expense","${amount}","UPI","Ram","","Nov 2026"`;
test("CSV parses escaped quotes, commas and multiline notes", () =>
  assert.deepEqual(parseCsv('a,b\r\n"a,b","hello\n""world"""'), [
    ["a", "b"],
    ["a,b", 'hello\n"world"'],
  ]));
test("public sheet records map to stable source IDs", () => {
  const d = snapshotFromCsv(csv(), tags);
  assert.equal(d.transactions[0].amount, 250);
  assert.equal(d.transactions[0].date, "2026-11-01");
  assert.equal(d.transactions[0].tagId, d.tags[0].id);
  assert.equal(d.transactions[0].source, "google-sheet");
});
test("refresh updates unedited source records without duplicates", () => {
  const a = mergeSource(freshState(), snapshotFromCsv(csv(), tags));
  const b = mergeSource(a, snapshotFromCsv(csv(400), tags));
  assert.equal(b.data.transactions.length, 1);
  assert.equal(b.data.transactions[0].amount, 400);
  assert.equal(
    mergeSource(b, snapshotFromCsv(csv(400), tags)).data.audit.length,
    b.data.audit.length,
  );
  assert.deepEqual(parseBackup(backupText(b.data)), b.data);
});
test("refresh preserves local edits and marks source divergence", () => {
  let s = mergeSource(freshState(), snapshotFromCsv(csv(), tags));
  s = applyOperation(s, {
    entity: "transactions",
    action: "edit",
    record: { ...s.data.transactions[0], amount: 500 },
    actor: "Ram",
    operationId: crypto.randomUUID(),
  }).state;
  s = mergeSource(s, snapshotFromCsv(csv(300), tags));
  assert.equal(s.data.transactions[0].amount, 500);
  assert.equal(s.data.transactions[0].localEdited, true);
  assert.equal(s.data.transactions[0].sourceChanged, true);
});
test("blank sheet rows retain row-based identities", () => {
  const header = csv().split("\n")[0];
  const d = snapshotFromCsv(
    header + "\n,,,,,,,,\n" + csv().split("\n")[1],
    tags,
  );
  assert.equal(d.transactions[0].sourceRow, 3);
  assert.equal(d.transactions[0].id, "sheet-tx-3");
});
