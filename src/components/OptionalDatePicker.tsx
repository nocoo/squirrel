import { Button } from "@nocoo/basalt";
import { DatePicker } from "@nocoo/basalt/components/date-picker";
import { X } from "@nocoo/basalt/icons";
import { buildExpiryPresets } from "@/models/format";

interface OptionalDatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

export function OptionalDatePicker({
  id,
  value,
  onChange,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: OptionalDatePickerProps) {
  return (
    <div className="flex items-center gap-basalt-space-sm">
      <DatePicker
        id={id}
        value={value}
        onChange={onChange}
        locale="zh-CN"
        weekStartsOn={1}
        presets={buildExpiryPresets()}
        labels={{
          placeholder: "不设过期时间（永不过期）",
          calendar: "选择过期日期",
          previousMonth: "上个月",
          nextMonth: "下个月",
        }}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="flex-1"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="清除过期日期"
          onClick={() => onChange("")}
        >
          <X className="size-basalt-icon" strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
