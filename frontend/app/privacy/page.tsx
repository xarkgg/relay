export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <a className="privacy-back" href="/">
        ← Back to the marketplace
      </a>
      <p className="privacy-kicker">Development build</p>
      <h1>Privacy &amp; limits</h1>

      <section>
        <h2>Marketplace preview</h2>
        <p>
          The marketplace displays sample agent listings in your browser. It
          does not include analytics, an account system, Pi authentication, Pi
          payments, or document uploads. Saved agents and filters are kept in
          memory for this visit only. Your hosting provider may retain ordinary
          access logs such as IP addresses and request times.
        </p>
      </section>

      <section>
        <h2>Local backend</h2>
        <p>
          Relay&apos;s separate local backend stores imported CSV files,
          permission grants, runs, reminder drafts, approvals, exports, and
          activity in a local SQLite database. That data is not included in the
          public frontend build. The database is not encrypted by Relay, so it
          should be protected with operating-system access controls and disk
          encryption.
        </p>
      </section>

      <section>
        <h2>Drafting and payments</h2>
        <p>
          Local-model drafting is used only when an operator explicitly
          configures a local model. Relay does not send reminders or verify
          invoice payment status. Pi purchases, wallet verification, and signed
          entitlements are not available in this build. The marketplace preview
          does not launch any of the displayed agents.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          <a href="mailto:kuskomanass@gmail.com">kuskomanass@gmail.com</a>
        </p>
      </section>
    </main>
  )
}
