const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

type Props = {
  value: number[];
  onChange: (value: number[]) => void;
  label: string;
};

export function WeekdayPicker({ value, onChange, label }: Props) {
  return (
    <fieldset className="weekday-picker">
      <legend>{label} (leave empty for every day)</legend>
      {weekdays.map((day) => (
        <label key={day.value}>
          <input
            type="checkbox"
            checked={value.includes(day.value)}
            onChange={(event) => onChange(
              event.target.checked
                ? [...value, day.value]
                : value.filter((weekday) => weekday !== day.value),
            )}
          />
          {day.label}
        </label>
      ))}
    </fieldset>
  );
}
