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
function validate(entity: Entity, r: RecordData, data: Snapshot) {
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
    if (!["Ram", "Varsha", "Combined"].includes(r.person))
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
      r.type === "Transfer" &&
      (!r.account || !r.toAccount || r.account === r.toAccount)
    )
      throw Error("Transfers need two different accounts.");
    for (const field of ["account", "toAccount"])
      if (
        typeof (r[field] || "") !== "string" ||
        String(r[field] || "").length > 120
      )
        throw Error("Account names must be text under 120 characters.");
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
  if (entity === "accounts" && !Number.isFinite(Number(r.openingBalance || 0)))
    throw Error("Enter a valid opening balance.");
  if (
    entity === "goals" &&
    (!Number.isFinite(Number(r.funded || 0)) || Number(r.funded || 0) < 0)
  )
    throw Error("Enter a valid funded amount.");
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
  validate(key, r, state.data);
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
  for (const key of collections.filter((k) => k !== "audit"))
    for (const r of validated[key]) validate(key as Entity, r, validated);
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
