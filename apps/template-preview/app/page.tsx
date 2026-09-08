export default function TemplatePreviewPage() {
  return (
    <main className="shell">
      <p className="eyebrow">Template Preview</p>
      <h1>Consumer application shell</h1>
      <p className="muted">
        This independent app exercises a same-origin BFF that calls the packaged
        server SDK. Platform credentials remain server-only.
      </p>
      <nav className="actions" aria-label="Consumer flows">
        <a className="link" href="/pricing">
          View public pricing
        </a>
        <a className="link" href="/login">
          Sign in
        </a>
        <a className="link" href="/subscription">
          Subscription & redeem
        </a>
        <a className="link" href="/account">
          Account settings
        </a>
      </nav>
    </main>
  );
}
