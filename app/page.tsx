"use client";
import Analytics from "./analytics";
import AccountBalances from "./account-balances";
import CreditBills from "./credit-bills";
import LoanTracker from "./loan-tracker";
import { isLoanPayment } from "../lib/loans";
import CreditCardEditor from "./credit-card-editor";
import {
  reportedCardTotal,
  isCredit,
  isCreditPayment,
  creditTotal,
  unpaidCredit,
  paymentFor,
} from "../lib/credit";
import Receipts from "./receipts";
import AmountField from "./amount-field";
import {
  activeOwners,
  allOwners,
  accountOwners,
  ownerEmails,
  belongsToOwner,
} from "../lib/owners";
import { amountFromExpression } from "../lib/amount-expression";
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
  ["Credit Card Bills", Wallet],
  ["Loan Tracker", Landmark],
  ["Expense Analytics", ChartNoAxesCombined],
  ["Investments", TrendingUp],
  ["Income & Cash Flow", Wallet],
  ["Accounts", Landmark],
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
  Accounts: "accounts",
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
      pending?: any;
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
      setPerson(session.ownerName || "Combined");
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
          setPerson(restored.ownerName || "Combined");
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
  const owners = activeOwners(data.settings);
  const ownerNames = owners.map((owner) => owner.name);
  useEffect(() => {
    if (
      dataReady &&
      person !== "Combined" &&
      !activeOwners(data.settings).some((owner) => owner.name === person)
    )
      setPerson("Combined");
  }, [data.settings, person, dataReady]);
  const visibleAccounts = data.accounts.filter(
    (account) =>
      account.status === "Active" &&
      (person === "Combined" ||
        accountOwners(account, allOwners(data.settings)).some((id) =>
          owners.some((owner) => owner.id === id && owner.name === person),
        )),
  );
  useEffect(() => {
    if (
      accountFilter &&
      !visibleAccounts.some((account) => account.id === accountFilter)
    )
      setAccountFilter("");
  }, [person, data.accounts, data.settings, accountFilter]);
  const scopedAccount = ["Dashboard", "Transactions"].includes(page)
    ? accountFilter
    : "";
  const matchesAccount = (row: RecordData) =>
    !scopedAccount ||
    row.account === scopedAccount ||
    row.account ===
      data.accounts.find((account) => account.id === scopedAccount)?.name;
  const range = period === "Custom Range" ? custom : dateRange(period);
  const filtered = filterRows(
    data.transactions,
    person,
    ...range,
    data.accounts,
    allOwners(data.settings),
  ).filter(matchesAccount);
  const active = filtered.filter((r) => r.status !== "Deleted");
  const stats = totals(active);
  const currentBalance = visibleAccounts
    .filter((account) => !scopedAccount || account.id === scopedAccount)
    .reduce((sum, account) => sum + balance(account, data.transactions), 0);

  const outstandingCredit = unpaidCredit(
    data.transactions,
    undefined,
    true,
  ).filter(
    (row) =>
      belongsToOwner(row, person, data.accounts, allOwners(data.settings)) &&
      matchesAccount(row),
  );
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
  const history = data.transactions.filter(
    (row) => row.status !== "Deleted" && row.date <= range[1],
  );
  const available =
    data.accounts
      .filter(
        (account) =>
          account.status === "Active" &&
          (!scopedAccount || account.id === scopedAccount) &&
          (person === "Combined" ||
            accountOwners(account, allOwners(data.settings)).some((id) =>
              owners.some((owner) => owner.id === id && owner.name === person),
            )),
      )
      .reduce((sum, account) => sum + balance(account, history), 0) +
    totals(
      history.filter(
        (row) =>
          !scopedAccount &&
          !data.accounts.some(
            (account) =>
              account.id === row.account || account.name === row.account,
          ) &&
          belongsToOwner(row, person, data.accounts, allOwners(data.settings)),
      ),
    ).net;
  const previous = totals(
    filterRows(
      data.transactions,
      person,
      previousStart,
      previousEnd,
      data.accounts,
      allOwners(data.settings),
    ).filter(matchesAccount),
  );
  const categories = Object.entries(
    active
      .filter(
        (r) => (r.type === "Expense" && !isCredit(r)) || isCreditPayment(r),
      )
      .reduce((a: any, r) => {
        a[r.tag] =
          (a[r.tag] || 0) +
          Number(isLoanPayment(r) ? r.interestPaid : r.amount);
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
      if (isLoanPayment(r)) m[key].Expense += Number(r.interestPaid || 0);
      else if (isCreditPayment(r)) m[key].Expense += Number(r.amount);
      else if (!isCredit(r) && !r.cardRefund && r.type in m[key])
        m[key][r.type] += Number(r.amount);
    });
    return Object.values(m)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({
        ...r,
        net: r.Income - r.Expense - r.Investment,
        saved: r.Income - r.Expense,
      }));
  }, [data, person, scopedAccount, range[0], range[1]]);
  function accountName(value: string) {
    return (
      data.accounts.find((account) => account.id === value)?.name || value || ""
    );
  }
  const accountOptions = visibleAccounts.map((account) => account.id);
  const ledgerAccountOptions = data.accounts
    .filter((account) => account.status === "Active")
    .map((account) => ({
      value: account.id,
      label: `${account.name} · ${accountOwners(
        account,
        allOwners(data.settings),
      )
        .map((id) => owners.find((owner) => owner.id === id)?.name)
        .filter(Boolean)
        .join(", ")}`,
    }));
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
            r.expenseMode,
            r.creditCardName,
            accountName(r.account),
            accountName(r.toAccount),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.trim().toLowerCase())) &&
        (!tagFilter || r.tagId === tagFilter || r.tag === tagFilter) &&
        (!typeFilter ||
          (typeFilter === "Debit"
            ? r.type === "Expense" && !isCredit(r)
            : typeFilter === "Credit"
              ? isCredit(r)
              : typeFilter === "CreditPayment"
                ? isCreditPayment(r)
                : r.type === typeFilter)) &&
        matchesAccount(r) &&
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
    if (
      entity === "transactions" &&
      (isCreditPayment(record) || isLoanPayment(record))
    ) {
      setNotice(
        "This payment is linked to a bill or loan. Delete it and create a new payment to change the payment details.",
      );
      return;
    }
    setModal({
      entity,
      record: {
        status: "Active",
        date: today(),
        person:
          person === "Combined"
            ? currentGoogleSession()?.ownerName || ownerNames[0] || "Combined"
            : person,
        ...(["transactions", "recurring"].includes(entity)
          ? {
              account:
                accountFilter ||
                visibleAccounts.find((account) =>
                  accountOwners(account, allOwners(data.settings)).includes(
                    currentGoogleSession()?.ownerId || "",
                  ),
                )?.id ||
                visibleAccounts[0]?.id ||
                "",
            }
          : {}),
        ...(entity === "accounts"
          ? {
              ownerIds: [
                owners.find(
                  (owner) =>
                    owner.name ===
                    (person === "Combined"
                      ? currentGoogleSession()?.ownerName
                      : person),
                )?.id,
              ].filter(Boolean),
            }
          : {}),
        ...(entity === "owners" ? { kind: "owner" } : {}),
        type: entity === "accounts" ? "Bank" : "Expense",
        payment: "UPI",
        expenseMode: "Debit",
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
    if (entity === "owners" || entity === "loans") {
      record = { ...record, kind: entity === "owners" ? "owner" : "loan" };
      entity = "settings";
    }
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
    const record = modal.pending || { ...modal.record, ...values };
    if (staleRef.current) {
      await refreshSheet();
      if (staleRef.current || !currentGoogleSession()) return;
    }
    if (!modal.pending) {
      if (modal.entity === "owners")
        record.emails = String(values.emails || "")
          .split(/[\s,;]+/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean);
      if (modal.entity === "accounts") {
        record.creditCards = JSON.parse(String(values.creditCards || "[]"));
        record.ownerIds = new FormData(e.currentTarget)
          .getAll("ownerIds")
          .map(String);
        record.person =
          record.ownerIds.length === 1
            ? owners.find((owner) => owner.id === record.ownerIds[0])?.name
            : "Combined";
      }
      if (["transactions", "recurring"].includes(modal.entity)) {
        for (const field of ["account", "toAccount"]) {
          const name = String(record[field] || "").trim();
          record[field] =
            dataRef.current.accounts.find(
              (account) =>
                account.status === "Active" &&
                (account.id === name ||
                  account.name.toLowerCase() === name.toLowerCase()),
            )?.id || name;
        }
      }
      if (
        ["transactions", "recurring"].includes(modal.entity) &&
        record.type !== "Transfer"
      )
        record.toAccount = "";
      try {
        if ("amount" in record)
          record.amount = amountFromExpression(record.amount);
        for (const key of ["openingBalance", "funded", "contribution"])
          if (key in record) record[key] = Number(record[key]);
      } catch (error) {
        setError((error as Error).message);
        return;
      }
    }
    if (
      modal.entity === "transactions" &&
      !record.id &&
      !modal.pending &&
      dataRef.current.transactions.some(
        (r) =>
          r.status !== "Deleted" &&
          r.date === record.date &&
          r.description === record.description &&
          Number(r.amount) === record.amount,
      ) &&
      !confirm("A matching transaction already exists. Save another?")
    )
      return;
    setModal((current) =>
      current?.op === modal.op ? { ...current, pending: record } : current,
    );
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
      doc.text(
        `${person === "Combined" ? "All" : person} | ${range.join(" to ")}`,
        14,
        29,
      );
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
  const transactionList = (limit?: number) => {
    const visible = transactions.slice(
      limit ? 0 : offset,
      limit || offset + 20,
    );
    const allSelected =
      visible.length > 0 && visible.every((row) => selected.includes(row.id));
    const partlySelected =
      !allSelected && visible.some((row) => selected.includes(row.id));
    return (
      <div className="transaction-feed">
        {!limit && visible.length > 0 && (
          <label className="transaction-select-all">
            <input
              aria-label="Select all visible transactions"
              type="checkbox"
              checked={allSelected}
              ref={(element) => {
                if (element) element.indeterminate = partlySelected;
              }}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? Array.from(
                        new Set([...selected, ...visible.map((row) => row.id)]),
                      )
                    : selected.filter(
                        (id) => !visible.some((row) => row.id === id),
                      ),
                )
              }
            />
            Select all
          </label>
        )}
        <ul
          className="transaction-list"
          aria-label={limit ? "Recent transactions" : "Transactions"}
        >
          {visible.map((r) => (
            <li
              className={`transaction-item${!limit ? " selectable" : ""}`}
              key={r.id}
            >
              {!limit && (
                <input
                  className="transaction-checkbox"
                  aria-label={`Select ${r.description}`}
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, r.id]
                        : selected.filter((id) => id !== r.id),
                    )
                  }
                />
              )}
              <div className="transaction-body">
                <div className="transaction-topline">
                  <button
                    className="merchant"
                    title={r.description}
                    onClick={() => {
                      setDetail(r);
                      void refreshSheet(false, "Transaction details");
                    }}
                  >
                    <span className="merchant-icon" data-type={r.type}>
                      {r.type === "Income" ? (
                        <ArrowDownRight size={18} />
                      ) : r.type === "Transfer" ? (
                        <ArrowLeftRight size={18} />
                      ) : r.type === "Investment" ? (
                        <TrendingUp size={18} />
                      ) : (
                        <ArrowUpRight size={18} />
                      )}
                    </span>
                    <b>{r.description}</b>
                  </button>
                  <strong
                    className={`transaction-amount${r.type === "Income" ? " income" : ""}`}
                  >
                    {r.type === "Income" ? "+" : "−"}
                    {money(Number(r.amount))}
                  </strong>
                </div>
                <div className="transaction-meta">
                  <span className="chip">{r.tag || "Uncategorized"}</span>
                  {r.cardRefund && (
                    <span className="chip">
                      Card refund · no bank cash movement
                    </span>
                  )}
                  {isLoanPayment(r) && (
                    <span className="chip">
                      Loan repayment · principal {money(r.principalPaid)} +
                      interest {money(r.interestPaid)}
                    </span>
                  )}
                  {((r.type === "Expense" && !isLoanPayment(r)) ||
                    isCreditPayment(r)) && (
                    <span
                      className={"chip " + (isCredit(r) ? "credit-chip" : "")}
                    >
                      {isCreditPayment(r)
                        ? "Credit Card bill paid"
                        : isCredit(r)
                          ? paymentFor(r.id, data.transactions)
                            ? "Credit Card · Paid"
                            : r.settlementStatus === "Unknown"
                              ? "Credit Card · statement history"
                              : "Credit Card · Unpaid"
                          : "Debit"}
                    </span>
                  )}
                  <span>
                    {r.person === "Combined" ? "All" : r.person || "Unassigned"}
                  </span>
                  <time dateTime={r.date}>
                    {new Date(r.date + "T00:00:00").toLocaleDateString(
                      "en-IN",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </time>
                </div>
                <div className="transaction-bottomline">
                  <div className="transaction-context">
                    <span>{r.creditCardName || r.payment || r.type}</span>
                    {r.account && (
                      <span>
                        {accountName(r.account)}
                        {r.toAccount ? ` → ${accountName(r.toAccount)}` : ""}
                      </span>
                    )}
                    {Array.isArray(r.receipts) && r.receipts.length > 0 && (
                      <span>
                        {r.receipts.length} receipt
                        {r.receipts.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className="row-actions transaction-actions">
                    <button
                      aria-label="Edit transaction"
                      title="Edit transaction"
                      disabled={stale || syncing || saving}
                      onClick={() => open("transactions", r)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      aria-label={
                        deleted ? "Restore transaction" : "Delete transaction"
                      }
                      title={
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
                      {deleted ? <RotateCcw size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {!transactions.length && (
          <div className="empty">No transactions match this view.</div>
        )}
      </div>
    );
  };
  const entityPage = () => {
    const key = entities[page];
    if (!key) return null;
    const records = (data[key] as RecordData[]).filter(
      (r) =>
        (key === "accounts"
          ? person === "Combined" ||
            accountOwners(r, allOwners(data.settings)).some((id) =>
              owners.some((owner) => owner.id === id && owner.name === person),
            )
          : person === "Combined" ||
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
            r.expenseMode,
            r.creditCardName,
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
                <p>
                  {key === "accounts"
                    ? allOwners(data.settings)
                        .filter((owner) =>
                          accountOwners(r, allOwners(data.settings)).includes(
                            owner.id,
                          ),
                        )
                        .map((owner) => owner.name)
                        .join(", ")
                    : r.description || r.person || r.type || "Household"}
                </p>
                {key === "accounts" ? (
                  <>
                    <strong className="entity-amount">
                      {money(balance(r, data.transactions))}
                    </strong>
                    {(r.creditCards || []).length > 0 && (
                      <p>
                        Cards:{" "}
                        {r.creditCards.map((card: any) => card.name).join(", ")}
                        <br />
                        Unpaid credit card:{" "}
                        {money(
                          creditTotal(unpaidCredit(data.transactions, r.id)),
                        )}
                      </p>
                    )}
                    <small>
                      Ledger balance · opening {money(Number(r.openingBalance))}
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
                        r.status === "Active"
                          ? key === "accounts"
                            ? "delete"
                            : "archive"
                          : "restore",
                        r,
                      )
                    }
                  >
                    {r.status === "Active"
                      ? key === "accounts"
                        ? "Delete"
                        : "Archive"
                      : "Restore"}
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
            Sign in with an email assigned to an active owner who has access to
            the Budget Sheet. Financial records are loaded from Google Sheets.
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
            <b>Your household</b>
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
                {page === "Dashboard"
                  ? `Hello, ${googleSession?.ownerName || googleSession?.name || "there"}`
                  : page}
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
              {[...ownerNames, "Combined"].map((p) => (
                <button
                  className={p === person ? "selected" : ""}
                  key={p}
                  onClick={() => {
                    setPerson(p);
                    setOffset(0);
                  }}
                >
                  {p === "Combined" && (
                    <span className="tiny-avatars" aria-hidden="true">
                      {owners
                        .slice(0, 2)
                        .map((owner) => owner.name[0])
                        .join("")}
                    </span>
                  )}
                  {p === "Combined" ? "All" : p}
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
                    <option key={p} value={p}>
                      {p === "Combined" ? "All" : p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {["Dashboard", "Transactions"].includes(page) && (
            <div
              className="account-switcher"
              role="group"
              aria-label="Choose account"
            >
              <button
                type="button"
                aria-pressed={!accountFilter}
                onClick={() => setAccountFilter("")}
              >
                All accounts
              </button>
              {visibleAccounts.map((account) => (
                <button
                  type="button"
                  key={account.id}
                  aria-pressed={accountFilter === account.id}
                  onClick={() => setAccountFilter(account.id)}
                >
                  {account.name}
                </button>
              ))}
            </div>
          )}
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
          <AccountBalances
            accounts={visibleAccounts}
            rows={data.transactions}
            stale={stale}
          />
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
                    <button
                      className="stat card"
                      onClick={() => navigate("Accounts")}
                    >
                      <span className="stat-label">
                        Current Balance <ArrowUpRight size={17} />
                      </span>
                      <strong style={{ color: "var(--teal)" }}>
                        {money(currentBalance)}
                      </strong>
                      <span className="comparison">
                        Current account balances · independent of report dates
                      </span>
                    </button>
                    {card(
                      "Paid expenses",
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
                  {reportedCardTotal(visibleAccounts) > 0 && (
                    <div className="card credit-outstanding">
                      <span>
                        Reported card outstanding · partial statement snapshots
                      </span>
                      <strong>
                        {money(reportedCardTotal(visibleAccounts))}
                      </strong>
                      <button onClick={() => navigate("Credit Card Bills")}>
                        View all cards →
                      </button>
                    </div>
                  )}
                  <button
                    className="card credit-outstanding"
                    onClick={() => navigate("Credit Card Bills")}
                  >
                    <span>
                      {outstandingCredit.some(
                        (row) => row.settlementStatus === "Unknown",
                      )
                        ? "Credit card charges to review"
                        : "Unpaid credit card"}{" "}
                      · {outstandingCredit.length} transactions
                    </span>
                    <strong>{money(creditTotal(outstandingCredit))}</strong>
                    <span>Review & pay bills →</span>
                  </button>
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
                    {transactionList(5)}
                  </section>
                  <div className="available-cash card">
                    <div>
                      <span className="stat-label">
                        Ledger cash through {range[1]}
                      </span>
                      <strong>{money(available)}</strong>
                      <small>
                        Calculated from opening balances and recorded movements;
                        check the confirmed balances above for reconciliation.
                        Income − expenses − investment contributions. Unassigned
                        records are included in the combined view.
                      </small>
                    </div>
                    <Wallet size={25} />
                  </div>
                  <div className="balance-grid">
                    {[...ownerNames, "Combined"].map((p) => (
                      <div className="card" key={p}>
                        <span className="stat-label">
                          {p === "Combined" ? "Household" : p} cash movement
                        </span>
                        <strong>
                          {money(
                            totals(
                              filterRows(
                                data.transactions,
                                p,
                                ...range,
                                data.accounts,
                                allOwners(data.settings),
                              ),
                            ).net,
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
              {page === "Loan Tracker" && (
                <LoanTracker
                  loans={data.settings.filter(
                    (loan) =>
                      loan.kind === "loan" &&
                      loan.status === "Active" &&
                      visibleAccounts.some(
                        (account) => account.id === loan.accountId,
                      ),
                  )}
                  rows={data.transactions}
                  accounts={data.accounts.filter(
                    (account) => account.status === "Active",
                  )}
                  linkedAccounts={visibleAccounts}
                  disabled={stale || syncing || saving}
                  error={error}
                  onSave={async (record, op) => {
                    if (staleRef.current) {
                      await refreshSheet();
                      if (staleRef.current) return false;
                    }
                    return mutate(
                      "loans",
                      record.id ? "edit" : "create",
                      record,
                      op,
                    );
                  }}
                  onPay={async (record, op) => {
                    if (staleRef.current) {
                      await refreshSheet();
                      if (staleRef.current) return false;
                    }
                    const tag = dataRef.current.tags.find(
                      (tag) =>
                        tag.status === "Active" && tag.type === "Expense",
                    );
                    if (!tag) {
                      setError(
                        "Create an expense tag before recording loan payments.",
                      );
                      return false;
                    }
                    record.tagId ||= tag.id;
                    return mutate("transactions", "create", record, op);
                  }}
                />
              )}
              {page === "Credit Card Bills" && (
                <CreditBills
                  rows={data.transactions}
                  accounts={data.accounts.filter(
                    (account) => account.status === "Active",
                  )}
                  destinations={visibleAccounts}
                  label={(account) =>
                    `${account.name} · ${accountOwners(
                      account,
                      allOwners(data.settings),
                    )
                      .map(
                        (id) => owners.find((owner) => owner.id === id)?.name,
                      )
                      .filter(Boolean)
                      .join(", ")}`
                  }
                  disabled={stale || syncing || saving}
                  error={error}
                  onPay={async (record, op) => {
                    if (staleRef.current) {
                      await refreshSheet();
                      if (staleRef.current) return false;
                    }
                    const tag =
                      dataRef.current.tags.find(
                        (tag) =>
                          tag.status === "Active" && tag.type === "Transfer",
                      ) ||
                      dataRef.current.tags.find(
                        (tag) => tag.status === "Active",
                      );
                    if (!tag) {
                      setError(
                        "Create an expense tag before saving a bill payment.",
                      );
                      return false;
                    }
                    record.tagId ||= tag.id;
                    return await mutate("transactions", "create", record, op);
                  }}
                />
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
                          <option value="Debit">Debit expenses</option>
                          <option value="Credit">Credit Card expenses</option>
                          <option value="CreditPayment">
                            Credit bill payments
                          </option>
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
                  {transactionList()}
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
              {page === "Accounts" && (
                <section className="owner-section">
                  <div className="section-heading">
                    <div>
                      <h2>Owners</h2>
                      <p>
                        Assign accounts and map sign-in emails. Sheet access is
                        required separately.
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={stale || syncing || saving}
                      onClick={() => open("owners")}
                    >
                      <Plus size={16} /> Add owner
                    </button>
                  </div>
                  <div className="entity-grid">
                    {allOwners(data.settings).map((owner) => (
                      <article className="card entity-card" key={owner.id}>
                        <span className="chip">{owner.status}</span>
                        <h3>{owner.name}</h3>
                        <p>
                          {(owner.emails || []).join(", ") ||
                            "No sign-in email assigned"}
                        </p>
                        <small>
                          {
                            data.accounts.filter(
                              (account) =>
                                account.status === "Active" &&
                                accountOwners(
                                  account,
                                  allOwners(data.settings),
                                ).includes(owner.id),
                            ).length
                          }{" "}
                          accounts
                        </small>
                        <div className="entity-actions">
                          <button
                            disabled={stale || syncing || saving}
                            onClick={() => open("owners", owner)}
                          >
                            <Pencil size={14} /> Edit owner
                          </button>
                          <button
                            disabled={stale || syncing || saving}
                            onClick={() =>
                              action(
                                "owners",
                                owner.status === "Active"
                                  ? "delete"
                                  : "restore",
                                owner,
                              )
                            }
                          >
                            {owner.status === "Active"
                              ? "Remove owner"
                              : "Restore owner"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
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
                  history={data.transactions.filter((r) =>
                    belongsToOwner(
                      r,
                      person,
                      data.accounts,
                      allOwners(data.settings),
                    ),
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
                            allOwners(data.settings)
                              .filter((owner) => owner.name === person)
                              .some((owner) =>
                                ownerEmails(owner).includes(
                                  String(r.actor).toLowerCase(),
                                ),
                              )),
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
                    "Owner Comparison Report",
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
                      {[...ownerNames, "Combined"].map((p) => (
                        <option key={p} value={p}>
                          {p === "Combined" ? "All" : p}
                        </option>
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
                        <option key={p} value={p}>
                          {p === "Combined" ? "All" : p}
                        </option>
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
                      mutate(
                        "settings",
                        data.settings.some(
                          (row) => row.kind !== "owner" && row.kind !== "loan",
                        )
                          ? "edit"
                          : "create",
                        {
                          ...data.settings.find(
                            (row) =>
                              row.kind !== "owner" && row.kind !== "loan",
                          ),
                          name: "Household preferences",
                          theme,
                          person,
                          period,
                        },
                      )
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
            <span>Your shared space</span>
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
              <fieldset
                className="form-grid"
                disabled={saving || !!modal.pending}
              >
                {modal.entity === "transactions" ? (
                  <>
                    <AmountField value={modal.record.amount} />
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
                      onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                        setModal({
                          ...modal,
                          record: { ...modal.record, type: event.target.value },
                        })
                      }
                      options={["Expense", "Income", "Investment", "Transfer"]}
                    />
                    {modal.record.type === "Expense" && (
                      <Select
                        label="Expense timing"
                        required
                        name="expenseMode"
                        onChange={(
                          event: React.ChangeEvent<HTMLSelectElement>,
                        ) =>
                          setModal({
                            ...modal,
                            record: {
                              ...modal.record,
                              expenseMode: event.target.value,
                            },
                          })
                        }
                        value={modal.record.expenseMode || "Debit"}
                        options={[
                          {
                            value: "Debit",
                            label: "Debit · immediate expense",
                          },
                          { value: "Credit", label: "Credit Card · pay later" },
                        ]}
                      />
                    )}
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

                    {!(
                      modal.record.type === "Expense" &&
                      modal.record.expenseMode === "Credit"
                    ) && (
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
                    )}
                    <Select
                      label="From account"
                      name="account"
                      onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                        setModal({
                          ...modal,
                          record: {
                            ...modal.record,
                            account: event.target.value,
                            creditCardId: "",
                          },
                        })
                      }
                      value={
                        data.accounts.find(
                          (account) =>
                            account.id === modal.record.account ||
                            account.name === modal.record.account,
                        )?.id || ""
                      }
                      options={ledgerAccountOptions}
                      required
                    />
                    <Select
                      label="To account"
                      name="toAccount"
                      value={
                        data.accounts.find(
                          (account) =>
                            account.id === modal.record.toAccount ||
                            account.name === modal.record.toAccount,
                        )?.id || ""
                      }
                      options={ledgerAccountOptions}
                      disabled={modal.record.type !== "Transfer"}
                      required={modal.record.type === "Transfer"}
                    />
                    {modal.record.type === "Expense" &&
                      modal.record.expenseMode === "Credit" && (
                        <>
                          <Select
                            key={modal.record.account + "-card"}
                            label="Credit card"
                            name="creditCardId"
                            value={modal.record.creditCardId}
                            options={(
                              data.accounts.find(
                                (account) =>
                                  account.id === modal.record.account ||
                                  account.name === modal.record.account,
                              )?.creditCards || []
                            ).map((card: any) => ({
                              value: card.id,
                              label: card.name,
                            }))}
                            required
                          />
                          <p className="credit-help">
                            Manage card names in Accounts → Edit account →
                            Credit cards.
                          </p>
                        </>
                      )}
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
                    ) : modal.entity === "owners" ? (
                      <>
                        <Field
                          label="Sign-in email addresses"
                          name="emails"
                          value={(modal.record.emails || []).join(", ")}
                          placeholder="name@example.com, another@example.com"
                        />
                        <p className="owner-help">
                          Each email maps to one owner and must already have
                          access to the Budget Sheet. Adding an email here does
                          not share the Sheet.
                        </p>
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
                        <CreditCardEditor
                          value={modal.record.creditCards || []}
                        />
                        <Field
                          label="Opening balance (₹)"
                          name="openingBalance"
                          type="number"
                          step="0.01"
                          value={modal.record.openingBalance}
                        />
                        <fieldset className="owner-choices">
                          <legend>Account owners</legend>
                          {owners.map((owner) => (
                            <label key={owner.id}>
                              <input
                                type="checkbox"
                                name="ownerIds"
                                value={owner.id}
                                defaultChecked={accountOwners(
                                  modal.record,
                                  allOwners(data.settings),
                                ).includes(owner.id)}
                              />
                              {owner.name}
                            </label>
                          ))}
                        </fieldset>
                        <Field
                          label="Description"
                          name="description"
                          value={modal.record.description}
                        />
                      </>
                    ) : (
                      <>
                        <AmountField
                          label={
                            modal.entity === "goals"
                              ? "Target amount (₹)"
                              : "Amount (₹)"
                          }
                          value={modal.record.amount}
                        />
                        {modal.entity !== "recurring" && (
                          <Select
                            label="Person"
                            name="person"
                            value={modal.record.person}
                            options={[
                              ...ownerNames,
                              { value: "Combined", label: "All" },
                            ]}
                          />
                        )}
                        {modal.entity === "recurring" &&
                          modal.record.type === "Expense" && (
                            <Select
                              label="Expense timing"
                              required
                              name="expenseMode"
                              onChange={(
                                event: React.ChangeEvent<HTMLSelectElement>,
                              ) =>
                                setModal({
                                  ...modal,
                                  record: {
                                    ...modal.record,
                                    expenseMode: event.target.value,
                                  },
                                })
                              }
                              value={modal.record.expenseMode || "Debit"}
                              options={[
                                {
                                  value: "Debit",
                                  label: "Debit · immediate expense",
                                },
                                {
                                  value: "Credit",
                                  label: "Credit Card · pay later",
                                },
                              ]}
                            />
                          )}
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
                            {!(
                              modal.record.type === "Expense" &&
                              modal.record.expenseMode === "Credit"
                            ) && (
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
                            )}
                            <Select
                              label="From account"
                              name="account"
                              onChange={(
                                event: React.ChangeEvent<HTMLSelectElement>,
                              ) =>
                                setModal({
                                  ...modal,
                                  record: {
                                    ...modal.record,
                                    account: event.target.value,
                                    creditCardId: "",
                                  },
                                })
                              }
                              value={
                                data.accounts.find(
                                  (account) =>
                                    account.id === modal.record.account ||
                                    account.name === modal.record.account,
                                )?.id || ""
                              }
                              options={ledgerAccountOptions}
                              required
                            />
                            <Select
                              label="To account"
                              name="toAccount"
                              value={
                                data.accounts.find(
                                  (account) =>
                                    account.id === modal.record.toAccount ||
                                    account.name === modal.record.toAccount,
                                )?.id || ""
                              }
                              options={ledgerAccountOptions}
                              disabled={modal.record.type !== "Transfer"}
                              required={modal.record.type === "Transfer"}
                            />
                            {modal.record.type === "Expense" &&
                              modal.record.expenseMode === "Credit" && (
                                <>
                                  <Select
                                    key={modal.record.account + "-card"}
                                    label="Credit card"
                                    name="creditCardId"
                                    value={modal.record.creditCardId}
                                    options={(
                                      data.accounts.find(
                                        (account) =>
                                          account.id === modal.record.account ||
                                          account.name === modal.record.account,
                                      )?.creditCards || []
                                    ).map((card: any) => ({
                                      value: card.id,
                                      label: card.name,
                                    }))}
                                    required
                                  />
                                  <p className="credit-help">
                                    Manage card names in Accounts → Edit account
                                    → Credit cards.
                                  </p>
                                </>
                              )}
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
                              onChange={(
                                event: React.ChangeEvent<HTMLSelectElement>,
                              ) =>
                                setModal({
                                  ...modal,
                                  record: {
                                    ...modal.record,
                                    type: event.target.value,
                                  },
                                })
                              }
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
              </fieldset>
              {modal.pending && !saving && (
                <p className="pending-save-help">
                  Your entries are kept. Retry checks the same save with Google
                  Sheets; the fields stay locked until it is confirmed. You can
                  also cancel.
                </p>
              )}
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
                  disabled={saving}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button className="primary" disabled={saving || syncing}>
                  {saving
                    ? "Saving…"
                    : syncing
                      ? "Reconnecting…"
                      : modal.pending
                        ? "Retry save"
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
              {detail.date} ·{" "}
              {detail.person === "Combined" ? "All" : detail.person} ·{" "}
              {detail.tag}
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
function Select({
  label,
  name,
  value,
  options,
  required,
  disabled,
  onChange,
}: any) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        name={name}
        defaultValue={value || ""}
        required={required}
        disabled={disabled}
        onChange={onChange}
      >
        <option value="">Select…</option>
        {options.map((o: any) => (
          <option
            key={typeof o === "string" ? o : o.value}
            value={typeof o === "string" ? o : o.value}
          >
            {typeof o === "string" ? (o === "Combined" ? "All" : o) : o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
