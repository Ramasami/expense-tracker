import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshState,
  applyOperation,
  backupText,
  parseBackup,
  mutateLocal,
  readSnapshot,
  importBackup,
  advanceDate,
} from "../lib/local-store";
const op = (record: any, entity = "transactions", action = "create") => ({
  record,
  entity,
  action,
  operationId: crypto.randomUUID(),
  actor: "Ram",
});
const tx = {
  date: "2026-11-01",
  description: "Local test",
  amount: 200,
  type: "Expense",
  person: "Ram",
  tagId: "default-tag-0",
};
test("writes and audit are atomic, receipts prevent duplication", () => {
  const operation = op(tx),
    a = applyOperation(freshState(), operation);
  const retry = applyOperation(a.state, operation);
  assert.equal(retry.state.data.transactions.length, 1);
  assert.equal(retry.state.data.audit.length, 1);
  assert.equal(retry.result.record.id, a.result.record.id);
  assert.throws(
    () =>
      applyOperation(a.state, { ...operation, record: { ...tx, amount: 300 } }),
    /Retry changed/,
  );
});
test("stale edits conflict and deleted records restore with the same ID", () => {
  let { state, result } = applyOperation(freshState(), op(tx));
  const first = result.record;
  ({ state, result } = applyOperation(
    state,
    op({ ...first, amount: 500 }, "transactions", "edit"),
  ));
  assert.equal(
    applyOperation(state, op({ ...first, amount: 999 }, "transactions", "edit"))
      .result.conflict,
    true,
  );
  ({ state, result } = applyOperation(
    state,
    op(result.record, "transactions", "delete"),
  ));
  assert.equal(result.record.status, "Deleted");
  ({ state, result } = applyOperation(
    state,
    op(result.record, "transactions", "restore"),
  ));
  assert.equal(result.record.id, first.id);
  assert.equal(state.data.transactions.length, 1);
});
test("tag rename preserves references and creates audits", () => {
  let { state } = applyOperation(freshState(), op(tx));
  const tag = state.data.tags[0];
  ({ state } = applyOperation(
    state,
    op({ ...tag, name: "My groceries" }, "tags", "edit"),
  ));
  assert.equal(state.data.transactions[0].tag, "My groceries");
  assert.equal(state.data.transactions[0].tagId, tag.id);
  assert.equal(state.data.audit.length, 3);
});
test("invalid edits do not mutate the original state", () => {
  const state = freshState();
  assert.throws(() => applyOperation(state, op({ ...tx, amount: -1 })));
  assert.equal(state.data.transactions.length, 0);
  assert.equal(state.data.audit.length, 0);
});
test("backup round trips and malformed backup is rejected", () => {
  const { state } = applyOperation(freshState(), op(tx));
  assert.deepEqual(parseBackup(backupText(state.data)), state.data);
  assert.throws(() => parseBackup('{"format":"other"}'));
  const bad = JSON.parse(backupText(state.data));
  bad.data.transactions.push({ ...bad.data.transactions[0] });
  assert.throws(() => parseBackup(JSON.stringify(bad)), /duplicate/);
});
test("IndexedDB serializes simultaneous additions across connections", async () => {
  await importBackup(backupText(freshState().data));
  await Promise.all([
    mutateLocal(op(tx)),
    mutateLocal(op({ ...tx, description: "Second addition" })),
  ]);
  const d = await readSnapshot();
  assert.equal(d.transactions.length, 2);
  assert.equal(d.audit.filter((a) => a.entity === "transactions").length, 2);
});
test("month-end recurrence retains its anchor", () => {
  assert.equal(advanceDate("2026-01-31", "Monthly", 31), "2026-02-28");
  assert.equal(advanceDate("2026-02-28", "Monthly", 31), "2026-03-31");
});
