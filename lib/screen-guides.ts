export type GuideStep = {
  title: string;
  body: string;
  example: string[];
  target?: string;
  targetLabel?: string;
};
export type ScreenGuide = {
  intro: string;
  steps: GuideStep[];
  check: { question: string; options: string[]; answer: number; why: string };
};
const step = (
  title: string,
  body: string,
  example: string[],
  target?: string,
  targetLabel?: string,
): GuideStep => ({ title, body, example, target, targetLabel });
export const screenGuides: Record<string, ScreenGuide> = {
  Welcome: {
    intro: "A quick introduction to your shared financial space.",
    steps: [
      step(
        "Sign in securely",
        "Use a Google email assigned to an active owner who also has access to the Budget Sheet.",
        ["Google sign-in", "Owner mapping", "Sheet access"],
        ".auth-card .primary",
        "Sign-in button",
      ),
      step(
        "One shared source",
        "Google Sheets holds the financial records. Your device can show a labelled read-only cache while offline.",
        [
          "Online: sync and edit",
          "Offline: view cached data",
          "Reconnect before editing",
        ],
      ),
      step(
        "You stay in control",
        "Bill scans and statement imports create previews. Review them before confirming any new transactions.",
        ["Upload", "Review", "Confirm"],
      ),
    ],
    check: {
      question: "Does uploading a bill immediately change your expenses?",
      options: ["Yes, automatically", "No, review and confirm first"],
      answer: 1,
      why: "Uploading or scanning never writes financial records by itself.",
    },
  },
  Dashboard: {
    intro: "See where your money stands and explore the records behind it.",
    steps: [
      step(
        "Choose your view",
        "Select an owner and account. All includes the shared household view; account balances stay independent of reporting dates.",
        ["Owner → account", "Current cash balance", "Choose report dates"],
        ".filter-bar",
        "Owner and date controls",
      ),
      step(
        "Understand the totals",
        "Current Balance comes from opening balances and Sheet transactions. Income, spending and savings cards use your reporting period.",
        [
          "Balance: current funds",
          "Expenses: paid cash costs",
          "Savings: income less expenses",
        ],
        ".stats-grid",
        "Dashboard totals",
      ),
      step(
        "Follow the detail",
        "Expand Cash-flow details for ledger cash and owner comparisons. Click summaries to explore transactions. Analyze my finances opens an owner or All owners review with spending insights and a savings calculator; confirm the summary before sending it to your saved AI. Back returns to the previous screen.",
        ["Summary", "Transactions", "Back to your view"],
        ".stats-grid",
        "Clickable summaries",
      ),
    ],
    check: {
      question:
        "Will changing a report’s date range change the current account balance?",
      options: ["Yes", "No"],
      answer: 1,
      why: "Current balances use the full ledger; report cards use the selected dates.",
    },
  },
  Transactions: {
    intro: "Find, add and review the movements in your accounts.",
    steps: [
      step(
        "Find a transaction",
        "Search merchants, notes, tags or accounts. Sort the list and open Filters for amounts, payment methods, receipts and transaction types.",
        ["Search", "Filter", "Sort"],
        ".transaction-toolbar",
        "Search, sorting and filters",
      ),
      step(
        "Record money correctly",
        "From account is required. Debit expenses affect cash now; credit card purchases stay deferred. Transfers need a destination account.",
        [
          "Debit: cash now",
          "Credit card: pay later",
          "Transfer: between accounts",
        ],
        ".greeting .primary",
        "Add transaction",
      ),
      step(
        "Import and recover",
        "Import CSVs or scan bill images into an editable preview. Recently deleted holds recoverable transactions; receipt actions are inside transaction details.",
        ["Preview before saving", "Review duplicates", "Restore when needed"],
        ".card-heading .row-actions",
        "Import, export and recovery",
      ),
    ],
    check: {
      question: "Which account does a transaction belong to?",
      options: ["From account", "To account"],
      answer: 0,
      why: "From account owns the ledger entry. To account is used for transfers.",
    },
  },
  "Credit Card Bills": {
    intro:
      "Separate billed and unbilled purchases, then record payments safely.",
    steps: [
      step(
        "Set up your billing cycle",
        "In Accounts, edit a card’s statement day and due day. The app estimates billed, unbilled and overdue groups from these dates.",
        [
          "Statement closes",
          "Payment due",
          "Dates can differ from bank posting",
        ],
        ".cycle-summary",
        "Billing-cycle filters",
      ),
      step(
        "Review the charges",
        "Pick the account and card. Imported purchases with unknown settlement need your confirmation that they remain unpaid.",
        [
          "Choose card",
          "Deselect already-paid items",
          "Confirm unknown purchases",
        ],
        ".credit-charge-list",
        "Charge selection",
      ),
      step(
        "Record all or part of a bill",
        "Choose the paying account and the amount already paid at the bank. Partial payments are allocated oldest-first; the remainder stays outstanding.",
        ["Purchase ₹1,000", "Record payment ₹400", "Still unpaid ₹600"],
        ".credit-pay-action",
        "Record a payment",
      ),
    ],
    check: {
      question: "Does recording a card payment send money to your bank?",
      options: ["Yes", "No, it records a payment you made"],
      answer: 1,
      why: "The app updates your ledger; it does not initiate a bank payment.",
    },
  },
  "Loan Tracker": {
    intro: "Track actual repayments and explore a possible payoff plan.",
    steps: [
      step(
        "Set the starting point",
        "Add the original principal, rate and amounts paid before tracking. Opening totals do not create new bank transactions.",
        ["Original principal", "Already-paid totals", "Linked account"],
        ".loan-tracker .section-heading",
        "Loan controls",
      ),
      step(
        "Record actual repayments",
        "Pay loan records the paying account and actual principal/interest split. Principal reduces the debt; interest is an expense.",
        ["Payment ₹10,000", "Principal ₹7,000", "Interest ₹3,000"],
        ".loan-card .row-actions",
        "Loan actions",
      ),
      step(
        "Explore without changing data",
        "Open Payoff forecast to compare extra monthly payments or a one-time prepayment. Estimates and schedules do not record repayments.",
        [
          "Change a scenario",
          "Compare payoff and interest",
          "No ledger writes",
        ],
        ".loan-card .feature-details",
        "Payoff forecast",
      ),
    ],
    check: {
      question: "Does a forecast prepayment reduce the recorded loan balance?",
      options: ["Yes", "No, only an actual repayment does"],
      answer: 1,
      why: "Forecasts are scenarios; recorded loan payments change your balance.",
    },
  },
  "Expense Analytics": {
    intro:
      "Understand categories and patterns in the selected reporting period.",
    steps: [
      step(
        "Set the scope",
        "Choose an owner and report dates before comparing spending. These filters describe the charts, not the current bank balances.",
        ["Owner", "Reporting period", "Category breakdown"],
        ".filter-bar",
        "Report filters",
      ),
      step(
        "Explore the breakdown",
        "Review category, merchant and timing patterns, or choose Analyze my finances for an interactive owner or All owners AI review. Review fresh totals and confirm before sending the summary.",
        ["Category", "Pattern", "Matching records"],
        ".section-heading",
        "Analytics overview",
      ),
      step(
        "Keep comparisons in context",
        "Incomplete statements and unknown categories can change the picture. Review transaction tags when a category looks unexpected.",
        ["Check coverage", "Review tags", "Compare like periods"],
      ),
    ],
    check: {
      question: "What should you check before comparing two spending totals?",
      options: ["The date range and owner scope", "Only the chart colour"],
      answer: 0,
      why: "Scope and date coverage determine what each total includes.",
    },
  },
  Investments: {
    intro:
      "View your connected HDFC holdings and explore Sheet investment contributions.",
    steps: [
      step(
        "Separate contributions from value",
        "The HDFC section shows your signed-in broker connection at returned closing prices. Sheet contribution charts below use the selected owner, account and dates; contributions are not portfolio value.",
        [
          "Contribution: cash invested",
          "HDFC: broker holdings",
          "Connect in Settings",
        ],
        ".hdfc-portfolio",
        "Investment overview",
      ),
      step(
        "Review contribution categories",
        "Search and sort the allocation categories, then click a category to review its underlying transactions.",
        ["Find a category", "Review contributions", "Open matching records"],
        ".breakdown",
        "Investment categories",
      ),
      step(
        "Use goals for a purpose",
        "A financial goal can track investing, a purchase or a savings target. Funding a goal does not itself create an investment transaction.",
        ["Target", "Progress", "Related contributions"],
      ),
    ],
    check: {
      question:
        "Is money contributed the same as today’s investment market value?",
      options: ["Always", "No"],
      answer: 1,
      why: "Contributions and current market value are different measures.",
    },
  },
  "Income & Cash Flow": {
    intro:
      "Understand income, spending and the cash moving through your accounts.",
    steps: [
      step(
        "Choose dates and accounts",
        "Use the owner and report-date controls to set the cash-flow period.",
        ["Owner scope", "Report dates", "Recorded movements"],
        ".filter-bar",
        "Cash-flow filters",
      ),
      step(
        "Read cash and savings separately",
        "Loan principal and investment contributions can reduce cash without being everyday expenses. Credit purchases affect cash when their bills are paid.",
        ["Income", "Cash outflows", "Net cash change"],
        ".stats-grid",
        "Cash-flow totals",
      ),
      step(
        "Check the ledger",
        "If a total is unexpected, review transactions and reconcile against the statement’s book balance.",
        ["Review transactions", "Check transfers", "Reconcile in Accounts"],
      ),
    ],
    check: {
      question: "Can cash fall because of a principal repayment?",
      options: ["Yes", "No"],
      answer: 0,
      why: "Principal repayment reduces cash and debt; only the interest portion is an expense.",
    },
  },
  Accounts: {
    intro: "Manage bank accounts, owners, cards and statement comparisons.",
    steps: [
      step(
        "Organize accounts and owners",
        "An owner can have several accounts, and an account can have several owners. Approved owner emails still require Sheet access to sign in.",
        ["Owners ↔ accounts", "Email mapping", "Sheet permission"],
        ".owner-section",
        "Owner settings",
      ),
      step(
        "Configure cards",
        "Edit an account to add card names and billing days. Keep card identities stable so purchases retain their links.",
        ["Card name", "Statement day", "Due day"],
        ".entity-grid",
        "Accounts and card settings",
      ),
      step(
        "Reconcile a statement",
        "Enter the statement date and book balance. A comparison shows differences and possible duplicates without creating balancing expenses.",
        [
          "Statement book balance",
          "Ledger at that date",
          "Investigate the difference",
        ],
        ".feature-details",
        "Reconciliation panel",
      ),
    ],
    check: {
      question:
        "Does saving a reconciliation automatically adjust your transactions?",
      options: ["Yes", "No"],
      answer: 1,
      why: "Comparisons are saved separately and never invent balance adjustments.",
    },
  },
  "Expense Tags": {
    intro: "Keep a consistent set of categories for transactions and budgets.",
    steps: [
      step(
        "Use existing tags",
        "Transactions select tags from this list. Search and filter by type to find a category before adding another.",
        ["Search first", "Choose a type", "Avoid duplicates"],
        ".entity-grid",
        "Tag list",
      ),
      step(
        "Keep history connected",
        "Renaming a tag preserves its identity. Archiving hides it from new choices while retaining historical records.",
        ["Rename", "Archive", "Preserve history"],
        ".section-heading",
        "Tag controls",
      ),
      step(
        "Make budgets useful",
        "One monthly budget can include several expense tags. A matching purchase is counted once within that budget.",
        ["Groceries + Dining", "One spending limit", "No duplicate counting"],
      ),
    ],
    check: {
      question: "Do you need a separate budget for every tag?",
      options: ["Yes", "No, choose multiple tags"],
      answer: 1,
      why: "A budget can group multiple expense tags under one limit.",
    },
  },
  Budgets: {
    intro:
      "Set monthly limits for the categories and accounts that matter to you.",
    steps: [
      step(
        "Choose a month",
        "Review any month independently of dashboard dates. Repeating budgets reset their spending each calendar month.",
        ["Pick month", "Set a limit", "Repeat if useful"],
        ".monthly-budgets .section-heading",
        "Month and budget controls",
      ),
      step(
        "Group expense tags",
        "Choose all expense tags or select several. Each matching transaction counts once per budget, including card purchases when they occur.",
        [
          "Groceries + Dining",
          "One transaction → one count",
          "Card payments excluded",
        ],
        ".monthly-budgets .entity-grid",
        "Budget cards",
      ),
      step(
        "Watch the remaining limit",
        "Sort by usage or amount remaining. Overlapping budgets can count the same purchase in different limits, so compare each budget’s scope.",
        ["On track", "Near limit", "Over budget"],
        ".monthly-budgets .mini-stats",
        "Budget summary",
      ),
    ],
    check: {
      question:
        "Does paying a credit card bill count the same purchase in a budget again?",
      options: ["Yes", "No"],
      answer: 1,
      why: "Budgets count the original purchase and exclude linked bill payments.",
    },
  },
  "Financial Goals": {
    intro: "Track a purpose for your money—not just investments or net worth.",
    steps: [
      step(
        "Name your target",
        "Use goals for an emergency fund, purchase, investment target or debt-payoff milestone. Set a target amount and date.",
        ["Emergency reserve", "A planned purchase", "Investment milestone"],
        ".section-heading",
        "Goal controls",
      ),
      step(
        "Track progress honestly",
        "Funded amounts are progress you enter. They do not move bank cash or automatically earmark funds.",
        ["Target amount", "Recorded funded amount", "Remaining target"],
        ".entity-grid",
        "Goal progress",
      ),
      step(
        "Connect goals with your plan",
        "Use monthly contributions to estimate time to target, and record real cash movements in Transactions.",
        ["Monthly contribution", "Estimated timeline", "Actual transactions"],
      ),
    ],
    check: {
      question: "Must every financial goal be an investment?",
      options: ["Yes", "No"],
      answer: 1,
      why: "Goals can represent savings, purchases, investing or other financial milestones.",
    },
  },
  "Recurring Transactions": {
    intro:
      "Prepare repeat transactions and explicitly run the schedules that are due.",
    steps: [
      step(
        "Create a schedule",
        "Choose the amount, account, tag, frequency and next date. Check the details before enabling a schedule.",
        ["Amount and account", "Frequency", "Next date"],
        ".section-heading",
        "Schedule controls",
      ),
      step(
        "Run due items",
        "Run due schedules writes the scheduled transactions to Google Sheets. Nothing runs automatically while this site is closed.",
        ["Review due dates", "Run due schedules", "Sheet confirmation"],
        ".recurring-run",
        "Run schedules",
      ),
      step(
        "Pause when plans change",
        "Use the schedule status to pause or end future occurrences. Existing transactions remain in the ledger.",
        ["Active", "Paused", "Ended"],
        ".entity-grid",
        "Scheduled records",
      ),
    ],
    check: {
      question: "Will a schedule run while the app is closed?",
      options: ["Yes", "No"],
      answer: 1,
      why: "Schedules execute only when you explicitly run due schedules in the app.",
    },
  },
  "Audit History": {
    intro: "See the recorded changes to your shared financial data.",
    steps: [
      step(
        "Find the change",
        "Use search, owner/date scope and audit filters to locate a change.",
        ["Who", "What", "When"],
        ".filter-bar",
        "History scope",
      ),
      step(
        "Read before and after",
        "Expand an event to compare old and new values. Successful writes are recorded with their operation identity.",
        ["Old values", "New values", "Changed fields"],
        ".timeline",
        "Audit events",
      ),
      step(
        "Recover in the right place",
        "Use Recently deleted in Transactions or Settings to restore records. The audit history itself remains a history of actions.",
        ["Inspect the event", "Restore the record", "Keep the audit trail"],
      ),
    ],
    check: {
      question: "Where do you restore a deleted record?",
      options: ["By editing the audit log", "In Recently deleted / recovery"],
      answer: 1,
      why: "Recovery restores the record through validation and records a new audit event.",
    },
  },
  Reports: {
    intro: "Export the records and summaries that match your selected scope.",
    steps: [
      step(
        "Set the reporting scope",
        "Choose owner and dates first. Report amounts use that scope, and incomplete statement coverage remains incomplete.",
        ["Owner", "Date range", "Available records"],
        ".filter-bar",
        "Report scope",
      ),
      step(
        "Choose an export",
        "Pick the report and the offered CSV, spreadsheet or PDF export. Treat downloaded files as private financial information.",
        ["Choose report", "Choose format", "Download"],
        ".report-grid",
        "Report choices",
      ),
      step(
        "Keep the source clear",
        "Exports are snapshots. They are not restored as a local source of truth; the Sheet remains the shared ledger.",
        [
          "Export: snapshot",
          "Sheet: shared records",
          "Cache: read-only offline",
        ],
      ),
    ],
    check: {
      question: "Does editing a downloaded report update the app?",
      options: ["Yes", "No"],
      answer: 1,
      why: "Exports are separate snapshots and do not update the Sheet.",
    },
  },
  Settings: {
    intro:
      "Manage preferences, synchronization, recovery and integration setup.",
    steps: [
      step(
        "Personalize the app",
        "Choose your view and theme. Use Sync when you want a fresh read from Google Sheets.",
        ["Appearance", "Default view", "Sync"],
        ".settings",
        "Settings panel",
      ),
      step(
        "Recover records",
        "Open Recently deleted & archived to fetch recoverable records. Restore checks linked records and versions before saving.",
        ["Select category", "Find record", "Restore safely"],
        ".settings .feature-details",
        "Recovery panel",
      ),
      step(
        "Understand integrations",
        "Receipt files use the authenticated Google service. AI scans use a server-side API key and always need review before financial writes.",
        [
          "No API keys in browser code",
          "Review scan results",
          "Confirm changes",
        ],
      ),
    ],
    check: {
      question: "Can you edit cached financial records while offline?",
      options: ["Yes", "No, sync first"],
      answer: 1,
      why: "Offline financial data is labelled and read-only until synchronization succeeds.",
    },
  },
  Privacy: {
    intro:
      "Understand access, offline copies and the services used by Budget Tracker.",
    steps: [
      step(
        "Your data locations",
        "The Sheet stores records and Drive stores receipt files. The browser keeps a short-lived session and a read-only offline cache.",
        ["Google Sheets", "Google Drive", "Device cache"],
      ),
      step(
        "Optional AI scanning",
        "Only documents you select and submit for analysis are sent for AI extraction. Review proposed records before confirming changes.",
        ["Choose documents", "Analyze", "Review before writing"],
      ),
      step(
        "Your controls",
        "Sign out, clear device data or revoke access through Google. Ask the Sheet owner about access and household data.",
        ["Sign out", "Clear site data", "Manage Google access"],
      ),
    ],
    check: {
      question:
        "Are your financial records public just because the app uses GitHub Pages?",
      options: ["Yes", "No, data access still requires authorization"],
      answer: 1,
      why: "Public application files do not grant access to the private Sheet or Drive files.",
    },
  },
};
