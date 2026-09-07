export default function AdminLoginPage() {
  return (
    <main className="shell">
      <p className="eyebrow">Aisenhub Admin</p>
      <h1>Sign in to the admin console</h1>
      <p className="muted">
        This is a structural shell. Live Auth and MFA are implemented by later
        tasks.
      </p>
      <form className="panel" action="/admin">
        <label htmlFor="identifier">Admin identifier</label>
        <input
          id="identifier"
          name="identifier"
          autoComplete="username"
          placeholder="admin@example.test"
        />
        <button type="submit">Continue</button>
      </form>
    </main>
  );
}
