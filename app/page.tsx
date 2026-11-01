"use client";
import Analytics from "./analytics";
import Receipts from "./receipts";
import TagSelect from "./tag-select";
import { usePullToRefresh } from "./pull-to-refresh";
import { useDialogScrollLock } from "./use-dialog-scroll-lock";
import {
  readSheetCache,
  writeSheetCache,
  screenCollections,
  Collection,
} from "../lib/sheet-cache";
import { SHEET_URL } from "../lib/public-sheet";
import {
  configuredClientId,
  saveClientId,
  loadGoogleIdentity,
  signInGoogle,
  restoreGoogleSession,
  currentGoogleSession,
  disconnectGoogle,
  GoogleSession,
} from "../lib/google-auth";
import { readGoogleSnapshot, saveGoogle } from "../lib/google-sheets";
import { report, budgetSpent } from "../lib/reports";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Wallet,
  SlidersHorizontal,
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
    [period, setPeriod] = useState("All Time"),
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
    [filtersOpen, setFiltersOpen] = useState(false),
    [tagFilter, setTagFilter] = useState(""),
    [typeFilter, setTypeFilter] = useState(""),
    [accountFilter, setAccountFilter] = useState(""),
    [paymentFilter, setPaymentFilter] = useState(""),
    [receiptFilter, setReceiptFilter] = useState(""),
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
    [authChecked, setAuthChecked] = useState(false),
    [dataReady, setDataReady] = useState(false);
  const dataRef = useRef<Snapshot>(empty);
  const fetchedRef = useRef<Partial<Record<Collection, number>>>({});
  const [fetchedAt, setFetchedAt] = useState<
    Partial<Record<Collection, number>>
  >({});
  const [stale, setStale] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const pageRef = useRef("Dashboard");
  const epoch = useRef(0);
  const sheetBusy = useRef(false);
  const attachmentBusy = useRef(false);
  const staleRef = useRef(true);
  function markStale(value: boolean) {
    staleRef.current = value;
    setStale(value);
  }
  const savingRef = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  function signOut(message = "") {
    epoch.current++;
    disconnectGoogle();
    setGoogleSession(null);
    setData(empty);
    dataRef.current = empty;
    fetchedRef.current = {};
    setFetchedAt({});
    markStale(true);
    setDataReady(false);
    setModal(null);
    setDetail(null);
    setConflict(null);
    setNotice("");
    setError(message);
    setPage("Dashboard");
    pageRef.current = "Dashboard";
    setPeriod("All Time");
    setSelected([]);
    setSearch("");
  }
  async function persistSnapshot(
    snapshot: Snapshot,
    times: Partial<Record<Collection, number>>,
  ) {
    const email = currentGoogleSession()?.email;
    if (!email) return;
    try {
      await writeSheetCache(email, snapshot, times);
    } catch {
      setNotice(
        "This device could not save an offline cache. Your Google Sheets data is unaffected.",
      );
    }
  }
  async function loadCachedData(email: string) {
    try {
      const cached = await readSheetCache(email);
      if (!cached) return;
      dataRef.current = cached.data;
      fetchedRef.current = cached.fetchedAt;
      setData(cached.data);
      setFetchedAt(cached.fetchedAt);
      setDataReady(true);
      setSetup(true);
      markStale(true);
      setStatus(
        navigator.onLine ? "Cached data · syncing" : "Offline · cached data",
      );
      setSheetStatus("Cached Google Sheets data");
      const time = Math.min(
        ...screenCollections(pageRef.current).map(
          (key) => cached.fetchedAt[key] || 0,
        ),
      );
      if (time) setSheetTime(new Date(time).toLocaleString("en-IN"));
    } catch {
      /* Cache is optional; the live fetch will report its own error. */
    }
  }
  function failData(message: string) {
    setSelected([]);
    setNotice("");
    setSetup(true);
    markStale(true);
    setStatus("Offline / sync unavailable");
    setSheetStatus("Offline or unable to sync · cached snapshot");
    setError(message);
    if (!currentGoogleSession()) signOut(message);
  }
  async function refreshSheet(force = true, requestedPage = pageRef.current) {
    if (sheetBusy.current || savingRef.current || attachmentBusy.current)
      return;
    let session = currentGoogleSession();
    if (session?.offline && navigator.onLine) {
      try {
        session = await restoreGoogleSession();
        setGoogleSession(session);
      } catch (e: any) {
        signOut(e.message);
        return;
      }
    }
    if (!session) {
      signOut("Your Google session expired. Sign in again.");
      return;
    }
    const collections = screenCollections(requestedPage);
    if (
      !force &&
      !session.offline &&
      navigator.onLine &&
      collections.every(
        (key) => Date.now() - (fetchedRef.current[key] || 0) < 60000,
      )
    )
      return;
    if (!navigator.onLine || session.offline) {
      failData(
        "You are offline. Showing cached data; reconnect and sync to enable edits.",
      );
      return;
    }
    sheetBusy.current = true;
    setSyncing(true);
    const requestEpoch = ++epoch.current;
    setStatus("Syncing Google Sheets");
    try {
      const snapshot = await readGoogleSnapshot({
        collections,
        forceMetadata: force,
      });
      if (requestEpoch !== epoch.current || !currentGoogleSession()) return;
      const merged = { ...dataRef.current };
      const times = { ...fetchedRef.current };
      const now = Date.now();
      for (const key of collections) {
        merged[key] = snapshot.data[key];
        times[key] = now;
      }
      dataRef.current = merged;
      fetchedRef.current = times;
      setData(merged);
      setFetchedAt(times);
      setDataReady(true);
      setSetup(false);
      markStale(false);
      setError("");
      setSheetStatus("Google Sheets connected");
      setStatus("Google connected");
      const time = new Date().toLocaleTimeString("en-IN");
      setSheetTime(time);
      setLastSync(time);
      await persistSnapshot(merged, times);
    } catch (e: any) {
      if (requestEpoch === epoch.current) {
        if (e.status === 401 || e.status === 403) signOut(e.message);
        else
          failData(
            e.message ||
              "Could not sync Google Sheets. Showing cached data with edits disabled.",
          );
      }
    } finally {
      sheetBusy.current = false;
      setSyncing(false);
    }
  }
  async function connectGoogle() {
    setConnecting(true);
    setError("");
    try {
      if (clientId.trim()) saveClientId(clientId);
      const session = await signInGoogle();
      setGoogleSession(session);
      await loadCachedData(session.email);
      await refreshSheet();
    } catch (e: any) {
      signOut(e.message);
    } finally {
      setConnecting(false);
    }
  }
  useDialogScrollLock(!!(modal || detail || conflict));
  const pull = usePullToRefresh(
    () => refreshSheet(),
    !!googleSession && dataReady && !modal && !detail && !conflict && !saving,
  );
  const viewAvailable = screenCollections(page).every(
    (key) => !!fetchedAt[key],
  );
  const viewSyncedAt = Math.min(
    ...screenCollections(page).map((key) => fetchedAt[key] || 0),
  );
  const [sheetStatus, setSheetStatus] = useState("Google Sheets"),
    [sheetTime, setSheetTime] = useState("");
  useEffect(() => {
    let cancelled = false;
    setMounted(true);
    setClientId(configuredClientId());
    loadGoogleIdentity()
      .then(() => {
        if (!cancelled) setAuthReady(true);
      })
      .catch((e) => {
        if (!cancelled && navigator.onLine) setError(e.message);
      });
    const t = localStorage.getItem("wealthtrack-theme") || "light";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    (async () => {
      try {
        const restored = await restoreGoogleSession();
        if (cancelled) return;
        if (restored) {
          setGoogleSession(restored);
          await loadCachedData(restored.email);
          setAuthChecked(true);
          await refreshSheet();
        }
      } catch (e: any) {
        if (!cancelled) signOut(e.message);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    const checkSession = () => {
      if (currentGoogleSession()) {
        // Session expiry is checked here without polling the Sheets API.
      } else if (
        localStorage.getItem("wealthtrack-google-session") === null &&
        sessionStorage.getItem("wealthtrack-google-session") === null
      ) {
        // Also hides data as soon as the token expires.
        signOut();
      }
    };
    const onStoredSessionChange = (event: StorageEvent) => {
      if (
        (event.key === "wealthtrack-google-session" || event.key === null) &&
        !event.newValue
      )
        signOut();
    };
    window.addEventListener("storage", onStoredSessionChange);
    const timer = setInterval(checkSession, 15000);
    const reconnect = async () => {
      void loadGoogleIdentity()
        .then(() => setAuthReady(true))
        .catch(() => setAuthReady(false));
      try {
        const restored = await restoreGoogleSession();
        if (!restored) {
          signOut("Your Google session expired. Sign in again.");
          return;
        }
        setGoogleSession(restored);
        await refreshSheet();
      } catch (e: any) {
        signOut(e.message);
      }
    };
    const goOffline = () => {
      if (currentGoogleSession())
        failData(
          "You are offline. Showing cached data; edits are disabled until you sync.",
        );
    };
    const active = () => {
      checkSession();
      if (!document.hidden && currentGoogleSession() && navigator.onLine)
        refreshSheet(false);
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", active);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("wealthtrack");
      channel.current.onmessage = () => {
        if (currentGoogleSession()) refreshSheet();
      };
    }
    return () => {
      cancelled = true;
      epoch.current++;
      clearInterval(timer);
      window.removeEventListener("storage", onStoredSessionChange);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", active);
      channel.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!googleSession) return;
    const timer = setTimeout(
      () => signOut("Your Google session expired. Sign in again."),
      Math.max(0, googleSession.expiresAt - Date.now() - 30000),
    );
    return () => clearTimeout(timer);
  }, [googleSession]);
  useEffect(
    () => setOffset(0),
    [
      person,
      period,
      tagFilter,
      typeFilter,
      accountFilter,
      paymentFilter,
      receiptFilter,
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
  function accountName(value: string) {
    return (
      data.accounts.find((account) => account.id === value)?.name || value || ""
    );
  }
  const accountOptions = Array.from(
    new Set([
      ...data.accounts.map((account) => account.id),
      ...data.transactions
        .flatMap((row) => [row.account, row.toAccount])
        .filter(Boolean),
    ]),
  );
  const transactions = filtered
    .filter(
      (r) =>
        (deleted ? r.status === "Deleted" : r.status !== "Deleted") &&
        (!search ||
          [
            r.description,
            r.notes,
            r.tag,
            r.person,
            r.payment,
            accountName(r.account),
            accountName(r.toAccount),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.trim().toLowerCase())) &&
        (!tagFilter || r.tagId === tagFilter || r.tag === tagFilter) &&
        (!typeFilter || r.type === typeFilter) &&
        (!accountFilter ||
          r.account === accountFilter ||
          r.toAccount === accountFilter) &&
        (!paymentFilter || r.payment === paymentFilter) &&
        (!receiptFilter ||
          (receiptFilter === "with"
            ? r.receipts?.length > 0
            : !r.receipts?.length)) &&
        (!min || Number(r.amount) >= Number(min)) &&
        (!max || Number(r.amount) <= Number(max)),
    )
    .sort((a, b) =>
      sort === "amount"
        ? b.amount - a.amount
        : sort === "amount-low"
          ? a.amount - b.amount
          : sort === "merchant"
            ? a.description.localeCompare(b.description)
            : sort === "merchant-desc"
              ? b.description.localeCompare(a.description)
              : sort === "oldest"
                ? a.date.localeCompare(b.date)
                : b.date.localeCompare(a.date),
    );
  function navigate(p: string) {
    setPage(p);
    pageRef.current = p;
    if (currentGoogleSession()) void refreshSheet(false, p);
    setMobile(false);
    setOffset(0);
    setSelected([]);
  }
  function open(entity: string, record: any = {}) {
    if (stale || syncing) {
      setError("Sync with Google Sheets before editing cached data.");
      return;
    }
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
      if (
        !dataReady ||
        staleRef.current ||
        sheetBusy.current ||
        !currentGoogleSession()
      )
        throw Error("Sign in and load Google Sheets before saving.");
      savingRef.current = true;
      const requestEpoch = ++epoch.current;
      const d = await saveGoogle({
        entity,
        action,
        record,
        operationId: op,
        actor,
        targetId,
      });
      if (requestEpoch !== epoch.current || !currentGoogleSession())
        return false;
      if (d.conflict) {
        setConflict({ ...d, entity, action });
        setStatus("Conflict");
        return false;
      }
      dataRef.current = d.data;
      setData(d.data);
      const times = Object.fromEntries(
        Object.keys(empty).map((key) => [key, Date.now()]),
      );
      fetchedRef.current = times;
      setFetchedAt(times);
      await persistSnapshot(d.data, times);
      setStatus("Saved to Google Sheets");
      channel.current?.postMessage("changed");
      setNotice("Saved to Google Sheets");
      return true;
    } catch (e: any) {
      if (e.status === 401) signOut(e.message);
      else failData(e.message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    const record = { ...modal.record, ...values };
    if (["transactions", "recurring"].includes(modal.entity)) {
      for (const field of ["account", "toAccount"]) {
        const name = String(record[field] || "").trim();
        record[field] =
          data.accounts.find(
            (account) =>
              account.status === "Active" &&
              (account.id === name ||
                account.name.toLowerCase() === name.toLowerCase()),
          )?.id || name;
      }
    }
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
      a.download = `Budget Tracker-${title}.csv`;
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
      ).toFile(`Budget Tracker-${title}.xlsx`);
    } else {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Budget Tracker | " + title, 14, 20);
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
      doc.save(`Budget Tracker-${title}.pdf`);
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
                    <button
                      className="merchant"
                      onClick={() => {
                        setDetail(r);
                        void refreshSheet(false, "Transaction details");
                      }}
                    >
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
                        <small>{r.payment || "From Google Sheets"}</small>
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
                        disabled={stale || syncing || saving}
                        onClick={() => open("transactions", r)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        aria-label={
                          deleted ? "Restore transaction" : "Delete transaction"
                        }
                        disabled={saving || setup || syncing}
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
          [
            r.description,
            r.notes,
            r.tag,
            r.person,
            r.payment,
            accountName(r.account),
            accountName(r.toAccount),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.trim().toLowerCase())),
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
            disabled={setup || syncing}
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
                        mutate(key, "create", r);
                      }}
                    >
                      Save to Google Sheet
                    </button>
                  )}
                  <button
                    disabled={stale || syncing}
                    onClick={() => open(key, r)}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    disabled={saving || setup || syncing}
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
  if (!mounted || !authChecked)
    return (
      <div className="empty" role="status">
        Loading your financial space…
      </div>
    );
  if (!googleSession || !dataReady)
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <span className="logo">
            <TrendingUp size={28} />
          </span>
          <div className="eyebrow">BUDGET TRACKER</div>
          <h1>
            {googleSession
              ? "Connect to your Google Sheet"
              : "Your finances start here"}
          </h1>
          <p>
            {googleSession
              ? "Your financial data will appear after Google Sheets responds successfully."
              : "Sign in with your approved Google account to open your shared financial space."}
          </p>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {googleSession ? (
            <>
              <button
                className="primary"
                disabled={connecting}
                onClick={() => refreshSheet(true)}
              >
                Retry Google Sheets
              </button>
              <button onClick={() => signOut()}>Sign out</button>
            </>
          ) : (
            <button
              className="primary"
              disabled={connecting || !authReady}
              onClick={connectGoogle}
            >
              {connecting ? "Connecting…" : "Sign in with Google"}
            </button>
          )}
          <small>
            Access is limited to Ram and Varsha. Financial records are loaded
            from Google Sheets.
          </small>
        </section>
      </main>
    );
  return (
    <div className="app">
      {(pull.distance > 0 || pull.refreshing) && (
        <div
          className="pull-indicator"
          role="status"
          style={{
            transform: `translateX(-50%) translateY(${Math.max(0, pull.distance - 25)}px)`,
          }}
        >
          <RefreshCw size={17} />{" "}
          {pull.refreshing
            ? "Syncing with Google Sheets…"
            : pull.distance >= 65
              ? "Release to sync"
              : "Pull down to sync"}
        </div>
      )}
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
          budget tracker<span className="brand-dot">.</span>
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
            <button className="google-connect" onClick={() => signOut()}>
              Sign out
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
              disabled={setup || saving || syncing}
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
            {sheetTime ? " · " + sheetTime : ""}. Save destination: Google
            Sheets.
          </p>
          {stale && (
            <div className="offline-banner" role="status">
              <strong>
                {navigator.onLine && !googleSession.offline
                  ? "Cached data · sync required"
                  : "Offline — cached data"}
              </strong>
              <span>
                {viewSyncedAt
                  ? `Last sync: ${new Date(viewSyncedAt).toLocaleString("en-IN")}. `
                  : ""}
                Edits, uploads and deletions are disabled until you sync.
              </span>
              <button disabled={syncing} onClick={() => refreshSheet()}>
                Sync now
              </button>
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
              {setup && (
                <p>Reconnect to Google Sheets before editing your records.</p>
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
          {!viewAvailable && (
            <div className="card empty" role="status">
              {syncing
                ? "Fetching this screen from Google Sheets…"
                : "This screen is not cached yet. Connect to the internet and sync to view it."}
            </div>
          )}
          {viewAvailable && (
            <>
              {page === "Dashboard" && (
                <>
                  <div className="overview-heading">
                    <h2>
                      {period === "All Time"
                        ? "Your all-time savings"
                        : "Your money at a glance"}
                    </h2>
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
                    {card(
                      "Total savings",
                      stats.income - stats.expense,
                      previous.income - previous.expense,
                      "var(--text)",
                    )}
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
                              {((100 * c.value) / (stats.expense || 1)).toFixed(
                                0,
                              )}
                              %
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
                            totals(filterRows(data.transactions, p, ...range))
                              .net,
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
                  <div className="transaction-toolbar">
                    <input
                      aria-label="Search transactions"
                      type="search"
                      placeholder="Search merchant, notes, tag or account"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                      aria-label="Sort transactions"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="amount">Highest amount</option>
                      <option value="amount-low">Lowest amount</option>
                      <option value="merchant">Merchant A–Z</option>
                      <option value="merchant-desc">Merchant Z–A</option>
                    </select>
                    <button
                      className={
                        filtersOpen ? "filter-toggle active" : "filter-toggle"
                      }
                      aria-expanded={filtersOpen}
                      aria-controls="transaction-filter-panel"
                      onClick={() => setFiltersOpen(!filtersOpen)}
                    >
                      <SlidersHorizontal size={16} /> Filters
                      {[
                        tagFilter,
                        typeFilter,
                        accountFilter,
                        paymentFilter,
                        receiptFilter,
                        min,
                        max,
                      ].filter(Boolean).length > 0 && (
                        <span className="filter-count">
                          {
                            [
                              tagFilter,
                              typeFilter,
                              accountFilter,
                              paymentFilter,
                              receiptFilter,
                              min,
                              max,
                            ].filter(Boolean).length
                          }
                        </span>
                      )}
                    </button>
                  </div>
                  {filtersOpen && (
                    <div
                      className="transaction-filters"
                      id="transaction-filter-panel"
                    >
                      <TagSelect
                        label="Tag filter"
                        name="tagFilter"
                        value={tagFilter}
                        emptyLabel="All categories"
                        options={data.tags.map((t) => ({
                          value: t.id,
                          label: t.name,
                        }))}
                        onChange={(value) => {
                          setTagFilter(value);
                          setOffset(0);
                        }}
                      />
                      <label className="field">
                        Transaction type
                        <select
                          aria-label="Type filter"
                          value={typeFilter}
                          onChange={(e) => {
                            setTypeFilter(e.target.value);
                            setOffset(0);
                          }}
                        >
                          <option value="">All types</option>
                          {["Income", "Expense", "Investment", "Transfer"].map(
                            (t) => (
                              <option key={t}>{t}</option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="field">
                        Account
                        <select
                          aria-label="Account filter"
                          value={accountFilter}
                          onChange={(e) => {
                            setAccountFilter(e.target.value);
                            setOffset(0);
                          }}
                        >
                          <option value="">All accounts</option>
                          {accountOptions.map((value) => (
                            <option key={value} value={value}>
                              {accountName(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Payment method
                        <select
                          aria-label="Payment method filter"
                          value={paymentFilter}
                          onChange={(e) => setPaymentFilter(e.target.value)}
                        >
                          <option value="">All payment methods</option>
                          {Array.from(
                            new Set(
                              data.transactions
                                .map((row) => row.payment)
                                .filter(Boolean),
                            ),
                          )
                            .sort()
                            .map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        Receipts
                        <select
                          aria-label="Receipt filter"
                          value={receiptFilter}
                          onChange={(e) => setReceiptFilter(e.target.value)}
                        >
                          <option value="">All receipts</option>
                          <option value="with">With receipts</option>
                          <option value="without">Without receipts</option>
                        </select>
                      </label>
                      <label className="field">
                        Minimum amount (₹)
                        <input
                          aria-label="Minimum amount"
                          type="number"
                          placeholder="Min ₹"
                          value={min}
                          onChange={(e) => setMin(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        Maximum amount (₹)
                        <input
                          aria-label="Maximum amount"
                          type="number"
                          placeholder="Max ₹"
                          value={max}
                          onChange={(e) => setMax(e.target.value)}
                        />
                      </label>
                      <button
                        onClick={() => {
                          setTagFilter("");
                          setAccountFilter("");
                          setTypeFilter("");
                          setPaymentFilter("");
                          setReceiptFilter("");
                          setSearch("");
                          setPerson("Combined");
                          setPeriod("All Time");
                          setSort("newest");
                          setMin("");
                          setMax("");
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  )}
                  {selected.length > 0 && (
                    <div className="bulk">
                      {selected.length} selected
                      <button
                        disabled={saving || setup || syncing}
                        onClick={async () => {
                          if (!confirm("Apply to selected records?")) return;
                          for (const id of selected) {
                            const r = data.transactions.find(
                              (r) => r.id === id,
                            )!;
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
                        disabled={saving || setup || syncing}
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
              {[
                "Expense Analytics",
                "Investments",
                "Income & Cash Flow",
              ].includes(page) && (
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
                                style={{
                                  background: colors[i % colors.length],
                                }}
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
                        Average daily spending:{" "}
                        {money(stats.expense / duration)} across{" "}
                        {duration.toFixed(0)} days.
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
                    disabled={saving || setup || syncing}
                    onClick={() => mutate("recurring", "runDue", {})}
                  >
                    Run due schedules
                  </button>
                  <p>
                    Saves due transactions to Google Sheets. Nothing runs when
                    the website is closed.
                  </p>
                </div>
              )}
              {page === "Audit History" && (
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <h2>The full story</h2>
                      <p>
                        Append-only changes · times in IST · names are
                        unverified
                      </p>
                    </div>
                    <button
                      onClick={() => exportData("csv", data.audit, "Audit")}
                    >
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
                                  {JSON.stringify(
                                    safeParse(r.updated),
                                    null,
                                    2,
                                  )}
                                </pre>
                              </section>
                            </div>
                          </div>
                        </details>
                      ))}
                    {!data.audit.length && (
                      <div className="empty">
                        Changes saved to Google Sheets will appear here.
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
                      <p>
                        Uses the selected person, dates, and matching records.
                      </p>
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
                    Your approved Google account is required to view and update
                    the shared workbook. Financial records are fetched directly
                    from Google Sheets.
                  </p>
                  <label>
                    Appearance
                    <select
                      value={theme}
                      onChange={(e) => {
                        setTheme(e.target.value);
                        document.documentElement.dataset.theme = e.target.value;
                        localStorage.setItem(
                          "wealthtrack-theme",
                          e.target.value,
                        );
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
                    Storage: Google Sheets with a read-only offline cache
                    <br />
                    Audit actor: {googleSession.email}
                  </p>
                  <button
                    className="primary"
                    disabled={setup || syncing}
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
                      <button onClick={() => signOut()}>Sign out</button>
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
                        Platform. For an app in Testing, add Ram and Varsha as
                        test users.
                      </li>
                      <li>
                        Create an OAuth client of type Web application. Add{" "}
                        <code>http://127.0.0.1:3000</code> and{" "}
                        <code>http://localhost:3000</code> as authorized
                        JavaScript origins. Add your GitHub Pages HTTPS origin
                        when you publish.
                      </li>
                      <li>
                        Paste the client ID above. Do not paste a client secret.
                      </li>
                    </ol>
                  </details>
                  <p>
                    First connection creates recovery copies of the ledger, tags
                    and summaries within this workbook, adds stable IDs, and
                    prepares supporting tabs. Your short-lived login is kept on
                    this device so reopening the app does not require sign-in
                    while the Google token is valid. Version checks reduce
                    conflicts, but browser-only writes cannot guarantee a lock
                    across devices or manual sheet edits.
                  </p>
                  <hr />
                  <h3>Google Sheet</h3>
                  <p>
                    {sheetStatus}
                    {sheetTime ? " · last read " + sheetTime : ""}. Refreshes
                    every on startup and when needed for this screen. Pull down
                    or press Sync now to force a refresh. Cached data is
                    read-only when offline.
                  </p>
                  <div className="row-actions">
                    <button onClick={() => refreshSheet()}>
                      <RefreshCw size={15} />
                      Refresh Google Sheet
                    </button>
                    <a href={SHEET_URL} target="_blank" rel="noreferrer">
                      Open Google Sheet ↗
                    </a>
                  </div>
                  <p>
                    All saves update the shared workbook after Google confirms
                    the request.
                  </p>
                  <hr />
                  <h3>Your data & backups</h3>
                  <p>
                    Download a JSON export fetched directly from Google Sheets.
                    Exports are never used as a fallback or restored into
                    browser storage.
                  </p>
                  <div className="row-actions">
                    <button
                      onClick={async () => {
                        try {
                          const current = (await readGoogleSnapshot()).data;
                          const url = URL.createObjectURL(
                            new Blob(
                              [
                                JSON.stringify(
                                  {
                                    schemaVersion: 1,
                                    exportedAt: new Date().toISOString(),
                                    data: current,
                                  },
                                  null,
                                  2,
                                ),
                              ],
                              {
                                type: "application/json",
                              },
                            ),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download =
                            "Budget Tracker-backup-" + today() + ".json";
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
                  </div>
                </section>
              )}
            </>
          )}
          <footer>
            <span className="brand-small">budget tracker.</span>
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
                disabled={saving || setup || syncing}
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
                    <TagSelect
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
                    <Field
                      label="From account"
                      name="account"
                      value={accountName(modal.record.account)}
                      maxLength={120}
                      placeholder="Enter account name"
                    />
                    <Field
                      label="To account"
                      name="toAccount"
                      value={accountName(modal.record.toAccount)}
                      maxLength={120}
                      placeholder="Enter account name"
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
                        <TagSelect
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
                            <Field
                              label="From account"
                              name="account"
                              value={accountName(modal.record.account)}
                              maxLength={120}
                              placeholder="Enter account name"
                            />
                            <Field
                              label="To account"
                              name="toAccount"
                              value={accountName(modal.record.toAccount)}
                              maxLength={120}
                              placeholder="Enter account name"
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
                  Saved after Google Sheets confirms
                </small>
                <button
                  type="button"
                  disabled={saving || setup || syncing}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={saving || setup || syncing}
                >
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
                  refreshSheet();
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
                  if (await mutate("transactions", "create", detail))
                    setDetail(null);
                }}
              >
                Save to Google Sheet
              </button>
            )}
            <Receipts
              transaction={
                data.transactions.find((row) => row.id === detail.id) || detail
              }
              disabled={saving || stale || syncing}
              onBusyChange={(value) => {
                attachmentBusy.current = value;
              }}
              onAttach={async (receipts) => {
                const latest = dataRef.current.transactions.find(
                  (row) => row.id === detail.id,
                );
                if (!latest)
                  throw Error(
                    "Transaction is no longer available. Refresh Google Sheets.",
                  );
                if (
                  !(await mutate("transactions", "edit", {
                    ...latest,
                    receipts,
                  }))
                )
                  throw Error(
                    "Google Sheets did not confirm the receipt update. Reconnect and check the transaction before retrying.",
                  );
              }}
            />
            <h3>History</h3>
            {!fetchedAt.audit && (
              <p>
                History has not been cached yet. Connect and sync to load it.
              </p>
            )}
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
              disabled={stale || syncing || saving}
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
