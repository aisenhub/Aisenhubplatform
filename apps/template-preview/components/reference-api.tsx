export function ReferenceApiCard({
  title,
  method,
  path,
  description,
  code,
}: {
  title: string;
  method: string;
  path: string;
  description: string;
  code: string;
}) {
  return (
    <section className="consumer-card consumer-api-card">
      <div className="consumer-card-header">
        <div>
          <h2>{title}</h2>
          <p className="consumer-card-description">{description}</p>
        </div>
        <span className="consumer-api-method">{method}</span>
      </div>
      <p className="consumer-code">{path}</p>
      <pre className="consumer-api-code">
        <code>{code}</code>
      </pre>
    </section>
  );
}
