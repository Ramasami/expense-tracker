import { googleToken, currentGoogleSession } from "./google-auth";
import { SHEET_ID, snapshotFromCsv } from "./public-sheet";
import { empty, Snapshot, RecordData } from "./finance";
import { applyOperation, advanceDate } from "./local-store";
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
export const CLOUD_TABS = {
  accounts: "Accounts",
  budgets: "Budgets",
  goals: "Financial Goals",
  recurring: "Recurring Transactions",
  holdings: "Investment Holdings",
  settings: "App Settings",
} as const;
const GENERIC = [
  "ID",
  "Status",
  "Version",
  "Created At",
  "Updated At",
  "Updated By",
  "Operation ID",
  "Data (JSON)",
];
const LEDGER_META = [
  "id",
  "status",
  "version",
  "createdAt",
  "updatedAt",
  "updatedBy",
  "operationId",
  "tagId",
  "account",
  "toAccount",
  "fingerprint",
  "typeOverride",
];
const TAG_META = [
  "id",
  "status",
  "version",
  "createdAt",
  "updatedAt",
  "updatedBy",
  "operationId",
  "parent",
  "description",
  "color",
  "icon",
  "fingerprint",
  "spendingKind",
];
const AUDIT = [
  "Audit ID",
  "Timestamp (IST)",
  "Action",
  "Entity Type",
  "Entity ID",
  "Description",
  "Old Data (JSON)",
  "New Data (JSON)",
  "Changed Fields",
  "Amount Before",
  "Amount After",
  "Modified By",
  "Source",
  "Status",
  "Notes / Error",
  "Operation ID",
  "Request Signature",
];
export type CloudOperation = {
  entity: string;
  action: string;
  record: any;
  operationId: string;
  actor?: string;
  targetId?: string;
};
export class GoogleRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: "Bearer " + googleToken(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(40000),
    });
  } catch (e: any) {
    if (e.message?.includes("Sign in")) throw e;
    throw Error(
      "Google did not confirm this request. Your form is still open. Retry without changing its fields to check the same operation.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new GoogleRequestError(
      response.status === 401
        ? "Your Google session expired. Sign in again; your form has been kept."
        : response.status === 403
          ? "Google denied access. Check sheet edit permission, the Sheets API, and OAuth consent."
          : data.error?.message || "Google Sheets request failed.",
      response.status,
    );
  return data;
}
const letters = (n: number): string =>
  n > 26
    ? letters(Math.floor((n - 1) / 26)) +
      String.fromCharCode(65 + ((n - 1) % 26))
    : String.fromCharCode(64 + n);
const bounded = (sheet: any, cols: number, rows = 10000) =>
  q(sheet.title) +
  "!A1:" +
  letters(Math.min(cols, sheet.gridProperties.columnCount)) +
  Math.min(rows, sheet.gridProperties.rowCount);
const q = (title: string) => "'" + title.replaceAll("'", "''") + "'";
const csv = (rows: any[][]) =>
  rows
    .map((r) =>
      r.map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"').join(","),
    )
    .join("\n");
export function cellRequest(
  sheetId: number,
  row: number,
  col: number,
  values: any[],
) {
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: row - 1,
        endRowIndex: row,
        startColumnIndex: col - 1,
        endColumnIndex: col - 1 + values.length,
      },
      rows: [
        {
          values: values.map((v) => ({
            userEnteredValue:
              typeof v === "number"
                ? { numberValue: v }
                : { stringValue: String(v ?? "") },
          })),
        },
      ],
      fields: "userEnteredValue",
    },
  };
}
function formulaCell(sheetId: number, row: number, col: number, value: string) {
  const request = cellRequest(sheetId, row, col, [""]) as any;
  request.updateCells.rows[0].values[0].userEnteredValue = {
    formulaValue: value,
  };
  return request;
}
export function dateSerial(iso: string) {
  return Math.round(
    (Date.parse(iso + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000,
  );
}
async function metadata() {
  const d = await api("?fields=sheets.properties");
  return d.sheets.map((s: any) => s.properties);
}
async function values(ranges: string[], formulas = false) {
  const params = new URLSearchParams({
    valueRenderOption: formulas ? "FORMULA" : "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  ranges.forEach((r) => params.append("ranges", r));
  const d = await api("/values:batchGet?" + params);
  return d.valueRanges.map((r: any) => r.values || []) as any[][][];
}
async function batch(requests: any[]) {
  if (requests.length) await api(":batchUpdate", { requests });
}
let preparing: Promise<void> | null = null;
export async function ensureGoogleSchema() {
  if (preparing) return preparing;
  preparing = prepare().finally(() => {
    preparing = null;
  });
  return preparing;
}
async function prepare() {
  const sheets = await metadata(),
    ledger = sheets.find((s: any) => s.title === "Expense Ledger"),
    tags = sheets.find((s: any) => s.title === "Expense Tags");
  if (!ledger || !tags)
    throw Error(
      "The existing Expense Ledger and Expense Tags tabs are required.",
    );
  const [lh, th, settings] = await values([
    bounded(ledger, 22, 1),
    bounded(tags, 16, 1),
    ...(sheets.some((s: any) => s.title === "App Settings")
      ? ["'App Settings'!A1:H1"]
      : []),
  ]);
  if (
    lh[0]?.[0] !== "Date" ||
    lh[0]?.[1] !== "Description / Merchant" ||
    th[0]?.[0] !== "Available Tags"
  )
    throw Error(
      "The workbook headers changed. No automatic setup was applied.",
    );
  const compatible = (headers: any[], start: number, expected: string[]) =>
    expected.every((v, i) => !headers[start + i] || headers[start + i] === v);
  if (!compatible(lh[0], 10, LEDGER_META) || !compatible(th[0], 3, TAG_META))
    throw Error(
      "Existing metadata columns are in use. No sheet data was overwritten.",
    );
  if (
    lh[0]?.[10] === "id" &&
    th[0]?.[3] === "id" &&
    settings?.[0]?.[0] === GENERIC[0] &&
    [...Object.values(CLOUD_TABS), "Audit Log"].every((title) =>
      sheets.some((s: any) => s.title === title),
    )
  )
    return;
  const [ld, tg, type, summary, invest] = await values(
    [
      bounded(ledger, 22, 5000),
      bounded(tags, 16),
      "'Expense Ledger'!D2",
      "'Monthly Expense Tracker'!A1:O1100",
      "'Investments Overview'!A1:L150",
    ],
    true,
  );
  if (!String(type[0]?.[0] || "").includes("ARRAYFORMULA"))
    throw Error(
      "Expected Type array formula at D2. Setup stopped to preserve your formulas.",
    );
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const requests: any[] = [];
  const used = new Set(sheets.map((s: any) => s.sheetId));
  const id = () => {
    let n;
    do {
      n = Math.floor(Math.random() * 2000000000) + 1;
    } while (used.has(n));
    used.add(n);
    return n;
  };
  for (const original of [
    ledger,
    tags,
    ...sheets.filter((s: any) =>
      ["Monthly Expense Tracker", "Investments Overview"].includes(s.title),
    ),
  ]) {
    const copy = id();
    requests.push(
      {
        duplicateSheet: {
          sourceSheetId: original.sheetId,
          newSheetId: copy,
          newSheetName: "WT Recovery " + original.title + " " + stamp,
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId: copy, hidden: true },
          fields: "hidden",
        },
      },
    );
  }
  for (const [s, cols] of [
    [ledger, 22],
    [tags, 16],
  ] as const)
    if (s.gridProperties.columnCount < cols)
      requests.push({
        appendDimension: {
          sheetId: s.sheetId,
          dimension: "COLUMNS",
          length: cols - s.gridProperties.columnCount,
        },
      });
  requests.push(
    cellRequest(ledger.sheetId, 1, 11, LEDGER_META),
    cellRequest(tags.sheetId, 1, 4, TAG_META),
  );
  for (const title of [...Object.values(CLOUD_TABS), "Audit Log"]) {
    const found = sheets.find((s: any) => s.title === title),
      headers = title === "Audit Log" ? AUDIT : GENERIC;
    if (found) {
      const [existing] = await values([
        q(title) + "!A1:" + (title === "Audit Log" ? "Q" : "H") + "1",
      ]);
      if (
        existing[0]?.length &&
        JSON.stringify(existing[0]) !== JSON.stringify(headers)
      )
        throw Error(
          `The existing ${title} tab has a different layout. Setup stopped without overwriting it.`,
        );
    } else {
      const sid = id();
      requests.push(
        {
          addSheet: {
            properties: {
              sheetId: sid,
              title,
              gridProperties: {
                rowCount: 1000,
                columnCount: Math.max(headers.length, 8),
                frozenRowCount: 1,
              },
            },
          },
        },
        cellRequest(sid, 1, 1, headers),
      );
    }
  }
  // Existing row-based identities remain stable after assigning native IDs.
  for (let i = 1; i < tg.length; i++)
    if (tg[i]?.[0])
      requests.push(
        cellRequest(tags.sheetId, i + 1, 4, [
          String(tg[i][3] || i + 1),
          tg[i][4] || "Active",
          Number(tg[i][5] || 1),
        ]),
      );
  for (let i = 1; i < ld.length; i++)
    if (ld[i]?.[0] || ld[i]?.[1])
      requests.push(
        cellRequest(ledger.sheetId, i + 1, 11, [
          String(ld[i][10] || i + 1),
          ld[i][11] || "Active",
          Number(ld[i][12] || 1),
        ]),
      );
  requests.push(
    formulaCell(
      ledger.sheetId,
      2,
      4,
      '=ARRAYFORMULA(IF(C2:C5000="","",IF(V2:V5000<>"",V2:V5000,IFNA(VLOOKUP(C2:C5000,\'Expense Tags\'!A2:B,2,FALSE),"Expense"))))',
    ),
  );
  for (const [title, grid] of [
    ["Monthly Expense Tracker", summary],
    ["Investments Overview", invest],
  ] as const) {
    const s = sheets.find((s: any) => s.title === title);
    if (!s) continue;
    grid.forEach((row: any[], ri: number) =>
      row.forEach((f: any, ci: number) => {
        if (
          typeof f !== "string" ||
          !f.startsWith("=") ||
          !f.includes("SUMIFS('Expense Ledger'!")
        )
          return;
        const updated = f.replace(/SUMIFS\(([^()]*)\)/g, (m, inner) =>
          inner.includes("'Expense Ledger'!") && !inner.includes("$L$")
            ? "SUMIFS(" +
              inner +
              ",'Expense Ledger'!$L$2:$L$5000,\"<>Deleted\")"
            : m,
        );
        if (updated !== f)
          requests.push(formulaCell(s.sheetId, ri + 1, ci + 1, updated));
      }),
    );
  }
  await batch(requests);
}
export async function readGoogleSnapshot() {
  const sheets = await metadata();
  const ranges = [
    bounded(
      sheets.find((s: any) => s.title === "Expense Ledger"),
      22,
      5000,
    ),
    bounded(
      sheets.find((s: any) => s.title === "Expense Tags"),
      16,
    ),
  ];
  const extras = Object.entries(CLOUD_TABS).filter(([, name]) =>
    sheets.some((s: any) => s.title === name),
  );
  ranges.push(
    ...extras.map(([, name]) =>
      bounded(
        sheets.find((s: any) => s.title === name),
        8,
      ),
    ),
  );
  if (sheets.some((s: any) => s.title === "Audit Log"))
    ranges.push(
      bounded(
        sheets.find((s: any) => s.title === "Audit Log"),
        17,
      ),
    );
  const grids = await values(ranges);
  const data = snapshotFromCsv(csv(grids[0]), csv(grids[1]));
  for (let i = 0; i < extras.length; i++) {
    const [key] = extras[i];
    (data[key as keyof Snapshot] as RecordData[]) = grids[i + 2]
      .slice(1)
      .map((r, ri) => {
        if (!r[0] || r[1] === "Pending") return null;
        const parsed = JSON.parse(r[7] || "{}");
        return {
          ...parsed,
          id: String(r[0]),
          status: r[1] || "Active",
          version: Number(r[2] || 1),
          sheetVersion: Number(r[2] || 1),
          createdAt: r[3],
          updatedAt: r[4],
          updatedBy: r[5],
          operationId: r[6],
          source: "google-sheet",
          sourceRow: ri + 2,
          sourceFingerprint: JSON.stringify(r),
        };
      })
      .filter(Boolean) as RecordData[];
  }
  if (grids.length > 2 + extras.length)
    data.audit = grids
      .at(-1)!
      .slice(1)
      .filter((r) => r[0])
      .map((r) => ({
        id: String(r[0]),
        version: 1,
        status: "Active",
        timestamp: r[1],
        action: r[2],
        entity: r[3],
        entityId: r[4],
        description: r[5],
        old: r[6],
        updated: r[7],
        fields: r[8],
        actor: r[11],
        operationId: r[15],
        requestSignature: r[16],
        source: "google-sheet",
      }))
      .reverse();
  return { data, sheets };
}
function rawId(key: string, id: string) {
  return key === "transactions"
    ? id.replace(/^sheet-tx-/, "")
    : key === "tags"
      ? id.replace(/^sheet-tag-/, "")
      : id;
}
const tab = (entity: string) =>
  entity === "transactions"
    ? "Expense Ledger"
    : entity === "tags"
      ? "Expense Tags"
      : CLOUD_TABS[entity as keyof typeof CLOUD_TABS];
export function recordRequests(
  entity: string,
  record: RecordData,
  old: RecordData | undefined,
  sheetId: number,
  row: number,
  operationId: string,
  actor: string,
) {
  const now = new Date().toISOString();
  if (entity === "transactions") {
    const metadata = [
      rawId(entity, record.id),
      record.status,
      record.version,
      record.createdAt || now,
      now,
      actor,
      operationId,
      rawId("tags", record.tagId || ""),
      record.account || "",
      record.toAccount || "",
      "",
      record.type,
    ];
    const requests = [
      cellRequest(sheetId, row, 2, [record.description, record.tag]),
      cellRequest(sheetId, row, 5, [
        Number(record.amount),
        record.payment || "",
        record.person === "Combined" ? "" : record.person,
        record.notes || "",
      ]),
      cellRequest(sheetId, row, 11, metadata),
    ];
    if (!old || old.date !== record.date)
      requests.unshift(cellRequest(sheetId, row, 1, [dateSerial(record.date)]));
    return requests;
  }
  if (entity === "tags")
    return [
      cellRequest(sheetId, row, 1, [record.name, record.type]),
      cellRequest(sheetId, row, 4, [
        rawId(entity, record.id),
        record.status,
        record.version,
        record.createdAt || now,
        now,
        actor,
        operationId,
        record.parent || "",
        record.description || "",
        record.color || "#ff385c",
        record.icon || "#",
        "",
        record.spendingKind || "Unclassified",
      ]),
    ];
  return [
    cellRequest(sheetId, row, 1, [
      record.id,
      record.status,
      record.version,
      record.createdAt || now,
      now,
      actor,
      operationId,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(record).filter(
            ([key]) =>
              ![
                "sourceFingerprint",
                "sourceRow",
                "sheetVersion",
                "localEdited",
                "sourceChanged",
                "sourceMissing",
                "source",
              ].includes(key),
          ),
        ),
      ),
    ]),
  ];
}
async function reserve(
  entity: string,
  operationId: string,
  record: RecordData,
) {
  const title = tab(entity),
    range =
      q(title) +
      (entity === "transactions"
        ? "!A:C"
        : entity === "tags"
          ? "!A:A"
          : "!A:H");
  const marker = "__WT_PENDING__" + operationId;
  const sheets = await metadata();
  const sheet = sheets.find((s: any) => s.title === title);
  const [existing] = await values([
    bounded(
      sheet,
      entity === "transactions" ? 22 : entity === "tags" ? 16 : 8,
      entity === "transactions" ? 5000 : 10000,
    ),
  ]);
  const pending = existing.findIndex((r) =>
    entity === "transactions"
      ? r[1] === marker
      : entity === "tags"
        ? r[0] === marker
        : r[6] === operationId && r[1] === "Pending",
  );
  if (pending >= 0) return pending + 1;
  const body =
    entity === "transactions"
      ? [[dateSerial(record.date), marker, record.tag]]
      : entity === "tags"
        ? [[marker]]
        : [[record.id, "Pending", 0, "", "", "", operationId, "{}"]];
  const appended = await api(
    "/values/" +
      encodeURIComponent(range) +
      ":append?valueInputOption=RAW&insertDataOption=OVERWRITE",
    { values: body },
  );
  const updated = appended.updates?.updatedRange || "";
  const match = /![A-Z]+(\d+):/.exec(updated);
  if (!match)
    throw Error(
      "Google reserved a row but did not return its location. Retry this operation.",
    );
  const row = Number(match[1]);
  if (entity === "transactions" && row > 5000)
    throw Error(
      "The ledger is at its 5,000-row formula limit. The pending row has no amount and was not counted.",
    );
  return row;
}
let writing: Promise<any> | null = null;
export async function saveGoogle(operation: CloudOperation) {
  if (writing)
    throw Error("Wait for the current Google Sheets save to finish.");
  const task = save(operation);
  writing = task;
  try {
    return await task;
  } finally {
    writing = null;
  }
}
async function save(operation: CloudOperation): Promise<Record<string, any>> {
  const actor = currentGoogleSession()?.email;
  if (!actor) throw Error("Sign in to Google before saving.");
  await ensureGoogleSchema();
  let { data, sheets } = await readGoogleSnapshot();
  const signature = JSON.stringify([
    operation.entity,
    operation.action,
    operation.record,
    operation.targetId,
  ]);
  const receipt = data.audit.find(
    (a) =>
      a.operationId === operation.operationId && a.entity === operation.entity,
  );
  if (receipt) {
    if (receipt.requestSignature !== signature)
      throw Error(
        "This retry has different fields. Close and reopen the form before saving new changes.",
      );
    return { ok: true, record: JSON.parse(receipt.updated), data };
  }
  if (operation.action === "runDue") {
    let executed = 0;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const schedule of data.recurring.filter(
      (r) => r.status === "Active" && r.scheduleStatus === "Active",
    )) {
      let current = schedule,
        count = 0;
      while (current.nextDate <= today && count++ < 100) {
        const due = current.nextDate;
        const added = await save({
          entity: "transactions",
          action: "create",
          record: {
            date: due,
            description: current.name,
            amount: Number(current.amount),
            type: current.type,
            tagId: current.tagId,
            person: current.person,
            payment: current.payment || "Bank Transfer",
            account: current.account || "",
            toAccount: current.toAccount || "",
            notes: "Recurring: " + current.name,
          },
          operationId: "rec-" + current.id + "-" + due,
        });
        if (!added.ok)
          throw Error("A recurring transaction could not be confirmed.");
        const anchor = Number(current.anchorDay || due.slice(8));
        const advanced = await save({
          entity: "recurring",
          action: "edit",
          record: {
            ...current,
            anchorDay: anchor,
            nextDate: advanceDate(due, current.frequency, anchor),
          },
          operationId: "adv-" + current.id + "-" + due,
        });
        if (advanced.conflict) return advanced;
        current = advanced.record!;
        executed++;
      }
    }
    const latest = await readGoogleSnapshot();
    return { ok: true, data: latest.data, executed };
  }
  const candidateId =
    operation.record.source !== "google-sheet" &&
    operation.record.id &&
    ["transactions", "tags"].includes(operation.entity)
      ? (operation.entity === "transactions" ? "sheet-tx-" : "sheet-tag-") +
        operation.record.id
      : operation.record.id;
  const old = data[operation.entity as keyof Snapshot]?.find(
    (r) => r.id === candidateId,
  );
  if (old && operation.action === "create")
    throw Error(
      "This record already exists in Google Sheets. Refresh before trying to create it again.",
    );
  if (
    !old &&
    operation.record.source !== "google-sheet" &&
    !["create", "edit"].includes(operation.action)
  )
    throw Error(
      "This record exists only in this browser. Save it to Google Sheets first, or choose browser-only mode.",
    );
  if (operation.action !== "create" && old) {
    const expected = Number(
      operation.record.sheetVersion ?? operation.record.version,
    );
    if (
      expected !== Number(old.sheetVersion ?? old.version) ||
      (operation.record.sourceFingerprint &&
        operation.record.sourceFingerprint !== old.sourceFingerprint)
    )
      return {
        conflict: true,
        latest: old,
        pending: operation.record,
        error: "This record changed in Google Sheets.",
      };
  }
  let input = { ...operation.record, ...(old ? { id: old.id } : {}) };
  if (operation.entity === "transactions") {
    const tag =
      data.tags.find((t) => t.id === input.tagId) ||
      data.tags.find((t) => t.name === input.tag);
    if (!tag)
      throw Error(
        "Save this tag to Google Sheets before using it in a transaction.",
      );
    input.tagId = tag.id;
  }
  const localCreate = !old && operation.record.source !== "google-sheet";
  if (!old && !localCreate && operation.action !== "create")
    throw Error(
      "This Google Sheets record no longer exists. Refresh before saving.",
    );
  const action = localCreate ? "create" : operation.action;
  if (old) input.version = old.version;
  const planned = applyOperation(
    { data, receipts: {} },
    { ...operation, actor, action, record: input },
  );
  if (planned.result.conflict) return planned.result;
  const result = planned.result.record as RecordData;
  const audits = planned.state.data.audit.filter(
    (a) => a.operationId === operation.operationId,
  );
  if (
    action === "create" &&
    ["transactions", "tags"].includes(operation.entity)
  ) {
    const initial = result.id;
    result.id =
      (operation.entity === "transactions" ? "sheet-tx-" : "sheet-tag-") +
      (localCreate && operation.record.id ? operation.record.id : result.id);
    audits.forEach((a) => {
      if (a.entityId === initial) {
        a.entityId = result.id;
        a.updated = JSON.stringify(result);
      }
    });
  }
  if (
    action === "create" &&
    localCreate &&
    operation.record.id &&
    !["transactions", "tags"].includes(operation.entity)
  ) {
    const initial = result.id;
    result.id = operation.record.id;
    audits.forEach((a) => {
      if (a.entityId === initial) {
        a.entityId = result.id;
        a.updated = JSON.stringify(result);
      }
    });
  }
  result.source = "google-sheet";
  result.localEdited = false;
  result.sheetVersion = result.version;
  result.updatedBy = actor;
  const changes: {
    entity: string;
    record: RecordData;
    old: RecordData | undefined;
    row: number;
  }[] = [];
  for (const a of audits) {
    const key = a.entity;
    const record = a.entityId === result.id ? result : JSON.parse(a.updated);
    const previous = data[key as keyof Snapshot].find(
      (r) => r.id === record.id,
    );
    const row =
      previous?.sourceRow ||
      (await reserve(key, operation.operationId, record));
    changes.push({ entity: key, record, old: previous, row });
  }
  const before = await readGoogleSnapshot();
  for (const change of changes) {
    if (change.old) {
      const latest = before.data[change.entity as keyof Snapshot].find(
        (r) => r.id === change.old!.id,
      );
      if (
        !latest ||
        latest.version !== change.old.version ||
        latest.sourceFingerprint !== change.old.sourceFingerprint
      )
        return {
          conflict: true,
          latest: latest || change.old,
          pending: operation.record,
          error: "This record changed in Google Sheets.",
        };
    }
  }
  const requests: any[] = [];
  for (const change of changes) {
    const sheet = sheets.find((s: any) => s.title === tab(change.entity));
    requests.push(
      ...recordRequests(
        change.entity,
        change.record,
        change.old,
        sheet.sheetId,
        change.row,
        operation.operationId,
        actor,
      ),
    );
    if (change.entity === "transactions" && !change.old)
      requests.push({
        copyPaste: {
          source: {
            sheetId: sheet.sheetId,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: 22,
          },
          destination: {
            sheetId: sheet.sheetId,
            startRowIndex: change.row - 1,
            endRowIndex: change.row,
            startColumnIndex: 0,
            endColumnIndex: 22,
          },
          pasteType: "PASTE_FORMAT",
          pasteOrientation: "NORMAL",
        },
      });
  }
  const auditSheet = sheets.find((s: any) => s.title === "Audit Log");
  for (const a of audits) {
    const updated = a.entityId === result.id ? result : JSON.parse(a.updated);
    requests.push({
      appendCells: {
        sheetId: auditSheet.sheetId,
        rows: [
          {
            values: [
              a.id,
              a.timestamp,
              a.action,
              a.entity,
              a.entityId,
              a.description,
              a.old,
              JSON.stringify(updated),
              a.fields,
              JSON.parse(a.old || "{}").amount || 0,
              updated.amount || 0,
              actor,
              "Website · Google OAuth",
              "Success",
              "",
              operation.operationId,
              signature,
            ].map((v) => ({
              userEnteredValue:
                typeof v === "number"
                  ? { numberValue: v }
                  : { stringValue: String(v ?? "") },
            })),
          },
        ],
        fields: "userEnteredValue",
      },
    });
  }
  await batch(requests);
  const confirmed = await readGoogleSnapshot();
  if (
    !confirmed.data.audit.some((a) => a.operationId === operation.operationId)
  )
    throw Error(
      "Google has not confirmed the audit receipt. Retry the same save.",
    );
  const saved = confirmed.data[operation.entity as keyof Snapshot].find(
    (r) => r.id === result.id,
  );
  if (!saved)
    throw Error(
      "The record could not be read back from Google Sheets. Retry the same save.",
    );
  return { ok: true, record: saved, data: confirmed.data };
}
