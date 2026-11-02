import { reconcile } from "./planning";
import { duplicateKey } from "./statement-import";
import { isLoanPayment, validateLoan, validateLoanPayment } from "./loans";
import {
  isCreditPayment,
  paymentFor,
  unpaidCredit,
  validateCreditPayment,
} from "./credit";
import { activeOwners, allOwners, accountOwners, ownerEmails } from "./owners";
import { empty, Snapshot, RecordData } from "./finance";
import { z } from "zod";
const DB = "wealthtrack-browser-v1",
  STORE = "household";
export const collections = Object.keys(empty) as (keyof Snapshot)[];
type Entity = Exclude<keyof Snapshot, "audit">;
type State = {
  data: Snapshot;
  receipts: Record<string, { signature: string; result: any }>;
};
type Operation = {
  entity: string;
  action: string;
  record: any;
  operationId: string;
  actor: string;
  targetId?: string;
};
const recordSchema = z
  .object({
    id: z.string().min(1).max(200),
    version: z.number().int().positive().default(1),
    status: z.enum(["Active", "Deleted", "Archived"]).default("Active"),
  })
  .catchall(z.json());
const snapshotSchema = z.object(
  Object.fromEntries(
    collections.map((key) => [key, z.array(recordSchema).max(100000)]),
  ) as Record<keyof Snapshot, z.ZodArray<typeof recordSchema>>,
);
export function freshState(): State {
  const data = structuredClone(empty);
  const defaults: [string, string][] = [
    ["Groceries", "Expense"],
    ["Food & Dining", "Expense"],
    ["Rent", "Expense"],
    ["Utilities", "Expense"],
    ["Transport", "Expense"],
    ["Shopping", "Expense"],
    ["Health", "Expense"],
    ["Entertainment", "Expense"],
    ["Other", "Expense"],
    ["Salary", "Income"],
    ["Other Income", "Income"],
    ["Refund", "Income"],
    ["Mutual Funds", "Investment"],
    ["Stocks", "Investment"],
    ["Gold", "Investment"],
    ["Other Investment", "Investment"],
    ["Transfer", "Transfer"],
  ];
  data.tags = defaults.map(([name, type], i) => ({
    id: "default-tag-" + i,
    name,
    type,
    status: "Active",
    version: 1,
    color: "#ff385c",
  }));
  return { data, receipts: {} };
}
function date(iso: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
    Number.isFinite(Date.parse(iso)) &&
    new Date(iso + "T12:00:00Z").toISOString().slice(0, 10) === iso
  );
}
function validateLedgerAccounts(r: RecordData, data: Snapshot) {
  const active = (value: string) =>
    data.accounts.some(
      (account) => account.status === "Active" && account.id === value,
    );
  if (!active(r.account))
    throw Error(
      "Select an active From account. This is the account the transaction belongs to.",
    );
  const account = data.accounts.find((account) => account.id === r.account)!;
  const assigned = allOwners(data.settings).filter((owner) =>
    accountOwners(account, allOwners(data.settings)).includes(owner.id),
  );
  if (assigned.length)
    r.person = assigned.length === 1 ? assigned[0].name : "Combined";
  if (r.type === "Transfer") {
    if (
      !active(r.toAccount) ||
      (r.toAccount === r.account && r.creditPayment !== true)
    )
      throw Error("Transfers need two different active accounts.");
  } else r.toAccount = "";
}
function validateExpenseTiming(r: RecordData, data: Snapshot) {
  if (r.type === "Expense") {
    r.expenseMode ||= "Debit";
    if (r.expenseMode === "Credit") {
      const card = data.accounts
        .find((account) => account.id === r.account)
        ?.creditCards?.find((card: any) => card.id === r.creditCardId);
      const historicalCard = data.transactions.some(
        (row) =>
          row.id === r.id &&
          row.account === r.account &&
          row.expenseMode === "Credit" &&
          row.creditCardId === r.creditCardId,
      );
      if (!card && !historicalCard)
        throw Error(
          "Choose a credit card for this account. Add cards in Accounts first.",
        );
      r.creditCardName =
        card?.name || r.creditCardName || "Removed credit card";
      r.payment = "Credit Card";
    } else if (!r.statementCardPayment) {
      r.creditCardId = "";
      r.creditCardName = "";
    }
    if (!["Debit", "Credit"].includes(r.expenseMode))
      throw Error("Choose Debit or Credit Card.");
  }
}
function validate(
  entity: Entity,
  r: RecordData,
  data: Snapshot,
  legacy = false,
) {
  if (entity === "transactions") {
    if (
      !date(r.date) ||
      !String(r.description || "").trim() ||
      !Number.isFinite(r.amount) ||
      r.amount <= 0
    )
      throw Error("Enter a valid date, description and positive amount.");
    if (!["Expense", "Income", "Investment", "Transfer"].includes(r.type))
      throw Error("Select a transaction type.");
    if (!legacy) validateLedgerAccounts(r, data);
    if (
      ![
        "Combined",
        ...allOwners(data.settings).flatMap((owner) => [
          owner.name,
          ...(owner.aliases || []),
        ]),
      ].includes(r.person)
    )
      throw Error("Select a person.");
    const tag = data.tags.find((t) => t.id === r.tagId);
    if (
      !tag ||
      (tag.status !== "Active" &&
        !data.transactions.some((t) => t.id === r.id && t.tagId === tag.id))
    )
      throw Error("Select an active tag.");
    r.tag = tag.name;
    if (
      !legacy &&
      r.statementImport &&
      r.sourceStatementId &&
      !r.importDuplicateConfirmed &&
      data.transactions.some(
        (row) =>
          row.id !== r.id &&
          row.status === "Active" &&
          duplicateKey(row) === duplicateKey(r),
      )
    )
      throw Error(
        "A matching statement transaction already exists. Review the duplicate in the import preview.",
      );

    if (!legacy) {
      validateExpenseTiming(r, data);
      if (r.cardRefund === true) {
        const card = data.accounts
          .find((account) => account.id === r.account)
          ?.creditCards?.find((card: any) => card.id === r.creditCardId);
        const historical = data.transactions.some(
          (row) =>
            row.id === r.id &&
            row.account === r.account &&
            row.cardRefund === true &&
            row.creditCardId === r.creditCardId,
        );
        if (r.type !== "Income" || (!card && !historical))
          throw Error(
            "Choose a linked credit card for a card refund, or record a bank refund as ordinary income.",
          );
        r.creditCardName =
          card?.name || r.creditCardName || "Removed credit card";
      }

      if (r.loanPayment === true && r.creditPayment === true)
        throw Error("Choose either a loan or credit card payment.");
      if (r.creditPayment === true) validateCreditPayment(r, data.transactions);
      if (r.loanPayment === true)
        validateLoanPayment(r, data.settings, data.transactions);
    }
  } else if (!String(r.name || "").trim()) throw Error("Enter a name.");
  if (entity === "tags") {
    if (!["Expense", "Income", "Investment", "Transfer"].includes(r.type))
      throw Error("Select a valid tag type.");
    if (
      data.tags.some(
        (t) => t.id !== r.id && t.name.toLowerCase() === r.name.toLowerCase(),
      )
    )
      throw Error("A tag with that name already exists.");
    const prior = data.tags.find((t) => t.id === r.id);
    if (
      prior &&
      prior.type !== r.type &&
      data.transactions.some((t) => t.tagId === r.id)
    )
      throw Error("This tag is in use. Create a new tag to change its type.");
    let parent = r.parent;
    const visited = new Set([r.id]);
    while (parent) {
      if (visited.has(parent))
        throw Error("A category cannot be its own ancestor.");
      visited.add(parent);
      const p = data.tags.find((t) => t.id === parent);
      if (!p) throw Error("Select an existing parent.");
      parent = p.parent;
    }
  }
  if (
    ["budgets", "goals", "holdings", "recurring"].includes(entity) &&
    (!Number.isFinite(r.amount) || r.amount <= 0)
  )
    throw Error("Enter a positive amount.");
  if (entity === "budgets" && !legacy) {
    if (
      r.tagIds !== undefined &&
      (!Array.isArray(r.tagIds) ||
        new Set(r.tagIds).size !== r.tagIds.length ||
        r.tagIds.some(
          (id: any) =>
            typeof id !== "string" ||
            !data.tags.some(
              (t) =>
                t.id === id && t.status === "Active" && t.type === "Expense",
            ),
        ))
    )
      throw Error("Choose valid, unique expense tags for this budget.");
    if (r.tagScope === "selected" && !r.tagIds?.length)
      throw Error("Choose at least one expense tag.");
    if (r.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month))
      throw Error("Choose a valid budget month.");
    if (
      r.tagId &&
      !data.tags.some(
        (t) =>
          t.id === r.tagId && t.status === "Active" && t.type === "Expense",
      )
    )
      throw Error("Choose an active expense tag for this budget.");
    if (
      r.accountId &&
      !data.accounts.some((a) => a.id === r.accountId && a.status === "Active")
    )
      throw Error("Choose an active budget account.");
  }
  if (entity === "settings" && r.kind === "reconciliation" && !legacy) {
    const account = data.accounts.find(
      (a) => a.id === r.accountId && a.status === "Active",
    );
    if (
      !account ||
      !date(r.asOf) ||
      !Number.isFinite(r.statementBalance) ||
      (account.openingBalanceAsOf && r.asOf < account.openingBalanceAsOf)
    )
      throw Error(
        "Choose an account, a date after its opening balance, and a valid statement balance.",
      );
    const result = reconcile(
      account,
      data.transactions,
      r.asOf,
      r.statementBalance,
    );
    if (result.ledger !== r.ledgerBalance || result.difference !== r.difference)
      throw Error(
        "The ledger changed. Start a new comparison before saving reconciliation.",
      );
  }
  if (entity === "accounts") {
    if (
      r.status !== "Active" &&
      data.settings.some(
        (loan) =>
          loan.kind === "loan" &&
          loan.status === "Active" &&
          loan.accountId === r.id,
      )
    )
      throw Error("Reassign linked loans before removing this account.");
    const cards = r.creditCards || [];
    for (const card of cards)
      for (const field of ["statementDay", "dueDay"]) {
        if (
          card[field] !== undefined &&
          card[field] !== "" &&
          (!Number.isInteger(Number(card[field])) ||
            Number(card[field]) < 1 ||
            Number(card[field]) > 31)
        )
          throw Error("Card statement and due days must be from 1 to 31.");
      }

    if (
      !Array.isArray(cards) ||
      cards.some(
        (card: any) =>
          !card ||
          typeof card.id !== "string" ||
          !card.id ||
          typeof card.name !== "string" ||
          !card.name.trim() ||
          card.name.trim().length > 120,
      ) ||
      new Set(cards.map((card: any) => card.id)).size !== cards.length ||
      new Set(cards.map((card: any) => card.name.trim().toLowerCase())).size !==
        cards.length
    )
      throw Error("Credit cards need unique names and IDs.");
    if (
      unpaidCredit(data.transactions, r.id).some(
        (row) => !cards.some((card: any) => card.id === row.creditCardId),
      )
    )
      throw Error("Pay outstanding credit charges before removing their card.");
    if (!legacy)
      r.creditCards = cards.map((card: any) => ({
        ...card,
        id: card.id,
        name: card.name.trim(),
      }));
    if (r.status !== "Active" && unpaidCredit(data.transactions, r.id).length)
      throw Error(
        "Pay outstanding credit charges before removing this account.",
      );
  }
  if (entity === "accounts" && Array.isArray(r.ownerIds)) {
    if (
      !r.ownerIds.length ||
      r.ownerIds.some(
        (id: string) =>
          !activeOwners(data.settings).some((owner) => owner.id === id),
      )
    )
      throw Error("Choose at least one active account owner.");
  }
  if (entity === "settings" && r.kind === "loan") {
    validateLoan(r, data.transactions);
    if (
      !data.accounts.some(
        (account) => account.id === r.accountId && account.status === "Active",
      )
    )
      throw Error("Choose an active linked account for the loan.");
  }
  if (entity === "settings" && r.kind === "owner") {
    const others = allOwners(data.settings).filter(
      (owner) => owner.id !== r.id && owner.status === "Active",
    );
    if (
      others.some(
        (owner) => owner.name.toLowerCase() === r.name.trim().toLowerCase(),
      )
    )
      throw Error("An active owner already has this name.");
    if (["Combined", "All", "All accounts"].includes(r.name.trim()))
      throw Error("Choose a different owner name.");
    r.name = r.name.trim();
    r.emails = ownerEmails(r);
    if (
      r.emails.some((email: string) => !/^\S+@\S+\.\S+$/.test(email)) ||
      new Set(r.emails).size !== r.emails.length
    )
      throw Error("Enter valid, unique owner email addresses.");
    if (
      others.some((owner) =>
        ownerEmails(owner).some((email) => r.emails.includes(email)),
      )
    )
      throw Error("An email can belong to only one active owner.");
    if (r.status !== "Active" && others.length === 0)
      throw Error("Keep at least one active owner.");
    if (
      r.status !== "Active" &&
      data.accounts.some(
        (account) =>
          account.status === "Active" &&
          accountOwners(account, allOwners(data.settings)).includes(r.id),
      )
    )
      throw Error(
        "Reassign this owner’s active accounts before removing the owner.",
      );
  }
  if (entity === "accounts" && !Number.isFinite(Number(r.openingBalance || 0)))
    throw Error("Enter a valid opening balance.");
  if (
    entity === "goals" &&
    (!Number.isFinite(Number(r.funded || 0)) || Number(r.funded || 0) < 0)
  )
    throw Error("Enter a valid funded amount.");
  if (entity === "recurring" && !legacy) {
    validateLedgerAccounts(r, data);
    validateExpenseTiming(r, data);
  }
  if (
    entity === "recurring" &&
    (!date(r.nextDate) ||
      !["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"].includes(
        r.frequency,
      ))
  )
    throw Error("Select a valid recurrence and next due date.");
}
function audit(
  data: Snapshot,
  entity: string,
  action: string,
  old: any,
  r: RecordData,
  op: Operation,
) {
  const timestamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
  data.audit.unshift({
    id: crypto.randomUUID(),
    status: "Active",
    version: 1,
    timestamp,
    action,
    entity,
    entityId: r.id,
    description: r.description || r.name || entity,
    old: JSON.stringify(old || {}),
    updated: JSON.stringify(r),
    fields: Object.keys(r)
      .filter((k) => JSON.stringify(old?.[k]) !== JSON.stringify(r[k]))
      .join(", "),
    actor: op.actor + " (unverified)",
    operationId: op.operationId,
  });
}
export function advanceDate(iso: string, frequency: string, anchor: number) {
  const d = new Date(iso + "T12:00:00Z");
  if (["Daily", "Weekly"].includes(frequency))
    d.setUTCDate(d.getUTCDate() + (frequency === "Daily" ? 1 : 7));
  else {
    d.setUTCDate(1);
    d.setUTCMonth(
      d.getUTCMonth() +
        ({ Monthly: 1, Quarterly: 3, Yearly: 12 }[frequency] || 1),
    );
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(anchor, last));
  }
  return d.toISOString().slice(0, 10);
}
function apply(state: State, op: Operation): any {
  const key = op.entity as Entity;
  if (!collections.includes(key) || op.entity === "audit")
    throw Error("Invalid collection.");
  if (
    ![
      "create",
      "edit",
      "delete",
      "restore",
      "archive",
      "merge",
      "runDue",
    ].includes(op.action)
  )
    throw Error("Invalid operation.");
  if (op.action === "runDue") {
    if (key !== "recurring") throw Error("Invalid schedule operation.");
    let executed = 0;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const schedule of state.data.recurring.filter(
      (r) => r.status === "Active" && r.scheduleStatus === "Active",
    )) {
      let count = 0;
      while (schedule.nextDate <= today && count++ < 100) {
        const due = schedule.nextDate,
          record = {
            date: due,
            description: schedule.name,
            amount: schedule.amount,
            type: schedule.type,
            expenseMode: schedule.expenseMode || "Debit",
            creditCardId: schedule.creditCardId || "",
            tagId: schedule.tagId,
            person: schedule.person,
            payment: schedule.payment || "Bank Transfer",
            account: schedule.account || "",
            toAccount: schedule.toAccount || "",
            notes: "Recurring: " + schedule.name,
          };
        apply(state, {
          ...op,
          entity: "transactions",
          action: "create",
          record,
          operationId: "recurring-" + schedule.id + "-" + due,
        });
        const old = { ...schedule };
        schedule.anchorDay = Number(schedule.anchorDay || due.slice(8));
        schedule.nextDate = advanceDate(
          due,
          schedule.frequency,
          schedule.anchorDay,
        );
        schedule.version++;
        schedule.updatedAt = new Date().toISOString();
        schedule.updatedBy = op.actor + " (unverified)";
        audit(state.data, "recurring", "Executed", old, schedule, op);
        executed++;
      }
    }
    return { ok: true, executed };
  }
  const all = state.data[key];
  const old = all.find((r) => r.id === op.record.id);
  if (old && old.version !== op.record.version)
    return {
      conflict: true,
      error: "This record was updated in another browser tab.",
      latest: old,
      pending: op.record,
    };
  if (op.action !== "create" && !old)
    throw Error("Record no longer exists. Reload this page.");
  if (op.action === "create" && old) throw Error("Record already exists.");
  const now = new Date().toISOString();
  const r = {
    ...old,
    ...op.record,
    id: old?.id || crypto.randomUUID(),
    version: old ? old.version + 1 : 1,
    status:
      op.action === "delete"
        ? "Deleted"
        : op.action === "archive"
          ? "Archived"
          : op.action === "restore"
            ? "Active"
            : old?.status || "Active",
    createdAt: old?.createdAt || now,
    updatedAt: now,
    updatedBy: op.actor + " (unverified)",
  };
  if (old?.source === "google-sheet") r.localEdited = true;
  if (key === "settings" && r.kind === "owner" && old && old.name !== r.name)
    r.aliases = Array.from(new Set([...(old.aliases || []), old.name]));
  if (key === "transactions" && isLoanPayment(r) && op.action === "restore")
    validateLoanPayment(r, state.data.settings, state.data.transactions);
  if (
    key === "transactions" &&
    old &&
    isLoanPayment(old) &&
    op.action === "edit" &&
    [
      "amount",
      "principalPaid",
      "interestPaid",
      "loanId",
      "loanPayment",
      "type",
      "account",
    ].some((field) => JSON.stringify(old[field]) !== JSON.stringify(r[field]))
  )
    throw Error(
      "Delete the existing loan payment before changing the repayment split or account.",
    );
  if (key === "transactions" && old) {
    const changed = [
      "amount",
      "account",
      "type",
      "expenseMode",
      "creditCardId",
      "status",
    ].some(
      (field) =>
        (old[field] ?? (field === "expenseMode" ? "Debit" : "")) !==
        (r[field] ?? (field === "expenseMode" ? "Debit" : "")),
    );
    if (paymentFor(old.id, state.data.transactions) && changed)
      throw Error(
        "This credit transaction is paid. Delete its bill payment before changing or deleting the charge.",
      );
    if (
      isCreditPayment(old) &&
      op.action === "edit" &&
      [
        "amount",
        "account",
        "toAccount",
        "type",
        "creditPayment",
        "paidTransactionIds",
        "creditAllocations",
      ].some((field) => JSON.stringify(old[field]) !== JSON.stringify(r[field]))
    )
      throw Error(
        "Delete the existing bill payment before changing its accounts or selected charges.",
      );
  }
  if (
    key === "transactions" &&
    r.creditPayment === true &&
    op.action === "restore"
  )
    validateCreditPayment(r, state.data.transactions);
  validate(
    key,
    r,
    state.data,
    ["delete", "archive", "restore"].includes(op.action),
  );
  if (key === "tags" && old && (old.name !== r.name || op.action === "merge")) {
    const target =
      op.action === "merge"
        ? state.data.tags.find(
            (t) =>
              t.id === op.targetId && t.id !== r.id && t.status === "Active",
          )
        : r;
    if (!target) throw Error("Select a different active merge target.");
    if (op.action === "merge") {
      let ancestor = target.parent;
      const seen = new Set<string>();
      while (ancestor && !seen.has(ancestor)) {
        if (ancestor === r.id)
          throw Error("Choose a merge target outside this tag’s descendants.");
        seen.add(ancestor);
        ancestor = state.data.tags.find((t) => t.id === ancestor)?.parent;
      }
    }
    if (op.action === "merge" && target.type !== r.type)
      throw Error("Merge tags of the same transaction type.");
    for (const t of state.data.transactions.filter((t) => t.tagId === r.id)) {
      const before = { ...t };
      t.tag = target.name;
      t.tagId = target.id;
      t.version++;
      t.updatedAt = now;
      t.updatedBy = r.updatedBy;
      if (t.source === "google-sheet") t.localEdited = true;
      audit(
        state.data,
        "transactions",
        op.action === "merge" ? "Tag merged" : "Tag renamed",
        before,
        t,
        op,
      );
    }
    if (op.action === "merge") {
      r.status = "Archived";
      for (const child of state.data.tags.filter((t) => t.parent === r.id)) {
        if (child.id === target.id) {
          target.parent = r.parent || "";
        } else child.parent = target.id;
        child.version++;
        audit(state.data, "tags", "Parent reassigned", null, child, op);
      }
    }
  }
  if (old) all[all.indexOf(old)] = r;
  else all.push(r);
  audit(state.data, key, op.action, old, r, op);
  return { ok: true, record: r };
}
export function applyOperation(
  input: State,
  op: Operation,
): { state: State; result: any } {
  if (!op.operationId || op.operationId.length > 200)
    throw Error("Operation identifier required.");
  const signature = JSON.stringify([
    op.entity,
    op.action,
    op.record,
    op.targetId,
  ]);
  const receipt = input.receipts[op.operationId];
  if (receipt) {
    if (receipt.signature !== signature)
      throw Error("Retry changed. Reload before saving new changes.");
    return { state: input, result: receipt.result };
  }
  const state = structuredClone(input);
  const result = apply(state, op);
  if (!result.conflict) state.receipts[op.operationId] = { signature, result };
  return { state, result };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(
        Error(
          "Browser storage is unavailable. Enable site storage to save your finances.",
        ),
      );
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error("Could not open browser storage."));
    request.onblocked = () =>
      reject(Error("Close older WealthTrack tabs and retry."));
  });
}
async function update<T>(
  fn: (state: State) => { state: State; result: T },
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.get("main");
    let result: T;
    let problem: unknown;
    request.onsuccess = () => {
      try {
        const updated = fn(request.result || freshState());
        result = updated.result;
        store.put(updated.state, "main");
      } catch (e) {
        problem = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        problem ||
          Error(
            "Could not save to browser storage. Your changes were not confirmed.",
          ),
      );
    };
  });
}
export function readSnapshot(): Promise<Snapshot> {
  return update((state) => ({ state, result: structuredClone(state.data) }));
}
export function mutateLocal(op: Operation) {
  return update((state) => applyOperation(state, op));
}
export function parseBackup(text: string): Snapshot {
  if (text.length > 20000000)
    throw Error("Backup is too large (maximum 20 MB).");
  const parsed = JSON.parse(text);
  if (parsed.format !== "wealthtrack-backup" || parsed.version !== 1)
    throw Error("Select a WealthTrack JSON backup.");
  const validated = snapshotSchema.parse(parsed.data) as Snapshot;
  for (const key of collections) {
    const ids = validated[key].map((r) => r.id);
    if (new Set(ids).size !== ids.length)
      throw Error("Backup contains duplicate record identifiers.");
  }
  // Existing backups can predate account assignment. New writes always require an active source.
  for (const key of collections.filter((k) => k !== "audit"))
    for (const r of validated[key]) validate(key as Entity, r, validated, true);
  return validated;
}
export function backupText(data: Snapshot) {
  return JSON.stringify(
    {
      format: "wealthtrack-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    },
    null,
    2,
  );
}
export function importBackup(text: string) {
  const data = parseBackup(text);
  return update((state) => {
    state.data = data;
    state.receipts = {};
    audit(
      data,
      "settings",
      "Backup imported",
      null,
      {
        id: crypto.randomUUID(),
        status: "Active",
        version: 1,
        name: "Browser backup",
      },
      {
        actor: "Visitor",
        operationId: crypto.randomUUID(),
        entity: "settings",
        action: "import",
        record: {},
      },
    );
    return { state, result: true };
  });
}

export function mergeSource(state: State, source: Snapshot): State {
  const next = structuredClone(state);
  const operation: Operation = {
    entity: "transactions",
    action: "refresh",
    record: {},
    operationId: crypto.randomUUID(),
    actor: "Public sheet (read only)",
  };
  for (const key of ["tags", "transactions"] as const) {
    for (const incoming of source[key]) {
      const old = next.data[key].find((r) => r.id === incoming.id);
      if (old?.localEdited) {
        if (old.sourceFingerprint !== incoming.sourceFingerprint) {
          old.sourceChanged = true;
        }
        continue;
      }
      if (
        old &&
        old.sourceFingerprint === incoming.sourceFingerprint &&
        !old.sourceMissing
      )
        continue;
      const record = {
        ...incoming,
        version: old ? old.version + 1 : 1,
        updatedAt: new Date().toISOString(),
        updatedBy: "Public sheet (read only)",
      };
      if (old) next.data[key][next.data[key].indexOf(old)] = record;
      else next.data[key].push(record);
      audit(
        next.data,
        key,
        old ? "Sheet refreshed" : "Sheet imported",
        old,
        record,
        operation,
      );
    }
    const incomingIds = new Set(source[key].map((r) => r.id));
    for (const r of next.data[key].filter(
      (r) =>
        r.source === "google-sheet" &&
        !incomingIds.has(r.id) &&
        !r.sourceMissing,
    )) {
      const old = { ...r };
      r.sourceMissing = true;
      if (!r.localEdited) {
        r.status = key === "transactions" ? "Deleted" : "Archived";
        r.version++;
      }
      audit(next.data, key, "No longer in sheet", old, r, operation);
    }
  }
  // Consolidate starter tags with the sheet's matching categories.
  for (const tag of next.data.tags.filter((t) =>
    t.id.startsWith("default-tag-"),
  )) {
    const sourceTag = source.tags.find(
      (t) =>
        t.name.toLowerCase() === tag.name.toLowerCase() && t.type === tag.type,
    );
    if (!sourceTag) continue;
    for (const entity of [
      "transactions",
      "budgets",
      "goals",
      "recurring",
    ] as const) {
      for (const r of next.data[entity].filter((r) => r.tagId === tag.id)) {
        const old = { ...r };
        r.tagId = sourceTag.id;
        r.version++;
        audit(next.data, entity, "Category linked to sheet", old, r, operation);
      }
    }
    next.data.tags = next.data.tags.filter((t) => t.id !== tag.id);
  }
  return next;
}
export function refreshPublicSnapshot(source: Snapshot) {
  return update((state) => {
    const next = mergeSource(state, source);
    return { state: next, result: structuredClone(next.data) };
  });
}

export function acceptGoogleSnapshot(
  source: Snapshot,
  saved?: { entity: string; record: RecordData; previousId?: string },
) {
  return update((state) => {
    const next = mergeSource(state, source);
    for (const key of [
      "accounts",
      "budgets",
      "goals",
      "recurring",
      "holdings",
      "settings",
    ] as const) {
      for (const r of source[key]) {
        const old = next.data[key].find((v) => v.id === r.id);
        if (!old) next.data[key].push(r);
        else if (!old.localEdited)
          next.data[key][next.data[key].indexOf(old)] = r;
      }
    }
    const remoteAuditIds = new Set(source.audit.map((a) => a.id));
    next.data.audit = [
      ...source.audit,
      ...next.data.audit.filter(
        (a) => !remoteAuditIds.has(a.id) && a.source !== "google-sheet",
      ),
    ];
    if (saved) {
      const key = saved.entity as keyof Snapshot;
      next.data[key] = next.data[key].filter(
        (r) => r.id !== saved.record.id && r.id !== saved.previousId,
      );
      next.data[key].push({ ...saved.record, localEdited: false });
      if (saved.previousId && saved.previousId !== saved.record.id) {
        for (const entity of [
          "transactions",
          "budgets",
          "goals",
          "recurring",
          "tags",
        ] as const)
          for (const r of next.data[entity]) {
            if (saved.entity === "tags" && r.tagId === saved.previousId)
              r.tagId = saved.record.id;
            if (saved.entity === "tags" && r.parent === saved.previousId)
              r.parent = saved.record.id;
            if (saved.entity === "accounts") {
              if (r.account === saved.previousId) r.account = saved.record.id;
              if (r.toAccount === saved.previousId)
                r.toAccount = saved.record.id;
            }
          }
      }
    }
    return { state: next, result: structuredClone(next.data) };
  });
}
