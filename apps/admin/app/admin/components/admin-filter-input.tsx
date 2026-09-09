type AdminFilterInputProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
};

export function AdminFilterInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
}: AdminFilterInputProps) {
  return (
    <form
      className="filter-control"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="inline-form">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="search"
        />
        {onSubmit ? <button type="submit">查询</button> : null}
      </div>
    </form>
  );
}
