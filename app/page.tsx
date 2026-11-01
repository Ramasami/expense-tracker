"use client";
import Analytics from "./analytics";
import {
  readSnapshot,
  mutateLocal,
  backupText,
  importBackup,
  refreshPublicSnapshot,
  acceptGoogleSnapshot,
} from "../lib/local-store";
import { readPublicSheet, SHEET_URL } from "../lib/public-sheet";
import {
  configuredClientId,
  saveClientId,
  loadGoogleIdentity,
  signInGoogle,
  currentGoogleSession,
  disconnectGoogle,
  GoogleSession,
} from "../lib/google-auth";
import {
  ensureGoogleSchema,
  readGoogleSnapshot,
  saveGoogle,
} from "../lib/google-sheets";
import { report, budgetSpent } from "../lib/reports";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Wallet,
  LayoutDashboard,
  ArrowLeftRight,
  ChartNoAxesCombined,
  TrendingUp,
  Landmark,
  Tags,
  Target,
  History,
  FileText,
  Settings,
  Plus,
  Search,
  Sun,
  Moon,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  X,
  Menu,
  RefreshCw,
  Download,
  Leaf,
  ArrowRight,
  Check,
  CalendarDays,
  Repeat2,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  empty,
  totals,
  money,
  filterRows,
  dateRange,
  csv,
  balance,
  Snapshot,
  RecordData,
} from "../lib/finance";
const navigation = [
  ["Dashboard", LayoutDashboard],
  ["Transactions", ArrowLeftRight],
  ["Expense Analytics", ChartNoAxesCombined],
  ["Investments", TrendingUp],
  ["Income & Cash Flow", Wallet],
  ["Accounts & Ledgers", Landmark],
  ["Expense Tags", Tags],
  ["Budgets", Target],
  ["Financial Goals", Leaf],
  ["Recurring Transactions", Repeat2],
  ["Audit History", History],
  ["Reports", FileText],
  ["Settings", Settings],
] as const;
const colors = [
  "#ff385c",
  "#008a75",
  "#7161ef",
  "#2684d9",
  "#f59e0b",
  "#e99cab",
  "#73bdb1",
];
const periods = [
  "Today",
  "Yesterday",
  "This Week",
  "Last 7 Days",
  "This Month",
  "Last Month",
  "Last 30 Days",
  "Last 90 Days",
  "YTD",
  "This Financial Year",
  "Last 12 Months",
  "This Year",
  "All Time",
  "Custom Range",
];
const entities: Record<string, keyof Snapshot> = {
  "Accounts & Ledgers": "accounts",
  "Expense Tags": "tags",
  Budgets: "budgets",
  "Financial Goals": "goals",
  "Recurring Transactions": "recurring",
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<Snapshot>(empty),
    [page, setPage] = useState("Dashboard"),
    [person, setPerson] = useState("Combined"),
    [period, setPeriod] = useState("This Month"),
    [custom, setCustom] = useState<[string, string]>([today(), today()]),
    [search, setSearch] = useState(""),
    [theme, setTheme] = useState("light"),
    [status, setStatus] = useState("Loading"),
    [lastSync, setLastSync] = useState(""),
    [error, setError] = useState(""),
    [setup, setSetup] = useState(false),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<{
      entity: string;
      record: any;
      op: string;
    } | null>(null),
    [saving, setSaving] = useState(false),
    [conflict, setConflict] = useState<any>(null),
    [deleted, setDeleted] = useState(false),
    [tagFilter, setTagFilter] = useState(""),
    [typeFilter, setTypeFilter] = useState(""),
    [accountFilter, setAccountFilter] = useState(""),
    [min, setMin] = useState(""),
    [max, setMax] = useState(""),
    [sort, setSort] = useState("newest"),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<RecordData | null>(null),
    [actor, setActor] = useState("Ram"),
    [notice, setNotice] = useState("");
  const [googleSession, setGoogleSession] = useState<GoogleSession | null>(
      null,
    ),
    [clientId, setClientId] = useState(""),
    [authReady, setAuthReady] = useState(false),
    [connecting, setConnecting] = useState(false),
    [destination, setDestination] = useState<"google" | "browser">("google");
  const destinationRef = useRef<"google" | "browser">("google");
  function chooseDestination(value: "google" | "browser") {
    setDestination(value);
    destinationRef.current = value;
    localStorage.setItem("wealthtrack-save-destination", value);
  }
  async function connectGoogle() {
    setConnecting(true);
    setError("");
    try {
      if (clientId.trim()) saveClientId(clientId);
      if (!configuredClientId()) {
        navigate("Settings");
        throw Error(
          "Create a Google Web OAuth client and paste its client ID below to enable sheet saves.",
        );
      }
      const session = await signInGoogle();
      setGoogleSession(session);
      await ensureGoogleSchema();
      const snapshot = await readGoogleSnapshot();
      setData(await acceptGoogleSnapshot(snapshot.data));
      chooseDestination("google");
      setSheetStatus("Google Sheets connected");
      setStatus("Google connected");
      setNotice(
        "Signed in as " + session.email + ". Saves now update Google Sheets.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  }
  const [sheetStatus, setSheetStatus] = useState("Loading public sheet"),
    [sheetTime, setSheetTime] = useState("");
  const sheetBusy = useRef(false);
  async function refreshSheet() {
    if (sheetBusy.current) return;
    sheetBusy.current = true;
    try {
      if (currentGoogleSession()) {
        const snapshot = await readGoogleSnapshot();
        setData(await acceptGoogleSnapshot(snapshot.data));
        setSheetStatus("Google Sheets connected");
      } else {
        setGoogleSession(null);
        const source = await readPublicSheet(AbortSignal.timeout(20000));
        setData(await refreshPublicSnapshot(source));
        setSheetStatus("Public sheet connected");
      }
      setSheetTime(new Date().toLocaleTimeString("en-IN"));
      channel.current?.postMessage("changed");
    } catch (e: any) {
      setSheetStatus("Public sheet unavailable · using browser copy");
    } finally {
      sheetBusy.current = false;
    }
  }
  const loadedDefaults = useRef(false);
  const inflight = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  async function refresh() {
    if (inflight.current) return;
    inflight.current = true;
    setStatus("Syncing");
    try {
      const d = await readSnapshot();
      setData(d);
      if (!loadedDefaults.current) {
        loadedDefaults.current = true;
        const prefs = d.settings?.find(
          (s: any) => s.name === "Household preferences",
        );
        if (prefs) {
          if (prefs.person) setPerson(prefs.person);
          if (prefs.period) setPeriod(prefs.period);
        }
      }
      setStatus(
        destinationRef.current === "google"
          ? currentGoogleSession()
            ? "Google connected"
            : "Sign in to save"
          : "Saved locally",
      );
      setLastSync(new Date().toLocaleTimeString("en-IN"));
      setError("");
      setSetup(false);
    } catch (e: any) {
      setStatus("Storage error");
      setSetup(true);
      setError(e.message);
    } finally {
      inflight.current = false;
    }
  }
  useEffect(() => {
    setMounted(true);
    setClientId(configuredClientId());
    const savedDestination =
      localStorage.getItem("wealthtrack-save-destination") === "browser"
        ? "browser"
        : "google";
    setDestination(savedDestination);
    destinationRef.current = savedDestination;
    loadGoogleIdentity()
      .then(() => setAuthReady(true))
      .catch(() => setAuthReady(false));
    const t = localStorage.getItem("wealthtrack-theme") || "light";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    refresh();
    refreshSheet();
    const timer = setInterval(() => {
      if (!document.hidden) refreshSheet();
    }, 15000);
    const active = () => {
      if (!document.hidden) {
        refresh();
        refreshSheet();
      }
    };
    document.addEventListener("visibilitychange", active);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("wealthtrack");
      channel.current.onmessage = () => refresh();
    }
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", active);
      channel.current?.close();
    };
  }, []);
  useEffect(
    () => setOffset(0),
    [
      person,
      period,
      tagFilter,
      typeFilter,
      accountFilter,
      min,
      max,
      search,
      deleted,
    ],
  );
  const range = period === "Custom Range" ? custom : dateRange(period);
  const filtered = filterRows(data.transactions, person, ...range);
  const active = filtered.filter((r) => r.status !== "Deleted");
  const stats = totals(active);
  const duration = Math.max(
    1,
    (Date.parse(range[1]) - Date.parse(range[0])) / 86400000 + 1,
  );
  const previousEnd = new Date(Date.parse(range[0]) - 86400000)
    .toISOString()
    .slice(0, 10);
  const previousStart = new Date(Date.parse(range[0]) - duration * 86400000)
    .toISOString()
    .slice(0, 10);
  const available =
    data.accounts
      .filter(
        (a) =>
          a.status === "Active" &&
          (person === "Combined" ||
            a.person === person ||
            a.person === "Combined"),
      )
      .reduce((s, a) => s + Number(a.openingBalance || 0), 0) +
    totals(
      data.transactions.filter(
        (r) =>
          r.date <= range[1] && (person === "Combined" || r.person === person),
      ),
    ).net;
  const previous = totals(
    filterRows(data.transactions, person, previousStart, previousEnd),
  );
  const categories = Object.entries(
    active
      .filter((r) => r.type === "Expense")
      .reduce((a: any, r) => {
        a[r.tag] = (a[r.tag] || 0) + Number(r.amount);
        return a;
      }, {}),
  )
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value);
  const monthly = useMemo(() => {
    const m: Record<string, any> = {};
    active.forEach((r) => {
      const key = r.date.slice(0, 7);
      m[key] ||= { name: key, Income: 0, Expense: 0, Investment: 0 };
      if (r.type in m[key]) m[key][r.type] += Number(r.amount);
    });
    return Object.values(m)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({
        ...r,
        net: r.Income - r.Expense - r.Investment,
        saved: r.Income - r.Expense,
      }));
  }, [data, person, range[0], range[1]]);
  const transactions = filtered
    .filter(
      (r) =>
        (deleted ? r.status === "Deleted" : r.status !== "Deleted") &&
        (!search ||
          JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) &&
        (!tagFilter || r.tagId === tagFilter || r.tag === tagFilter) &&
        (!typeFilter || r.type === typeFilter) &&
        (!accountFilter || r.account === accountFilter) &&
        (!min || Number(r.amount) >= Number(min)) &&
        (!max || Number(r.amount) <= Number(max)),
    )
    .sort((a, b) =>
      sort === "amount"
        ? b.amount - a.amount
        : sort === "oldest"
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date),
    );
  function navigate(p: string) {
    setPage(p);
    setMobile(false);
    setOffset(0);
    setSelected([]);
  }
  function open(entity: string, record: any = {}) {
    setModal({
      entity,
      record: {
        status: "Active",
        date: today(),
        person: person === "Combined" ? "Ram" : person,
        type: entity === "accounts" ? "Bank" : "Expense",
        payment: "UPI",
        color: "#ff385c",
        ...record,
      },
      op: crypto.randomUUID(),
    });
    setError("");
  }
  async function mutate(
    entity: string,
    action: string,
    record: any,
    op = crypto.randomUUID(),
    targetId?: string,
  ) {
    setSaving(true);
    try {
      const cloud = destinationRef.current === "google";
      const operation = {
        entity,
        action,
        record,
        operationId: op,
        actor,
        targetId,
      };
      const d = cloud
        ? await saveGoogle(operation)
        : await mutateLocal(operation);
      if (d.conflict) {
        setConflict({ ...d, entity, action });
        setStatus("Conflict");
        return false;
      }
      if (cloud) {
        setData(
          await acceptGoogleSnapshot(
            d.data,
            d.record
              ? {
                  entity,
                  record: d.record,
                  previousId: record.id,
                }
              : undefined,
          ),
        );
        setStatus("Saved to Google Sheets");
      } else await refresh();
      channel.current?.postMessage("changed");
      setNotice(
        cloud
          ? "Saved to Google Sheets"
          : action === "runDue"
            ? "Due schedules saved in this browser"
            : "Saved in this browser",
      );
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    const record = { ...modal.record, ...values };
    for (const key of ["amount", "openingBalance", "funded", "contribution"])
      if (key in record) record[key] = Number(record[key]);
    if (
      modal.entity === "transactions" &&
      !record.id &&
      data.transactions.some(
        (r) =>
          r.status !== "Deleted" &&
          r.date === record.date &&
          r.description === record.description &&
          Number(r.amount) === record.amount,
      ) &&
      !confirm("A matching transaction already exists. Save another?")
    )
      return;
    if (
      await mutate(
        modal.entity,
        record.id ? "edit" : "create",
        record,
        modal.op,
      )
    )
      setModal(null);
  }
  async function action(entity: string, a: string, r: RecordData) {
    if (
      ["delete", "archive"].includes(a) &&
      !confirm(
        `${a === "delete" ? "Move to recently deleted" : "Archive"} ${r.description || r.name}?`,
      )
    )
      return;
    await mutate(entity, a, r);
  }
  async function exportData(
    format: string,
    rows: any[] = transactions,
    title = page,
  ) {
    if (!rows.length) {
      setNotice("No records match your filters");
      return;
    }
    if (format === "csv") {
      const a = document.createElement("a"),
        u = URL.createObjectURL(
          new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }),
        );
      a.href = u;
      a.download = `WealthTrack-${title}.csv`;
      a.click();
      URL.revokeObjectURL(u);
    } else if (format === "xlsx") {
      const { default: writeXlsxFile } =
        await import("write-excel-file/browser");
      const keys = [
        ...new Set(
          rows.flatMap((r) => Object.keys(r).filter((k) => !k.startsWith("_"))),
        ),
      ];
      await writeXlsxFile(
        [
          keys.map((k) => ({ value: k, fontWeight: "bold" as const })),
          ...rows.map((r) =>
            keys.map((k) => ({
              value:
                typeof r[k] === "number"
                  ? r[k]
                  : typeof r[k] === "object"
                    ? JSON.stringify(r[k])
                    : String(r[k] ?? ""),
            })),
          ),
        ],
        {},
      ).toFile(`WealthTrack-${title}.xlsx`);
    } else {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("WealthTrack | " + title, 14, 20);
      doc.setFontSize(10);
      doc.text(`${person} | ${range.join(" to ")}`, 14, 29);
      let y = 40;
      rows.forEach((r) => {
        const lines = doc.splitTextToSize(
          Object.entries(r)
            .filter(([k]) => !k.startsWith("_"))
            .map(
              ([k, v]) =>
                `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
            )
            .join(" | ")
            .replaceAll("₹", "INR "),
          180,
        );
        for (const line of lines) {
          if (y > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, 14, y);
          y += 5;
        }
        y += 5;
      });
      doc.save(`WealthTrack-${title}.pdf`);
    }
  }
  const card = (
    label: string,
    value: number,
    old: number,
    color: string,
    type?: string,
  ) => {
    const delta = old ? ((value - old) / Math.abs(old)) * 100 : null;
    return (
      <button
        className="stat card"
        onClick={() => {
          navigate("Transactions");
          setTypeFilter(type || "");
        }}
        key={label}
      >
        <span className="stat-label">
          {label}
          <ArrowUpRight size={17} />
        </span>
        <strong style={{ color }}>
          {label === "Savings rate" ? `${value.toFixed(1)}%` : money(value)}
        </strong>
        <span className="comparison">
          {delta === null ? (
            "No previous-period data"
          ) : (
            <>
              <span
                style={{ color: delta >= 0 ? "var(--teal)" : "var(--red)" }}
              >
                {delta >= 0 ? "↗" : "↘"} {Math.abs(delta).toFixed(1)}%
              </span>{" "}
              vs previous period
            </>
          )}
        </span>
        <svg className="spark" viewBox="0 0 160 30" aria-hidden="true">
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={
              monthly.length
                ? monthly
                    .map(
                      (m, i) =>
                        `${(i * 160) / Math.max(1, monthly.length - 1)},${28 - (24 * (type ? m[type] : m.net)) / Math.max(1, ...monthly.map((m) => Math.abs(type ? m[type] : m.net)))}`,
                    )
                    .join(" ")
                : "0,28 160,28"
            }
          />
        </svg>
      </button>
    );
  };
  const chart = (kind = "bar") => (
    <div className="chart">
      {monthly.length ? (
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={monthly}>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
              />
              <YAxis
                tickFormatter={(n) => `${n / 1000}k`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
              />
              <Tooltip
                formatter={(v) => money(Number(v))}
                contentStyle={{
                  borderRadius: 14,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                }}
              />
              {["Income", "Expense", "Investment"].map((k, i) => (
                <Bar
                  key={k}
                  dataKey={k}
                  fill={["#008a75", "#ff385c", "#7161ef"][i]}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={24}
                  onClick={(_, index) => {
                    navigate("Transactions");
                    setTypeFilter(k);
                    const month = monthly[index]?.name;
                    if (month) {
                      const [y, m] = month.split("-").map(Number);
                      setPeriod("Custom Range");
                      setCustom([
                        month + "-01",
                        new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
                      ]);
                    }
                  }}
                />
              ))}
            </BarChart>
          ) : (
            <AreaChart data={monthly}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(n) => `${n / 1000}k`} />
              <Tooltip formatter={(v) => money(Number(v))} />
              <Area
                dataKey={
                  kind === "savings"
                    ? "saved"
                    : kind === "investment"
                      ? "Investment"
                      : "net"
                }
                stroke="#008a75"
                fill="#008a7520"
                strokeWidth={3}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      ) : (
        <div className="empty">
          Your financial story starts with your first transaction.
        </div>
      )}
    </div>
  );
  const transactionTable = (limit?: number) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {!limit && (
              <th>
                <input
                  aria-label="Select all visible transactions"
                  type="checkbox"
                  checked={!!selected.length}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? transactions
                            .slice(offset, offset + 20)
                            .map((r) => r.id)
                        : [],
                    )
                  }
                />
              </th>
            )}
            <th>Transaction</th>
            <th>Category</th>
            <th>Person</th>
            <th>Date</th>
            <th className="right">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {transactions
            .slice(limit ? 0 : offset, limit || offset + 20)
            .map((r) => (
              <tr key={r.id}>
                <>
                  {!limit && (
                    <td>
                      <input
                        aria-label={`Select ${r.description}`}
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, r.id]
                              : selected.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                  )}
                  <td>
                    <button className="merchant" onClick={() => setDetail(r)}>
                      <span
                        className="merchant-icon"
                        style={{
                          background:
                            r.type === "Income" ? "#008a7512" : "#ff385c0d",
                          color: r.type === "Income" ? "#008a75" : "#ff385c",
                        }}
                      >
                        {r.type === "Income" ? (
                          <ArrowDownRight size={19} />
                        ) : (
                          <ArrowUpRight size={19} />
                        )}
                      </span>
                      <span>
                        <b>{r.description}</b>
                        <small>
                          {r.localEdited
                            ? r.sourceChanged
                              ? "Local edit · sheet also changed"
                              : "Local edit · browser only"
                            : r.source === "google-sheet"
                              ? "From public Google Sheet"
                              : r.payment || "Saved in this browser"}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="chip">{r.tag}</span>
                  </td>
                  <td>{r.person || "Unassigned"}</td>
                  <td>{r.date}</td>
                  <td
                    className="right amount"
                    style={{
                      color: r.type === "Income" ? "var(--teal)" : "inherit",
                    }}
                  >
                    {r.type === "Income" ? "+" : "−"}
                    {money(Number(r.amount))}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        aria-label="Edit transaction"
                        onClick={() => open("transactions", r)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        aria-label={
                          deleted ? "Restore transaction" : "Delete transaction"
                        }
                        disabled={saving}
                        onClick={() =>
                          action(
                            "transactions",
                            deleted ? "restore" : "delete",
                            r,
                          )
                        }
                      >
                        {deleted ? (
                          <RotateCcw size={14} />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </td>
                </>
              </tr>
            ))}
        </tbody>
      </table>
      {!transactions.length && (
        <div className="empty">No transactions match this view.</div>
      )}
    </div>
  );
  const entityPage = () => {
    const key = entities[page];
    if (!key) return null;
    const records = (data[key] as RecordData[]).filter(
      (r) =>
        (person === "Combined" ||
          !r.person ||
          r.person === "Combined" ||
          r.person === person) &&
        (!search ||
          JSON.stringify(r).toLowerCase().includes(search.toLowerCase())),
    );
    return (
      <>
        <div className="section-heading">
          <div>
            <h2>{page}</h2>
            <p>Make room for what matters to you.</p>
          </div>
          <button
            className="primary"
            disabled={setup}
            onClick={() => open(key)}
          >
            <Plus size={17} />
            Add{" "}
            {key === "tags"
              ? "tag"
              : key === "accounts"
                ? "account"
                : key === "budgets"
                  ? "budget"
                  : key === "goals"
                    ? "goal"
                    : "schedule"}
          </button>
        </div>
        <div className="entity-grid">
          {records.map((r) => {
            const spent = budgetSpent(r, filtered);
            const usage = active.filter((t) => t.tagId === r.id);
            return (
              <article className="card entity-card" key={r.id}>
                <div className="entity-top">
                  <span
                    className="entity-icon"
                    style={{ color: r.color || "var(--coral)" }}
                  >
                    {key === "tags" ? (
                      r.icon || "#"
                    ) : key === "accounts" ? (
                      <Landmark />
                    ) : (
                      <Target />
                    )}
                  </span>
                  <span className="chip">{r.status}</span>
                </div>
                <h3>{r.name}</h3>
                <p>{r.description || r.person || r.type || "Household"}</p>
                {key === "accounts" ? (
                  <>
                    <strong className="entity-amount">
                      {money(balance(r, data.transactions))}
                    </strong>
                    <small>
                      Current balance · opening{" "}
                      {money(Number(r.openingBalance))}
                    </small>
                    <button
                      className="text-button"
                      onClick={() => {
                        navigate("Transactions");
                        setAccountFilter(r.id);
                      }}
                    >
                      View account statement <ArrowRight size={14} />
                    </button>
                  </>
                ) : key === "tags" ? (
                  <>
                    <strong>
                      {money(usage.reduce((s, t) => s + Number(t.amount), 0))}
                    </strong>
                    <small>
                      {usage.length} transactions · {r.type}
                    </small>
                  </>
                ) : key === "recurring" ? (
                  <>
                    <strong>
                      {money(Number(r.amount))} / {r.frequency || "Monthly"}
                    </strong>
                    <small>
                      Next due {r.nextDate || "not set"} ·{" "}
                      {r.scheduleStatus || "Active"}
                    </small>
                  </>
                ) : (
                  <>
                    <strong className="entity-amount">
                      {money(key === "goals" ? Number(r.funded || 0) : spent)}{" "}
                      <small>of {money(Number(r.amount))}</small>
                    </strong>
                    <progress
                      max={Number(r.amount) || 1}
                      value={key === "goals" ? Number(r.funded || 0) : spent}
                    />
                    <small>
                      {key === "goals"
                        ? `${money(Math.max(0, r.amount - (r.funded || 0)))} remaining · target ${r.targetDate || "not set"}`
                        : spent > r.amount
                          ? "Over budget"
                          : `${money(r.amount - spent)} left to spend`}
                    </small>
                  </>
                )}
                {key === "goals" && Number(r.contribution) > 0 && (
                  <small>
                    At {money(Number(r.contribution))}/month: approximately{" "}
                    {Math.ceil(
                      Math.max(0, Number(r.amount) - Number(r.funded || 0)) /
                        Number(r.contribution),
                    )}{" "}
                    months to fund.
                  </small>
                )}
                <div className="entity-actions">
                  {r.source !== "google-sheet" && (
                    <button
                      disabled={!googleSession || saving}
                      onClick={() => {
                        chooseDestination("google");
                        mutate(key, "create", r);
                      }}
                    >
                      Save to Google Sheet
                    </button>
                  )}
                  <button onClick={() => open(key, r)}>
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    disabled={saving}
                    onClick={() =>
                      action(
                        key,
                        r.status === "Active" ? "archive" : "restore",
                        r,
                      )
                    }
                  >
                    {r.status === "Active" ? "Archive" : "Restore"}
                  </button>
                  {key === "tags" && (
                    <button
                      onClick={() => {
                        const target = prompt(
                          "Enter the exact name of the tag to merge into",
                        );
                        const t = data.tags.find((t) => t.name === target);
                        if (
                          t &&
                          confirm(
                            `Reassign all ${r.name} transactions to ${t.name}?`,
                          )
                        )
                          mutate("tags", "merge", r, crypto.randomUUID(), t.id);
                      }}
                    >
                      Merge
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!records.length && (
          <div className="card empty">
            Nothing here yet. Add your first{" "}
            {page.toLowerCase().replace("financial ", "")} above.
          </div>
        )}
      </>
    );
  };
  if (!mounted)
    return (
      <div className="empty" role="status">
        Loading your financial space…
      </div>
    );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar mobile-open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Dashboard");
          }}
        >
          <span className="logo">
            <TrendingUp size={23} />
          </span>
          wealthtrack<span className="brand-dot">.</span>
        </a>
        <div className="household">
          <div className="avatars">
            <span>R</span>
            <span>V</span>
          </div>
          <div>
            <b>Ram & Varsha</b>
            <small>Your shared financial space</small>
          </div>
        </div>
        <div className="nav-label">YOUR MONEY, AT A GLANCE</div>
        <nav>
          {navigation.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? "nav active" : "nav"}
              onClick={() => navigate(name)}
            >
              <Icon size={19} />
              {name}
              {name === "Transactions" && (
                <span className="nav-count">
                  {
                    data.transactions.filter((r) => r.status !== "Deleted")
                      .length
                  }
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-logo">
            <Leaf size={20} />
          </div>
          <b>Small steps. Big possibilities.</b>
          <p>
            A little clarity today.
            <br />A brighter tomorrow, together.
          </p>
          <span>MADE FOR YOUR LIFE</span>
        </div>
      </aside>
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main">
        <header>
          <div className="header-start">
            <button
              className="icon-button menu"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Your space <ChevronRight size={14} />
              <b>{page}</b>
            </span>
          </div>
          <div className="header-actions">
            <label className="search">
              <Search size={16} />
              <input
                placeholder="Search your finances"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
                aria-label="Search finances"
              />
            </label>
            <button
              className="icon-button"
              aria-label="Toggle dark mode"
              onClick={() => {
                const t = theme === "light" ? "dark" : "light";
                setTheme(t);
                document.documentElement.dataset.theme = t;
                localStorage.setItem("wealthtrack-theme", t);
              }}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <select
              aria-label="Unverified audit name"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            >
              <option>Ram</option>
              <option>Varsha</option>
              <option>Visitor</option>
            </select>
            <button
              className="google-connect"
              disabled={connecting || !authReady}
              onClick={connectGoogle}
            >
              {connecting
                ? "Connecting…"
                : googleSession
                  ? "Google connected"
                  : "Sign in with Google"}
            </button>
            <span className="profile">{actor[0]}</span>
          </div>
        </header>
        <main>
          <div className="greeting">
            <div>
              <div className="eyebrow">
                A LITTLE CLARITY. A BRIGHTER FUTURE.
              </div>
              <h1>
                {page === "Dashboard" ? "Welcome home, Ram & Varsha" : page}
                <span className="coral">
                  {page === "Dashboard" ? " ☀" : ""}
                </span>
              </h1>
              <p>
                {page === "Dashboard"
                  ? "Here’s how your money is moving. Let’s make it count."
                  : "Your finances, thoughtfully together."}
              </p>
            </div>
            <button
              className="primary"
              disabled={setup || saving}
              onClick={() => open("transactions")}
            >
              <Plus size={18} />
              Add transaction
            </button>
          </div>
          <div className="filter-bar">
            <div className="segmented">
              {["Ram", "Varsha", "Combined"].map((p) => (
                <button
                  className={p === person ? "selected" : ""}
                  key={p}
                  onClick={() => {
                    setPerson(p);
                    setOffset(0);
                  }}
                >
                  {p === "Combined" && <span className="tiny-avatars">RV</span>}
                  {p}
                </button>
              ))}
            </div>
            <div className="filter-right">
              <span className={"sync " + status.toLowerCase()}>
                <i />
                {status}
                {lastSync && <span className="sync-time"> · {lastSync}</span>}
              </span>
              <button
                className="icon-button"
                aria-label="Refresh data"
                onClick={() => {
                  refresh();
                  refreshSheet();
                }}
              >
                <RefreshCw size={15} />
              </button>
              <label className="date-select">
                <CalendarDays size={16} />
                <select
                  aria-label="Date range"
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    setOffset(0);
                  }}
                >
                  {periods.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {period === "Custom Range" && (
            <div className="custom">
              <input
                aria-label="Start date"
                type="date"
                value={custom[0]}
                onChange={(e) => setCustom([e.target.value, custom[1]])}
              />
              <span>to</span>
              <input
                aria-label="End date"
                type="date"
                value={custom[1]}
                min={custom[0]}
                onChange={(e) => setCustom([custom[0], e.target.value])}
              />
            </div>
          )}
          <p className="source-status" role="status">
            {sheetStatus}
            {sheetTime ? " · " + sheetTime : ""}.{" "}
            {destination === "google"
              ? "Save destination: Google Sheets" +
                (googleSession ? "" : " · sign in to save")
              : "Save destination: this browser only"}
            .
          </p>
          {error && (
            <div className="alert" role="alert">
              {error}
              {setup && (
                <p>
                  Enable browser storage for this site to save your records.
                </p>
              )}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {page === "Dashboard" && (
            <>
              <div className="overview-heading">
                <h2>Your money at a glance</h2>
                <span>
                  {range[0]} — {range[1]}
                </span>
              </div>
              <div className="stats-grid">
                {card(
                  "Total income",
                  stats.income,
                  previous.income,
                  "var(--teal)",
                  "Income",
                )}
                {card(
                  "Total expenses",
                  stats.expense,
                  previous.expense,
                  "var(--red)",
                  "Expense",
                )}
                {card(
                  "Investments",
                  stats.investment,
                  previous.investment,
                  "var(--purple)",
                  "Investment",
                )}
                {card("Net cash flow", stats.net, previous.net, "var(--text)")}
              </div>
              <div className="dashboard-grid">
                <section className="card cash-chart">
                  <div className="card-heading">
                    <div>
                      <h2>The bigger picture</h2>
                      <p>Your income, spending & investing</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="View cash flow"
                      onClick={() => navigate("Income & Cash Flow")}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  </div>
                  <div className="legend">
                    <span>
                      <i style={{ background: "#008a75" }} />
                      Income
                    </span>
                    <span>
                      <i style={{ background: "#ff385c" }} />
                      Expenses
                    </span>
                    <span>
                      <i style={{ background: "#7161ef" }} />
                      Investments
                    </span>
                  </div>
                  {chart()}
                </section>
                <section className="card category-chart">
                  <div className="card-heading">
                    <div>
                      <h2>Where it all goes</h2>
                      <p>Every category tells a story</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="View expense analytics"
                      onClick={() => navigate("Expense Analytics")}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  </div>
                  <div className="donut">
                    {categories.length ? (
                      <>
                        <ResponsiveContainer width="100%" height={190}>
                          <PieChart>
                            <Pie
                              data={categories}
                              dataKey="value"
                              innerRadius={64}
                              outerRadius={84}
                              paddingAngle={3}
                              onClick={(r) => {
                                navigate("Transactions");
                                setTagFilter(String(r.name || ""));
                              }}
                            >
                              {categories.map((c, i) => (
                                <Cell
                                  key={c.name}
                                  fill={colors[i % colors.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v) => money(Number(v))} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="donut-center">
                          <small>Total spent</small>
                          <b>{money(stats.expense)}</b>
                        </div>
                      </>
                    ) : (
                      <div className="donut-empty">
                        <small>No expenses yet</small>
                        <b>{money(0)}</b>
                      </div>
                    )}
                  </div>
                  <div className="category-legend">
                    {categories.slice(0, 4).map((c, i) => (
                      <button
                        key={c.name}
                        onClick={() => {
                          navigate("Transactions");
                          setTagFilter(c.name);
                        }}
                      >
                        <span>
                          <i style={{ background: colors[i] }} />
                          {c.name}
                        </span>
                        <b>
                          {((100 * c.value) / (stats.expense || 1)).toFixed(0)}%
                        </b>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <div className="secondary-grid">
                <section className="together-card">
                  <div>
                    <span className="eyebrow">
                      BUILDING SOMETHING GOOD, TOGETHER
                    </span>
                    <h2>Your future is taking shape.</h2>
                    <p>
                      You’ve set aside <b>{money(stats.investment)}</b> in
                      investments this period.
                      <br />
                      Every contribution is a step toward your next chapter.
                    </p>
                    <button onClick={() => navigate("Financial Goals")}>
                      Explore your goals <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="plant">
                    <Leaf size={77} strokeWidth={1} />
                    <span>↗</span>
                  </div>
                </section>
                <section className="card savings-card">
                  <div className="card-heading">
                    <h2>A little breathing room</h2>
                    <Leaf size={19} />
                  </div>
                  <strong>
                    {stats.savings.toFixed(1)}
                    <small>%</small>
                  </strong>
                  <p>of your income saved before investing</p>
                  <div className="savings-track">
                    <span
                      style={{
                        width: `${Math.min(100, Math.max(0, stats.savings))}%`,
                      }}
                    />
                  </div>
                  <small>
                    {money(stats.income - stats.expense)} saved this period
                  </small>
                </section>
              </div>
              <section className="card recent">
                <div className="card-heading">
                  <div>
                    <h2>Life, lately</h2>
                    <p>Your latest transactions</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("Transactions")}
                  >
                    View all <ArrowRight size={15} />
                  </button>
                </div>
                {transactionTable(5)}
              </section>
              <div className="available-cash card">
                <div>
                  <span className="stat-label">
                    Available cash through {range[1]}
                  </span>
                  <strong>{money(available)}</strong>
                  <small>
                    Known opening balances + income − expenses − investment
                    contributions. Unassigned records are included in the
                    combined view.
                  </small>
                </div>
                <Wallet size={25} />
              </div>
              <div className="balance-grid">
                {["Ram", "Varsha", "Combined"].map((p) => (
                  <div className="card" key={p}>
                    <span className="stat-label">
                      {p === "Combined" ? "Household" : p} cash movement
                    </span>
                    <strong>
                      {money(
                        totals(filterRows(data.transactions, p, ...range)).net,
                      )}
                    </strong>
                    <small>
                      Income − expenses − contributions in this period
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}
          {page === "Transactions" && (
            <section className="card">
              <div className="card-heading">
                <h2>
                  {deleted ? "Recently deleted" : "All transactions"}{" "}
                  <small>({transactions.length})</small>
                </h2>
                <div className="row-actions">
                  <button
                    onClick={() => {
                      setDeleted(!deleted);
                      setOffset(0);
                    }}
                  >
                    {deleted ? "Active transactions" : "Recently deleted"}
                  </button>
                  <button onClick={() => exportData("csv")}>
                    <Download size={15} />
                    Export
                  </button>
                </div>
              </div>
              <div className="transaction-filters">
                <select
                  aria-label="Tag filter"
                  value={tagFilter}
                  onChange={(e) => {
                    setTagFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">All categories</option>
                  {data.tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Type filter"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">All types</option>
                  {["Income", "Expense", "Investment", "Transfer"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select
                  aria-label="Account filter"
                  value={accountFilter}
                  onChange={(e) => {
                    setAccountFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">All accounts</option>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Minimum amount"
                  type="number"
                  placeholder="Min ₹"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                />
                <input
                  aria-label="Maximum amount"
                  type="number"
                  placeholder="Max ₹"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                />
                <select
                  aria-label="Sort transactions"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="amount">Highest amount</option>
                </select>
                <button
                  onClick={() => {
                    setTagFilter("");
                    setAccountFilter("");
                    setTypeFilter("");
                    setSearch("");
                    setMin("");
                    setMax("");
                  }}
                >
                  Reset
                </button>
              </div>
              {selected.length > 0 && (
                <div className="bulk">
                  {selected.length} selected
                  <button
                    disabled={saving}
                    onClick={async () => {
                      if (!confirm("Apply to selected records?")) return;
                      for (const id of selected) {
                        const r = data.transactions.find((r) => r.id === id)!;
                        if (
                          !(await mutate(
                            "transactions",
                            deleted ? "restore" : "delete",
                            r,
                          ))
                        )
                          break;
                      }
                      setSelected([]);
                    }}
                  >
                    {deleted ? "Restore" : "Delete"} selected
                  </button>
                  <button
                    disabled={saving}
                    onClick={async () => {
                      const name = prompt("Exact tag name to apply");
                      const tag = data.tags.find((t) => t.name === name);
                      if (!tag) return;
                      for (const id of selected) {
                        if (
                          !(await mutate("transactions", "edit", {
                            ...data.transactions.find((r) => r.id === id),
                            tagId: tag.id,
                          }))
                        )
                          break;
                      }
                      setSelected([]);
                    }}
                  >
                    Change tag
                  </button>
                </div>
              )}
              {transactionTable()}
              <div className="pagination">
                <span>{transactions.length} records</span>
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  Previous
                </button>
                <span>{Math.floor(offset / 20) + 1}</span>
                <button
                  disabled={offset + 20 >= transactions.length}
                  onClick={() => setOffset(offset + 20)}
                >
                  Next
                </button>
              </div>
            </section>
          )}
          {entities[page] && entityPage()}
          {["Expense Analytics", "Investments", "Income & Cash Flow"].includes(
            page,
          ) && (
            <>
              <div className="stats-grid">
                {card(
                  "Total income",
                  stats.income,
                  previous.income,
                  "var(--teal)",
                  "Income",
                )}
                {card(
                  "Total expenses",
                  stats.expense,
                  previous.expense,
                  "var(--red)",
                  "Expense",
                )}
                {card(
                  "Contributions",
                  stats.investment,
                  previous.investment,
                  "var(--purple)",
                  "Investment",
                )}
                {card(
                  "Savings rate",
                  stats.savings,
                  previous.savings,
                  "var(--blue)",
                )}
              </div>
              <div className="dashboard-grid">
                <section className="card">
                  <div className="card-heading">
                    <h2>
                      {page === "Investments"
                        ? "Contribution trend"
                        : page === "Expense Analytics"
                          ? "Monthly spending"
                          : "Net cash movement"}
                    </h2>
                  </div>
                  {chart(
                    page === "Investments"
                      ? "investment"
                      : page === "Income & Cash Flow"
                        ? "net"
                        : "bar",
                  )}
                </section>
                <section className="card">
                  <div className="card-heading">
                    <h2>
                      {page === "Investments"
                        ? "Investment allocation"
                        : "Category breakdown"}
                    </h2>
                  </div>
                  <div className="breakdown">
                    {(page === "Investments"
                      ? Object.entries(
                          active
                            .filter((r) => r.type === "Investment")
                            .reduce(
                              (a: any, r) => ({
                                ...a,
                                [r.tag]: (a[r.tag] || 0) + Number(r.amount),
                              }),
                              {},
                            ),
                        ).map(([name, value]) => ({
                          name,
                          value: Number(value),
                        }))
                      : categories
                    ).map((c, i) => (
                      <button
                        key={c.name}
                        onClick={() => {
                          navigate("Transactions");
                          setTagFilter(c.name);
                        }}
                      >
                        <span>
                          <i
                            style={{ background: colors[i % colors.length] }}
                          />
                          {c.name}
                        </span>
                        <b>{money(c.value)}</b>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <div className="secondary-grid">
                <section className="card">
                  <div className="card-heading">
                    <h2>Savings trend</h2>
                  </div>
                  {chart("savings")}
                </section>
                <section className="card insight">
                  <span className="eyebrow">FROM YOUR REAL RECORDS</span>
                  <h2>A few things to keep in mind</h2>
                  <p>
                    {categories.length
                      ? `${categories[0].name} is your largest expense category at ${money(categories[0].value)} (${((categories[0].value / (stats.expense || 1)) * 100).toFixed(1)}% of spending).`
                      : "No spending in this period."}
                  </p>
                  <p>
                    Average daily spending: {money(stats.expense / duration)}{" "}
                    across {duration.toFixed(0)} days.
                  </p>
                  <p>
                    Investment-to-income ratio:{" "}
                    {stats.income
                      ? ((stats.investment / stats.income) * 100).toFixed(1)
                      : "0"}
                    %.
                  </p>
                  <p>
                    Contributions track money invested, not portfolio market
                    value.
                  </p>
                </section>
              </div>
            </>
          )}
          {page === "Expense Analytics" && (
            <Analytics
              rows={active}
              tags={data.tags}
              history={data.transactions.filter(
                (r) => person === "Combined" || r.person === person,
              )}
              range={range}
              onDrill={(tag, date) => {
                navigate("Transactions");
                setTagFilter(tag);
                if (date) {
                  setPeriod("Custom Range");
                  setCustom([date, date]);
                }
              }}
            />
          )}
          {page === "Recurring Transactions" && (
            <div className="recurring-run">
              <button
                className="primary"
                disabled={saving || setup}
                onClick={() => mutate("recurring", "runDue", {})}
              >
                Run due schedules
              </button>
              <p>
                Creates due transactions in this browser. Nothing runs when the
                website is closed.
              </p>
            </div>
          )}
          {page === "Audit History" && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>The full story</h2>
                  <p>
                    Append-only changes · times in IST · names are unverified
                  </p>
                </div>
                <button onClick={() => exportData("csv", data.audit, "Audit")}>
                  <Download size={15} />
                  Export
                </button>
              </div>
              <div className="timeline">
                {data.audit
                  .filter(
                    (r) =>
                      (!search ||
                        JSON.stringify(r)
                          .toLowerCase()
                          .includes(search.toLowerCase())) &&
                      String(r.timestamp).slice(0, 10) >= range[0] &&
                      String(r.timestamp).slice(0, 10) <= range[1] &&
                      (person === "Combined" ||
                        String(r.actor).startsWith(person)),
                  )
                  .map((r) => (
                    <details key={r.id}>
                      <summary>
                        <span className="timeline-dot">
                          <History size={16} />
                        </span>
                        <span>
                          <b>
                            {r.description} · {r.action}
                          </b>
                          <small>
                            {r.actor} · {r.timestamp} IST
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </summary>
                      <div className="audit-diff">
                        <p>Changed: {r.fields}</p>
                        <div>
                          <section>
                            <b>Before</b>
                            <pre>
                              {JSON.stringify(safeParse(r.old), null, 2)}
                            </pre>
                          </section>
                          <section>
                            <b>After</b>
                            <pre>
                              {JSON.stringify(safeParse(r.updated), null, 2)}
                            </pre>
                          </section>
                        </div>
                      </div>
                    </details>
                  ))}
                {!data.audit.length && (
                  <div className="empty">
                    Changes saved in this browser will appear here.
                  </div>
                )}
              </div>
            </section>
          )}
          {page === "Reports" && (
            <div className="entity-grid">
              {[
                "Weekly Expense Report",
                "Monthly Financial Summary",
                "YTD Financial Summary",
                "Annual Financial Report",
                "Category Expense Report",
                "Tag Report",
                "Merchant Report",
                "Investment Contribution Report",
                "Ram vs Varsha Report",
                "Account Statement",
                "Audit History Report",
              ].map((title) => (
                <section className="card report-card" key={title}>
                  <FileText size={28} />
                  <h3>{title}</h3>
                  <p>Uses the selected person, dates, and matching records.</p>
                  <div className="row-actions">
                    {["csv", "xlsx", "pdf"].map((f) => (
                      <button
                        key={f}
                        onClick={() =>
                          exportData(
                            f,
                            report(
                              title,
                              active,
                              data.audit.filter(
                                (a) =>
                                  String(a.timestamp).slice(0, 10) >=
                                    range[0] &&
                                  String(a.timestamp).slice(0, 10) <=
                                    range[1] &&
                                  (person === "Combined" ||
                                    String(a.actor).startsWith(person)),
                              ),
                            ),
                            title,
                          )
                        }
                      >
                        {f.toUpperCase()} <Download size={13} />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {page === "Settings" && (
            <section className="card settings">
              <h2>Your space, your way</h2>
              <p>
                Read the public sheet without signing in, or sign in with Google
                to save changes to the shared workbook. Browser-only records
                remain private to this browser.
              </p>
              <label>
                Appearance
                <select
                  value={theme}
                  onChange={(e) => {
                    setTheme(e.target.value);
                    document.documentElement.dataset.theme = e.target.value;
                    localStorage.setItem("wealthtrack-theme", e.target.value);
                  }}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                Default person
                <select
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                >
                  {["Ram", "Varsha", "Combined"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Reporting period
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  {periods.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <p>
                Currency: INR · Indian number formatting
                <br />
                Storage: this browser · updates shared with tabs on this site
                <br />
                Audit actor: {actor} (unverified)
              </p>
              <button
                className="primary"
                disabled={setup}
                onClick={() =>
                  mutate("settings", data.settings[0] ? "edit" : "create", {
                    ...data.settings[0],
                    name: "Household preferences",
                    theme,
                    person,
                    period,
                  })
                }
              >
                Save household preferences
              </button>
              <hr />
              <h3>Google Sheets saves</h3>
              <p>
                {googleSession
                  ? "Signed in as " + googleSession.email
                  : "Sign in with an account that can edit this workbook to save changes to Google Sheets."}
              </p>
              <label>
                Save destination
                <select
                  aria-label="Save destination"
                  value={destination}
                  onChange={(e) =>
                    chooseDestination(e.target.value as "google" | "browser")
                  }
                >
                  <option value="google">Google Sheets</option>
                  <option value="browser">This browser only</option>
                </select>
              </label>
              <label>
                Google Web OAuth client ID
                <input
                  aria-label="Google Web OAuth client ID"
                  value={clientId}
                  placeholder="…apps.googleusercontent.com"
                  onChange={(e) => setClientId(e.target.value)}
                />
              </label>
              <div className="row-actions">
                <button
                  onClick={() => {
                    try {
                      saveClientId(clientId);
                      setNotice("Google client ID saved for this browser.");
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  Save client ID
                </button>
                <button
                  className="primary"
                  disabled={connecting || !authReady}
                  onClick={connectGoogle}
                >
                  {connecting ? "Connecting…" : "Sign in with Google"}
                </button>
                {googleSession && (
                  <button
                    onClick={() => {
                      disconnectGoogle();
                      setGoogleSession(null);
                      setStatus("Sign in to save");
                      setNotice(
                        "Disconnected. Sign in again before saving to Google Sheets.",
                      );
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
              <details className="google-setup">
                <summary>Set up Google sign-in once</summary>
                <ol>
                  <li>
                    Create or select a project in{" "}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google Cloud Console
                    </a>
                    .
                  </li>
                  <li>
                    Enable the Google Sheets API and configure Google Auth
                    Platform. For an app in Testing, add Ram and Varsha as test
                    users.
                  </li>
                  <li>
                    Create an OAuth client of type Web application. Add{" "}
                    <code>http://127.0.0.1:3000</code> and{" "}
                    <code>http://localhost:3000</code> as authorized JavaScript
                    origins. Add your GitHub Pages HTTPS origin when you
                    publish.
                  </li>
                  <li>
                    Paste the client ID above. Do not paste a client secret.
                  </li>
                </ol>
              </details>
              <p>
                First connection creates recovery copies of the ledger, tags and
                summaries within this workbook, adds stable IDs, and prepares
                supporting tabs. Browser access tokens are kept only in memory.
                Version checks reduce conflicts, but browser-only writes cannot
                guarantee a lock across devices or manual sheet edits.
              </p>
              <hr />
              <h3>Public Google Sheet</h3>
              <p>
                {sheetStatus}
                {sheetTime ? " · last read " + sheetTime : ""}. Refreshes every
                15 seconds while open. Local edits are preserved.
              </p>
              <div className="row-actions">
                <button onClick={refreshSheet}>
                  <RefreshCw size={15} />
                  Refresh public sheet
                </button>
                <a href={SHEET_URL} target="_blank" rel="noreferrer">
                  Open Google Sheet ↗
                </a>
              </div>
              <p>
                Browser-only changes stay on this device. Signed-in sheet saves
                are shared through the workbook. If the source sheet has no
                stable transaction IDs, rows are matched by position; avoid
                reordering rows while keeping local edits.
              </p>
              <hr />
              <h3>Your data & backups</h3>
              <p>
                Signed-in saves update the workbook. Browser-only records remain
                on this device until you explicitly publish them. Clearing site
                data removes these records. Download a JSON backup regularly.
              </p>
              <div className="row-actions">
                <button
                  onClick={async () => {
                    try {
                      const current = await readSnapshot();
                      const url = URL.createObjectURL(
                        new Blob([backupText(current)], {
                          type: "application/json",
                        }),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "WealthTrack-backup-" + today() + ".json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  <Download size={15} />
                  Download JSON backup
                </button>
                <label className="import-button">
                  Restore JSON backup
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        if (file.size > 20000000)
                          throw Error("Backup must be under 20 MB.");
                        if (
                          !confirm(
                            "Replace this browser’s records with the selected backup? Download a backup first if you want to keep them.",
                          )
                        )
                          return;
                        await importBackup(await file.text());
                        await refresh();
                        channel.current?.postMessage("changed");
                        setNotice("Backup restored in this browser");
                      } catch (error: any) {
                        setError(error.message);
                      } finally {
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
              </div>
            </section>
          )}
          <footer>
            <span className="brand-small">wealthtrack.</span>
            <span>A little more clarity. A lot more possibility.</span>
            <span>Ram & Varsha’s shared space</span>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
          >
            <div className="card-heading">
              <div>
                <span className="eyebrow">MAKE EVERY LITTLE MOMENT COUNT</span>
                <h2 id="form-title">
                  {modal.record.id ? "Edit" : "Add"}{" "}
                  {modal.entity === "transactions"
                    ? "transaction"
                    : modal.entity
                        .replace("recurring", "recurring schedule")
                        .replace(/s$/, "")}
                </h2>
              </div>
              <button
                aria-label="Close form"
                disabled={saving}
                onClick={() => setModal(null)}
              >
                <X />
              </button>
            </div>
            <form onSubmit={save}>
              <div className="form-grid">
                {modal.entity === "transactions" ? (
                  <>
                    <Field
                      label="Amount (₹)"
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={modal.record.amount}
                      required
                    />
                    <Field
                      label="Date"
                      name="date"
                      type="date"
                      value={modal.record.date}
                      required
                    />
                    <Field
                      label="Description / merchant"
                      name="description"
                      value={modal.record.description}
                      required
                      list="merchants"
                    />
                    <datalist id="merchants">
                      {Array.from(
                        new Set(data.transactions.map((r) => r.description)),
                      ).map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </datalist>
                    <Select
                      label="Type"
                      name="type"
                      value={modal.record.type}
                      options={["Expense", "Income", "Investment", "Transfer"]}
                    />
                    <Select
                      label="Expense tag"
                      name="tagId"
                      value={modal.record.tagId}
                      options={data.tags
                        .filter(
                          (t) =>
                            t.status === "Active" ||
                            t.id === modal.record.tagId,
                        )
                        .map((t) => ({ value: t.id, label: t.name }))}
                      required
                    />
                    <Select
                      label="Person"
                      name="person"
                      value={modal.record.person}
                      options={["Ram", "Varsha", "Combined"]}
                    />
                    <Select
                      label="Payment method"
                      name="payment"
                      value={modal.record.payment}
                      options={[
                        "UPI",
                        "Cash",
                        "Debit Card",
                        "Credit Card",
                        "Bank Transfer",
                        "Other",
                      ]}
                    />
                    <Select
                      label="From account (optional)"
                      name="account"
                      value={modal.record.account}
                      options={data.accounts
                        .filter((a) => a.status === "Active")
                        .map((a) => ({ value: a.id, label: a.name }))}
                    />
                    <Select
                      label="To account (transfers)"
                      name="toAccount"
                      value={modal.record.toAccount}
                      options={data.accounts
                        .filter((a) => a.status === "Active")
                        .map((a) => ({ value: a.id, label: a.name }))}
                    />
                    <Field
                      label="Notes"
                      name="notes"
                      value={modal.record.notes}
                    />
                  </>
                ) : (
                  <>
                    <Field
                      label="Name"
                      name="name"
                      value={modal.record.name}
                      required
                    />
                    {modal.entity === "tags" ? (
                      <>
                        <Select
                          label="Transaction type"
                          name="type"
                          value={modal.record.type}
                          options={[
                            "Expense",
                            "Income",
                            "Investment",
                            "Transfer",
                          ]}
                        />
                        <Select
                          label="Parent category"
                          name="parent"
                          value={modal.record.parent}
                          options={data.tags
                            .filter((t) => t.id !== modal.record.id)
                            .map((t) => ({ value: t.id, label: t.name }))}
                        />
                        <Field
                          label="Description"
                          name="description"
                          value={modal.record.description}
                        />
                        <Field
                          label="Color"
                          name="color"
                          type="color"
                          value={modal.record.color}
                        />
                        <Select
                          label="Spending classification"
                          name="spendingKind"
                          value={modal.record.spendingKind || "Unclassified"}
                          options={["Fixed", "Variable", "Unclassified"]}
                        />
                        <Field
                          label="Icon (symbol)"
                          name="icon"
                          value={modal.record.icon || "#"}
                        />
                      </>
                    ) : modal.entity === "accounts" ? (
                      <>
                        <Select
                          label="Account type"
                          name="type"
                          value={modal.record.type}
                          options={[
                            "Bank",
                            "Cash",
                            "Credit Card",
                            "Savings",
                            "Shared",
                            "Custom",
                          ]}
                        />
                        <Field
                          label="Opening balance (₹)"
                          name="openingBalance"
                          type="number"
                          step="0.01"
                          value={modal.record.openingBalance}
                        />
                        <Select
                          label="Owner"
                          name="person"
                          value={modal.record.person}
                          options={["Ram", "Varsha", "Combined"]}
                        />
                        <Field
                          label="Description"
                          name="description"
                          value={modal.record.description}
                        />
                      </>
                    ) : (
                      <>
                        <Field
                          label={
                            modal.entity === "goals"
                              ? "Target amount (₹)"
                              : "Amount (₹)"
                          }
                          name="amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={modal.record.amount}
                          required
                        />
                        <Select
                          label="Person"
                          name="person"
                          value={modal.record.person}
                          options={["Ram", "Varsha", "Combined"]}
                        />
                        <Select
                          label="Category"
                          name="tagId"
                          value={modal.record.tagId}
                          options={data.tags.map((t) => ({
                            value: t.id,
                            label: t.name,
                          }))}
                        />
                        {modal.entity === "goals" ? (
                          <>
                            <Field
                              label="Funded amount (₹)"
                              name="funded"
                              type="number"
                              min="0"
                              value={modal.record.funded}
                            />
                            <Field
                              label="Target date"
                              name="targetDate"
                              type="date"
                              value={modal.record.targetDate}
                            />
                            <Field
                              label="Monthly planned contribution (₹)"
                              name="contribution"
                              type="number"
                              min="0"
                              value={modal.record.contribution}
                            />
                          </>
                        ) : modal.entity === "recurring" ? (
                          <>
                            <Select
                              label="Frequency"
                              name="frequency"
                              value={modal.record.frequency || "Monthly"}
                              options={[
                                "Daily",
                                "Weekly",
                                "Monthly",
                                "Quarterly",
                                "Yearly",
                              ]}
                            />
                            <Select
                              label="Payment method"
                              name="payment"
                              value={modal.record.payment}
                              options={[
                                "UPI",
                                "Cash",
                                "Bank Transfer",
                                "Other",
                              ]}
                            />
                            <Select
                              label="Account"
                              name="account"
                              value={modal.record.account}
                              options={data.accounts
                                .filter((a) => a.status === "Active")
                                .map((a) => ({ value: a.id, label: a.name }))}
                            />
                            <Select
                              label="Destination account"
                              name="toAccount"
                              value={modal.record.toAccount}
                              options={data.accounts
                                .filter((a) => a.status === "Active")
                                .map((a) => ({ value: a.id, label: a.name }))}
                            />
                            <Field
                              label="Next due date"
                              name="nextDate"
                              type="date"
                              value={modal.record.nextDate || today()}
                            />
                            <Select
                              label="Schedule status"
                              name="scheduleStatus"
                              value={modal.record.scheduleStatus || "Active"}
                              options={["Active", "Paused", "Ended"]}
                            />
                            <Select
                              label="Transaction type"
                              name="type"
                              value={modal.record.type}
                              options={[
                                "Expense",
                                "Income",
                                "Investment",
                                "Transfer",
                              ]}
                            />
                          </>
                        ) : (
                          <Field
                            label="Month"
                            name="month"
                            type="month"
                            value={modal.record.month || today().slice(0, 7)}
                          />
                        )}
                        <Field
                          label="Description"
                          name="description"
                          value={modal.record.description}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-footer">
                <small>
                  <Check size={13} />
                  {destination === "google"
                    ? "Saved after Google Sheets confirms"
                    : "Saved after browser storage confirms"}
                </small>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="primary" disabled={saving || setup}>
                  {saving
                    ? "Saving…"
                    : "Save " +
                      (modal.entity === "transactions"
                        ? "transaction"
                        : "changes")}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {conflict && (
        <div className="modal-overlay">
          <section className="modal" role="dialog" aria-modal="true">
            <h2>This record changed in another tab or the public sheet.</h2>
            <p>
              Review the latest saved values before reapplying your changes.
            </p>
            <p>
              Last modified by {conflict.latest.updatedBy} at{" "}
              {conflict.latest.updatedAt}
            </p>
            <div className="audit-diff">
              <div>
                <section>
                  <h3>Your pending changes</h3>
                  <pre>{JSON.stringify(conflict.pending, null, 2)}</pre>
                </section>
                <section>
                  <h3>Latest saved values</h3>
                  <pre>{JSON.stringify(conflict.latest, null, 2)}</pre>
                </section>
              </div>
              <p>
                Changed fields:{" "}
                {Object.keys(conflict.pending)
                  .filter(
                    (k) =>
                      JSON.stringify(conflict.pending[k]) !==
                      JSON.stringify(conflict.latest[k]),
                  )
                  .join(", ")}
              </p>
            </div>
            <div className="row-actions">
              <button
                onClick={() => {
                  setModal(null);
                  setConflict(null);
                  refresh();
                }}
              >
                Reload latest
              </button>
              <button
                onClick={() => {
                  setModal({
                    entity: conflict.entity,
                    record: {
                      ...conflict.pending,
                      version: conflict.latest.version,
                      ...(conflict.latest.source === "google-sheet"
                        ? {
                            sheetVersion: conflict.latest.sheetVersion,
                            sourceFingerprint:
                              conflict.latest.sourceFingerprint,
                          }
                        : {}),
                    },
                    op: crypto.randomUUID(),
                  });
                  setConflict(null);
                }}
              >
                Reapply my changes
              </button>
              <button onClick={() => setConflict(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
      {detail && (
        <div className="modal-overlay">
          <section className="modal" role="dialog" aria-modal="true">
            <div className="card-heading">
              <h2>{detail.description}</h2>
              <button
                aria-label="Close transaction detail"
                onClick={() => setDetail(null)}
              >
                <X />
              </button>
            </div>
            <strong className="entity-amount">{money(detail.amount)}</strong>
            <p>
              {detail.date} · {detail.person} · {detail.tag}
            </p>
            <p>{detail.notes}</p>
            {detail.source !== "google-sheet" && (
              <button
                className="primary"
                disabled={!googleSession || saving}
                onClick={async () => {
                  chooseDestination("google");
                  if (await mutate("transactions", "create", detail))
                    setDetail(null);
                }}
              >
                Save to Google Sheet
              </button>
            )}
            <h3>History</h3>
            {data.audit
              .filter((a) => a.entityId === detail.id)
              .map((a) => (
                <details key={a.id}>
                  <summary>
                    {a.action} · {a.actor} · {a.timestamp}
                  </summary>
                  <pre>{JSON.stringify(safeParse(a.updated), null, 2)}</pre>
                </details>
              ))}
            <button
              className="primary"
              onClick={() => {
                open("transactions", detail);
                setDetail(null);
              }}
            >
              Edit transaction
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
function Field({ label, value, ...props }: any) {
  return (
    <label className="field">
      {label}
      <input defaultValue={value ?? ""} {...props} />
    </label>
  );
}
function Select({ label, name, value, options, required }: any) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        name={name}
        defaultValue={value || ""}
        required={required}
      >
        <option value="">Select…</option>
        {options.map((o: any) => (
          <option
            key={typeof o === "string" ? o : o.value}
            value={typeof o === "string" ? o : o.value}
          >
            {typeof o === "string" ? o : o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
