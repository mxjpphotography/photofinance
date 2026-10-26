import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Modal, Textarea } from "../../components/ui";
import type { CalendarEntry } from "../../lib/calendar";
import { de } from "../../lib/de";
import { mapDbError } from "../../lib/errors";
import { isValidIsoDate } from "../../lib/money";
import { useCreateAppointment, useUpdateAppointment, type AppointmentInput } from "./api";

const f = de.cal.form;

type Errors = Partial<Record<"title" | "date" | "endDate" | "time" | "location" | "notes", string>>;

interface Props {
  /** set when editing an existing appointment */
  initial?: CalendarEntry;
  /** pre-filled date for a new appointment (the selected calendar day) */
  defaultDate: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const hhmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : "");

export function AppointmentForm({ initial, defaultDate, onClose, onSaved }: Props) {
  const create = useCreateAppointment();
  const update = useUpdateAppointment();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.start_date ?? defaultDate);
  // The feed fills end_date even for one-day entries; show it only when it differs.
  const [endDate, setEndDate] = useState(initial && initial.end_date !== initial.start_date ? initial.end_date : "");
  const [startTime, setStartTime] = useState(hhmm(initial?.start_time));
  const [endTime, setEndTime] = useState(hhmm(initial?.end_time));
  const [location, setLocation] = useState(initial?.location ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const next: Errors = {};
    const cleanTitle = title.trim();
    if (cleanTitle.length < 1 || cleanTitle.length > 120) next.title = f.errTitle;
    if (!isValidIsoDate(date)) next.date = f.errDate;
    if (endDate !== "") {
      if (!isValidIsoDate(endDate)) next.endDate = f.errDate;
      else if (isValidIsoDate(date) && endDate < date) next.endDate = f.errEndDate;
    }
    const sameDay = endDate === "" || endDate === date;
    if (startTime && endTime && sameDay && endTime <= startTime) next.time = f.errTime;
    if (location.length > 200) next.location = f.errLocation;
    if (notes.length > 4000) next.notes = f.errNotes;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const input: AppointmentInput = {
      title: cleanTitle,
      start_date: date,
      end_date: endDate === "" ? null : endDate,
      start_time: startTime === "" ? null : startTime,
      end_time: endTime === "" ? null : endTime,
      location: location.trim() === "" ? null : location.trim(),
      notes: notes.trim() === "" ? null : notes.trim(),
    };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, input });
      else await create.mutateAsync(input);
      onSaved(de.cal.created);
    } catch (error) {
      setSubmitError(mapDbError(error));
    }
  }

  return (
    <Modal title={initial ? f.titleEdit : f.titleNew} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {submitError ? <Alert tone="error">{submitError}</Alert> : null}
        <Field id="ap-title" label={f.title} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} error={errors.title} autoFocus />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="ap-date" label={f.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <Field id="ap-end-date" label={f.endDate} type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} error={errors.endDate} />
          <Field id="ap-start" label={f.startTime} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Field id="ap-end" label={f.endTime} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} error={errors.time} />
        </div>
        <Field id="ap-location" label={f.location} value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} error={errors.location} />
        <Textarea id="ap-notes" label={f.notes} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? f.saving : f.save}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {f.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
