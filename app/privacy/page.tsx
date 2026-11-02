import PageHelp from "../page-help";
export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "48px auto",
        padding: "0 24px",
        lineHeight: 1.7,
      }}
    >
      <PageHelp screen="Privacy" />
      <h1>Budget Tracker privacy policy</h1>
      <p>
        Budget Tracker is a shared household budgeting application. Google
        sign-in verifies your email, checks your access to the configured Budget
        Sheet, and matches your email to an active owner entry. Adding an owner
        in the app does not grant Google Sheet access.
      </p>
      <h2>Data and storage</h2>
      <p>
        Financial records, account ownership, owner email mappings and audit
        history are stored in the household’s Google Sheet. Bills and receipts
        are stored privately in Google Drive and managed by the household’s
        Google Apps Script receipt service. Authorized owners with Sheet access
        can view and manage shared receipts through that service.
      </p>
      <p>
        Your browser stores a short-lived Google access token and expiry to
        maintain your session, appearance preferences, and a per-account offline
        copy of confirmed Sheet data. The offline copy is marked stale when it
        cannot be refreshed and is not used for offline edits. Receipt image and
        PDF bytes are not cached for offline use.
      </p>
      <h2>Google access</h2>
      <p>
        The app uses Google account identity, Google Sheets access for reading
        and updating your budget, and file access for receipts. Google
        credentials and financial records are sent to Google services for these
        functions. GitHub Pages hosts the public application files. The app does
        not sell Google user data, use it for advertising, or transmit it to an
        analytics service.
      </p>
      <h2>Optional AI document scanning</h2>
      <p>
        The service owner can save an OpenAI API key through the Settings
        password field. It is sent over HTTPS to the authenticated Apps Script
        service and stored only in server-side Script properties. The key is
        never returned to the browser or included in financial records, offline
        caches or backups.
      </p>
      <p>
        When you choose Analyze with AI, the selected bills, images or PDFs and
        the active tag names are sent through the authenticated Google service
        to OpenAI for extraction. Your Google token, owner email and the rest of
        your ledger are not forwarded to OpenAI. The service uses a server-side
        API key and requests store:false; OpenAI’s applicable API data policies
        still apply. Extracted records are proposals until you review and
        confirm them. Source files are not automatically stored as Drive
        receipts. Screen guides do not send financial data; optional read-aloud
        uses your browser’s speech service.
      </p>
      <h2>Your controls</h2>
      <p>
        Sign out to remove the saved session credential. Clear this site’s
        browser data to remove offline copies and preferences. You can revoke
        the app’s access in your Google Account settings. Manage Sheet access
        separately in Google sharing settings; remove an owner’s email mapping
        to disable their next online app authorization. Google cannot recheck
        revoked access during an offline session, which remains limited by the
        saved token’s expiry.
      </p>
      <p>
        Deleting a receipt in the app moves its Drive file to Trash and removes
        the Sheet link after confirmation. Google Drive’s recovery and Trash
        retention rules apply. Account and owner removal retains historical
        records for audit and can be reversed. Contact the owner of your Budget
        Sheet for access, corrections, or deletion of household data.
      </p>
    </main>
  );
}
