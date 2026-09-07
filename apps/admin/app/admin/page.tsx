export default function AdminHomePage() {
  return (
    <main className="shell">
      <p className="eyebrow">Aisenhub Admin</p>
      <h1>Admin-only foundation</h1>
      <p className="muted">
        Authentication, MFA and platform operations are reserved for later M0/M2
        tasks.
      </p>
      <div className="panel">
        <strong>Protected shell placeholder</strong>
        <span>Authorization is not implemented in T02.</span>
      </div>
    </main>
  );
}
