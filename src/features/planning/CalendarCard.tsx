import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button, Card } from "../../components/ui";
import { countPerDay, entriesOnDay, monthGrid, shiftMonth, shortTime, weekdayIndex, type CalendarEntry } from "../../lib/calendar";
import { formatMonthLong, monthKey, monthStart, todayIso } from "../../lib/dates";
import { de } from "../../lib/de";
import { mapDbError } from "../../lib/errors";
import { formatDate } from "../../lib/money";
import { useCalendar, useDeleteAppointment } from "./api";
import { AppointmentForm } from "./AppointmentForm";

const t = de.cal;

function countText(n: number): string {
  if (n === 0) return t.noEntries;
  return n === 1 ? t.entryOne : t.entries.replace("{n}", String(n));
}

function EntryRow({ entry, onEdit, onDelete }: { entry: CalendarEntry; onEdit: () => void; onDelete: () => void }) {
  const time = entry.start_time
    ? `${shortTime(entry.start_time)}${entry.end_time ? `–${shortTime(entry.end_time)}` : ""}`
    : t.allDay;
  const multiDay = entry.end_date !== entry.start_date;
  return (
    <li className="space-y-1 border-b border-neutral-100 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{entry.title}</span>
        <Badge tone={entry.kind === "appointment" ? "info" : "neutral"}>{t.kinds[entry.kind]}</Badge>
      </div>
      <p className="text-sm text-neutral-600">
        {time}
        {multiDay ? ` · ${formatDate(entry.start_date)} ${t.until.replace("{d}", formatDate(entry.end_date))}` : ""}
        {entry.location ? ` · ${entry.location}` : ""}
      </p>
      {entry.notes ? <p className="whitespace-pre-line text-sm text-neutral-700">{entry.notes}</p> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {entry.kind === "appointment" ? (
          <>
            <Button variant="secondary" className="min-h-11" onClick={onEdit}>
              {t.edit}
            </Button>
            <Button variant="secondary" className="min-h-11" onClick={onDelete}>
              {t.delete}
            </Button>
          </>
        ) : null}
        {entry.kind === "job" && entry.job_id ? (
          <Link className="inline-flex min-h-11 items-center text-sm font-medium underline" to={`/jobs?job=${entry.job_id}`}>
            {t.openJob}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** Month calendar with the entries of the selected day below it. */
export function CalendarCard() {
  const today = todayIso();
  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState(today);
  const [form, setForm] = useState<{ entry?: CalendarEntry } | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const remove = useDeleteAppointment();

  const weeks = useMemo(() => monthGrid(month), [month]);
  const days = useMemo(() => weeks.flat(), [weeks]);
  const calendar = useCalendar(days[0], days[days.length - 1]);
  const entries = calendar.data ?? [];
  const counts = useMemo(() => countPerDay(entries, days), [entries, days]);
  const dayEntries = entriesOnDay(entries, selected);

  function go(next: string) {
    setMonth(next);
    // Keep the selection inside the visible month so the list never shows a hidden day.
    setSelected(next === monthKey(today) ? today : monthStart(next));
  }

  async function onDelete(entry: CalendarEntry) {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await remove.mutateAsync(entry.id);
      setNotice({ tone: "success", text: t.deleted });
    } catch (error) {
      setNotice({ tone: "error", text: mapDbError(error) });
    }
  }

  return (
    <Card title={t.title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" className="min-w-11 px-3" aria-label={t.prev} onClick={() => go(shiftMonth(month, -1))}>
            ‹
          </Button>
          <h3 className="min-w-36 px-2 text-center font-medium" aria-live="polite">
            {formatMonthLong(monthStart(month))}
          </h3>
          <Button variant="secondary" className="min-w-11 px-3" aria-label={t.next} onClick={() => go(shiftMonth(month, 1))}>
            ›
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => go(monthKey(today))}>
            {t.today}
          </Button>
          <Button onClick={() => setForm({})}>{t.newAppointment}</Button>
        </div>
      </div>

      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {calendar.isError ? (
        <div className="space-y-3">
          <Alert tone="error">{t.loadError}</Alert>
          <Button variant="secondary" onClick={() => void calendar.refetch()}>
            {de.common.retry}
          </Button>
        </div>
      ) : null}

      <div role="group" aria-label={t.gridLabel} className="mt-3">
        <div className="grid grid-cols-7 text-center text-xs font-medium text-neutral-600">
          {t.weekdays.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const inMonth = monthKey(day) === month;
            const isSelected = day === selected;
            const n = counts.get(day) ?? 0;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={isSelected}
                aria-current={day === today ? "date" : undefined}
                aria-label={`${t.weekdaysLong[weekdayIndex(day)]}, ${formatDate(day)}: ${countText(n)}`}
                onClick={() => setSelected(day)}
                className={`flex min-h-12 flex-col items-center justify-start rounded-lg px-1 py-1 text-sm ${
                  isSelected ? "bg-brand text-white" : inMonth ? "bg-neutral-50 hover:bg-neutral-100" : "text-neutral-500 hover:bg-neutral-50"
                } ${day === today && !isSelected ? "ring-2 ring-brand" : ""}`}
              >
                <span className="tabular-nums">{Number(day.slice(8, 10))}</span>
                {n > 0 ? (
                  <span aria-hidden="true" className="mt-0.5 flex gap-0.5">
                    {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                      <span key={i} className={`size-1.5 rounded-full ${isSelected ? "bg-white" : "bg-brand"}`} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5" aria-live="polite">
        <h3 className="font-medium">{t.dayTitle.replace("{d}", formatDate(selected))}</h3>
        {calendar.isLoading ? <p role="status">{de.common.loading}</p> : null}
        {calendar.data && dayEntries.length === 0 ? <p className="mt-2 text-sm text-neutral-600">{t.emptyDay}</p> : null}
        <ul>
          {dayEntries.map((entry) => (
            <EntryRow key={`${entry.kind}-${entry.id}`} entry={entry} onEdit={() => setForm({ entry })} onDelete={() => void onDelete(entry)} />
          ))}
        </ul>
      </div>

      {form ? (
        <AppointmentForm
          initial={form.entry}
          defaultDate={selected}
          onClose={() => setForm(null)}
          onSaved={(text) => {
            setForm(null);
            setNotice({ tone: "success", text });
          }}
        />
      ) : null}
    </Card>
  );
}
