import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISO(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Date entry, tuned per device.
 *
 * On a phone the native control is the right answer: it is the only picker with
 * a familiar mobile keyboard and wheel, and reimplementing it would be worse.
 * On a desktop the native control shows a cramped dd/mm/yyyy strip with a small
 * calendar icon, so there this renders a full calendar instead.
 */
export function DatePicker({
  id, value, onChange, placeholder = 'Выберите дату', disabled, className,
}: DatePickerProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isDesktop) {
    return (
      <input
        id={id}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:light_dark]',
          className
        )}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          value ? 'text-foreground' : 'text-muted-foreground',
          className
        )}
      >
        <span>{value ? formatRussian(value) : placeholder}</span>
        <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <CalendarPanel value={value} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function formatRussian(iso: string): string {
  const date = parseISO(iso);
  if (!date) return iso;
  return `${date.getDate()} ${MONTHS[date.getMonth()].toLowerCase()} ${date.getFullYear()}`;
}

function CalendarPanel({
  value, onChange, onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const selected = parseISO(value);
  // Defaults to today when nothing is chosen yet, so the user opens on the
  // relevant month instead of January.
  const [view, setView] = useState(() => selected ?? new Date());

  const grid = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const first = new Date(year, month, 1);
    // getDay() is 0 for Sunday; the week starts on Monday here.
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = Array(offset).fill(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));

    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const today = new Date();
  const todayIso = toISODate(today);

  return (
    <div
      role="dialog"
      aria-label="Выбор даты"
      className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Предыдущий месяц"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          className="rounded-md p-1.5 hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </span>
        <button
          type="button"
          aria-label="Следующий месяц"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          className="rounded-md p-1.5 hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} />;
          const iso = toISODate(date);
          const isSelected = value === iso;
          const isToday = todayIso === iso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => { onChange(iso); onClose(); }}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              className={cn(
                'h-9 rounded-md text-sm transition-colors hover:bg-accent',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
                !isSelected && isToday && 'font-semibold text-primary ring-1 ring-inset ring-primary/40',
                !isSelected && !isToday && 'text-foreground'
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between border-t pt-2">
        <button
          type="button"
          onClick={() => { onChange(todayIso); onClose(); }}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Сегодня
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); onClose(); }}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Очистить
          </button>
        )}
      </div>
    </div>
  );
}