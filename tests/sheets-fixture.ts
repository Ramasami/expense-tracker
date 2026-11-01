import assert from "node:assert/strict";
import { CLOUD_TABS } from "../lib/google-sheets";
const headers = [
  "Date",
  "Description / Merchant",
  "Tag",
  "Type",
  "Amount (₹)",
  "Payment Method",
  "Person / Account",
  "Notes",
  "Month (Auto)",
  "",
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
const generic = [
  "ID",
  "Status",
  "Version",
  "Created At",
  "Updated At",
  "Updated By",
  "Operation ID",
  "Data (JSON)",
];
export function fixture() {
  const grids: Record<string, any[][]> = {
    "Expense Ledger": [
      headers,
      [
        "01 Nov 2026",
        "Original",
        "Groceries",
        "Expense",
        250,
        "UPI",
        "Ram",
        "",
        "Nov 2026",
        "",
        "2",
        "Active",
        1,
      ],
    ],
    "Expense Tags": [
      [
        "Available Tags",
        "Type (Auto lookup)",
        "",
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
      ],
      ["Groceries", "Expense", "", "2", "Active", 1],
    ],
    "Audit Log": [
      [
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
      ],
    ],
  };
  grids["Monthly Expense Tracker"] = [
    [
      "=SUMIFS('Expense Ledger'!$E$2:$E$5000,'Expense Ledger'!$D$2:$D$5000,\"Expense\")",
    ],
  ];
  grids["Investments Overview"] = [
    [
      "=SUMIFS('Expense Ledger'!$E$2:$E$5000,'Expense Ledger'!$D$2:$D$5000,\"Investment\")",
    ],
  ];
  Object.values(CLOUD_TABS).forEach((t) => (grids[t] = [[...generic]]));
  const properties = Object.keys(grids).map((title, i) => ({
    title,
    sheetId: i + 1,
    gridProperties: {
      rowCount: title === "Expense Ledger" ? 5000 : 1000,
      columnCount:
        title === "Expense Ledger"
          ? 22
          : title === "Expense Tags"
            ? 16
            : title === "Audit Log"
              ? 17
              : 8,
    },
  }));
  let batches = 0,
    failAfterCommit = false,
    failAppend = false;
  const requests: any[] = [];
  const column = (s: string) =>
    [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const decode = (range: string) => {
    const m = /^'([^']+)'!([A-Z]+)(\d*):?([A-Z]*)(\d*)$/.exec(range)!;
    if (!m) throw Error("Bad fixture range " + range);
    return {
      name: m[1],
      col: column(m[2]),
      row: Number(m[3] || 1) - 1,
      endCol: m[4] ? column(m[4]) + 1 : column(m[2]) + 1,
      endRow: Number(m[5] || 10000),
    };
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.includes("userinfo"))
      return Response.json({
        email: "ramasami.official@gmail.com",
        name: "Ram",
        email_verified: true,
      });
    assert.equal((init?.headers as any)?.Authorization, "Bearer test-token");
    if (url.searchParams.has("fields"))
      return Response.json({
        sheets: properties.map((properties) => ({ properties })),
      });
    if (url.pathname.endsWith("values:batchGet"))
      return Response.json({
        valueRanges: url.searchParams.getAll("ranges").map((range) => {
          const d = decode(range);
          return {
            range,
            values: grids[d.name].slice(d.row, d.endRow).map((r, i) => {
              const v = [...r];
              if (
                d.name === "Expense Ledger" &&
                d.row + i > 0 &&
                url.searchParams.get("valueRenderOption") !== "FORMULA"
              ) {
                if (typeof v[0] === "number")
                  v[0] = new Date(Date.UTC(1899, 11, 30) + v[0] * 86400000)
                    .toISOString()
                    .slice(0, 10);
                v[3] = v[21] || "Expense";
              }
              return v.slice(d.col, d.endCol);
            }),
          };
        }),
      });
    if (url.pathname.endsWith(":append")) {
      const range = decodeURIComponent(
          url.pathname.split("/values/")[1].replace(/:append$/, ""),
        ),
        d = decode(range),
        body = JSON.parse(String(init?.body));
      let row = 1;
      grids[d.name].forEach((r, i) => {
        if (r.slice(d.col, d.endCol).some((v) => v !== "" && v !== undefined))
          row = i + 1;
      });
      grids[d.name][row] ||= [];
      body.values[0].forEach(
        (v: any, i: number) => (grids[d.name][row][d.col + i] = v),
      );
      if (failAppend) {
        failAppend = false;
        throw TypeError("Append response lost");
      }
      return Response.json({
        updates: { updatedRange: `'${d.name}'!A${row + 1}:H${row + 1}` },
      });
    }
    if (url.pathname.endsWith(":batchUpdate")) {
      batches++;
      const body = JSON.parse(String(init?.body));
      requests.push(...body.requests);
      for (const r of body.requests) {
        if (r.updateCells) {
          const v = r.updateCells;
          const name = properties.find(
            (p) => p.sheetId === v.range.sheetId,
          )!.title;
          const index = v.range.startRowIndex;
          grids[name][index] ||= [];
          v.rows[0].values.forEach(
            (cell: any, i: number) =>
              (grids[name][index][v.range.startColumnIndex + i] =
                cell.userEnteredValue.numberValue ??
                cell.userEnteredValue.stringValue ??
                cell.userEnteredValue.formulaValue),
          );
        } else if (r.appendCells) {
          const name = properties.find(
            (p) => p.sheetId === r.appendCells.sheetId,
          )!.title;
          for (const row of r.appendCells.rows)
            grids[name].push(
              row.values.map(
                (c: any) =>
                  c.userEnteredValue.numberValue ??
                  c.userEnteredValue.stringValue,
              ),
            );
        } else if (r.duplicateSheet) {
          const original = properties.find(
            (p) => p.sheetId === r.duplicateSheet.sourceSheetId,
          )!;
          properties.push({
            ...structuredClone(original),
            sheetId: r.duplicateSheet.newSheetId,
            title: r.duplicateSheet.newSheetName,
          });
          grids[r.duplicateSheet.newSheetName] = structuredClone(
            grids[original.title],
          );
        } else if (r.updateSheetProperties) {
          Object.assign(
            properties.find(
              (p) => p.sheetId === r.updateSheetProperties.properties.sheetId,
            )!,
            r.updateSheetProperties.properties,
          );
        } else if (r.appendDimension) {
          const p = properties.find(
            (p) => p.sheetId === r.appendDimension.sheetId,
          )!;
          p.gridProperties.columnCount += r.appendDimension.length;
        } else if (!r.copyPaste)
          throw Error("Unexpected request " + JSON.stringify(r));
      }
      if (failAfterCommit) {
        ((failAfterCommit = false), (failAppend = false));
        throw TypeError("Connection lost after persistence");
      }
      return Response.json({});
    }
    throw Error("Unexpected API " + url);
  };
  return {
    grids,
    fetcher,
    requests,
    properties,
    failAppend: () => {
      failAppend = true;
    },
    unprepared: () => {
      grids["Expense Ledger"][0] = headers.slice(0, 9);
      grids["Expense Ledger"][1] = grids["Expense Ledger"][1].slice(0, 9);
      grids["Expense Ledger"][1][3] =
        '=ARRAYFORMULA(IF(C2:C5000="","",IFNA(VLOOKUP(C2:C5000,\'Expense Tags\'!A2:B150,2,FALSE),"Expense")))';
      grids["Expense Tags"][0] = ["Available Tags", "Type (Auto lookup)"];
      grids["Expense Tags"][1] = ["Groceries", "Expense"];
      properties.find(
        (p) => p.title === "Expense Ledger",
      )!.gridProperties.columnCount = 10;
      properties.find(
        (p) => p.title === "Expense Tags",
      )!.gridProperties.columnCount = 3;
    },
    batches: () => batches,
    fail: () => {
      failAfterCommit = true;
    },
  };
}
