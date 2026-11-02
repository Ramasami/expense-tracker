import { test } from "node:test";
import assert from "node:assert/strict";
import { belongsToOwner, INITIAL_OWNERS } from "../lib/owners";
import { empty, filterRows } from "../lib/finance";
import { applyOperation } from "../lib/local-store";
const owners = [
  ...INITIAL_OWNERS,
  {
    id: "xyz",
    name: "XYZ",
    kind: "owner",
    emails: ["xyz@example.com"],
    status: "Active",
    version: 1,
  },
];
test("many-to-many owners see all their accounts without duplicating combined transactions", () => {
  const accounts = [
    {
      id: "shared",
      name: "Shared bank",
      ownerIds: ["owner-ram", "xyz"],
      status: "Active",
      version: 1,
    },
    {
      id: "xyz-bank",
      name: "XYZ bank",
      ownerIds: ["xyz"],
      status: "Active",
      version: 1,
    },
  ];
  const rows = [
    {
      id: "one",
      version: 1,
      status: "Active",
      date: "2026-11-01",
      account: "shared",
      person: "Ram",
      amount: 100,
    },
    {
      id: "two",
      version: 1,
      status: "Active",
      date: "2026-11-01",
      account: "xyz-bank",
      person: "XYZ",
      amount: 200,
    },
  ];
  assert.equal(
    filterRows(rows, "XYZ", "2026-01-01", "2026-12-31", accounts, owners)
      .length,
    2,
  );
  assert.equal(
    filterRows(rows, "Ram", "2026-01-01", "2026-12-31", accounts, owners)
      .length,
    1,
  );
  assert.equal(
    filterRows(rows, "Combined", "2026-01-01", "2026-12-31", accounts, owners)
      .length,
    2,
  );
  assert.equal(belongsToOwner(rows[0], "Varsha", accounts, owners), false);
});
test("owners require unique names and emails; account links must use active owners", () => {
  const data = structuredClone(empty);
  data.settings = structuredClone(owners);
  const state = { data, receipts: {} };
  const operation = (entity: string, record: any, action = "create") => ({
    entity,
    record,
    action,
    operationId: crypto.randomUUID(),
    actor: "tester",
  });
  assert.throws(
    () =>
      applyOperation(
        state,
        operation("settings", {
          kind: "owner",
          name: "New",
          emails: ["xyz@example.com"],
        }),
      ),
    /email can belong/,
  );
  assert.throws(
    () =>
      applyOperation(
        state,
        operation("accounts", { name: "Bank", ownerIds: [] }),
      ),
    /at least one/,
  );
  assert.throws(
    () =>
      applyOperation(
        state,
        operation("accounts", { name: "Bank", ownerIds: ["missing"] }),
      ),
    /active account owner/,
  );
  const account = applyOperation(
    state,
    operation("accounts", {
      name: "Joint bank",
      ownerIds: ["owner-ram", "xyz"],
      openingBalance: 0,
    }),
  );
  assert.throws(
    () =>
      applyOperation(account.state, operation("settings", owners[2], "delete")),
    /Reassign/,
  );
  const renamed = applyOperation(
    state,
    operation("settings", { ...owners[2], name: "New name" }, "edit"),
  );
  assert.deepEqual(renamed.result.record.aliases, ["XYZ"]);
  assert.equal(
    belongsToOwner(
      { id: "old", version: 1, status: "Active", person: "XYZ" },
      "New name",
      [],
      renamed.state.data.settings,
    ),
    true,
  );
});

test("transfer belongs to the source account, not the destination owner", () => {
  const accounts = [
    {
      id: "ram",
      ownerIds: ["owner-ram"],
      name: "Ram bank",
      status: "Active",
      version: 1,
    },
    {
      id: "varsha",
      ownerIds: ["owner-varsha"],
      name: "Varsha bank",
      status: "Active",
      version: 1,
    },
  ];
  const row = {
    id: "transfer",
    status: "Active",
    version: 1,
    account: "ram",
    toAccount: "varsha",
    type: "Transfer",
    person: "Varsha",
  };
  assert.equal(belongsToOwner(row, "Ram", accounts, owners), true);
  assert.equal(belongsToOwner(row, "Varsha", accounts, owners), false);
});
