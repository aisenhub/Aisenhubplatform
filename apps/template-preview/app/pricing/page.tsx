export default function PricingPage() {
  return (
    <main className="shell">
      <p className="eyebrow">Public pricing</p>
      <h1>Plans are public, account data is not.</h1>
      <p className="muted">
        The production template loads plans through the same-origin BFF. It does
        not expose a Platform Key or require a user session.
      </p>
      <a className="link" href="/">
        Back to consumer shell
      </a>
    </main>
  );
}
