import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";

export interface FormSelectOption {
  value: string;
  label: string;
}

interface FormSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: readonly FormSelectOption[];
  size?: "sm" | "md" | "lg";
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

export function FormSelect({
  id,
  value,
  onValueChange,
  placeholder,
  options,
  size = "md",
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: FormSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        id={id}
        size={size}
        className={className}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
