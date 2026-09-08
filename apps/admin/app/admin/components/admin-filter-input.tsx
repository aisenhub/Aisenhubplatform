type AdminFilterInputProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

export function AdminFilterInput({
  id,
  label,
  placeholder,
  value,
  onChange,
}: AdminFilterInputProps) {
  return (
    <div className="filter-control">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
      />
    </div>
  );
}
