import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card } from "../components/ui";
import { useUserSettings } from "../features/finance/api";
import { useDeleteJob, useHourCheck, useJobQuote, useJobs } from "../features/planning/api";
import { JobForm } from "../features/planning/JobForm";
import { todayIso } from "../lib/dates";
import { de } from "../lib/de";
import { mapDbError } from "../lib/errors";
import { formatHours, jobHours } from "../lib/jobs";
import { formatDate, formatEuro } from "../lib/money";
import type { Job } from "../lib/types";

const t = de.jobs;

type View = "upcoming" | "past" | "all";
const views: View[] = ["upcoming", "past", "all"];

const lastDay = (job: Job) => job.end_date ?? job.start_date;

function period(job: Job): string {
  const start = formatDate(job.start_date);
  const time = job.start_time ? ` ${job.start_time.slice(0, 5)}` : "";
  if (!job.end_date || job.end_date === job.start_date) return `${start}${time}`;
  return `${start}${time} – ${formatDate(job.end_date)}${job.end_time ? ` ${job.end_time.slice(0, 5)}` : ""}`;
}

/** Hours already planned this month against the monthly limit. */
function MonthHours() {
  const today = todayIso();
  const check = useHourCheck({ startDate: today, shooting: 0, editing: 0, organisation: 0, excludeJobId: null });
  const settings = useUserSettings();
  if (!check.data) return null;
  const { planned_hours, monthly_limit, exceeds } = check.data;
  const orgCounts = settings.data?.org_hours_billable ?? true;
  return (
    <Card title={t.month.title}>
      <div className="space-y-2" aria-live="polite">
        {monthly_limit === null ? (
          <p>{t.month.noLimit.replace("{planned}", formatHours(planned_hours))}</p>
        ) : (
          <p>{t.month.text.replace("{planned}", formatHours(planned_hours)).replace("{limit}", formatHours(monthly_limit))}</p>
        )}
        {exceeds ? <Alert tone="warning">{t.month.over}</Alert> : null}
        <p className="text-sm text-neutral-600">
          {orgCounts ? t.month.org : t.month.noOrg}{" "}
          <Link className="underline" to="/einstellungen">
            {t.month.settings}
          </Link>
        </p>
      </div>
    </Card>
  );
}

/** The calculation of one saved job, straight from the database. */
function Calculation({ job }: { job: Job }) {
  const quote = useJobQuote(job.id);
  const settings = useUserSettings();
  const c = t.calc;
  if (quote.isLoading) return <p role="status">{c.loading}</p>;
  if (quote.isError || !quote.data) return <Alert tone="error">{c.error}</Alert>;
  const q = quote.data;
  const noRate = q.missing_settings.includes("target_hourly_rate");
  const target = settings.data?.target_hourly_rate ?? null;
  const rows: Array<[string, string]> = [
    [c.hours, q.total_hours > 0 ? formatHours(q.total_hours) : c.noHours],
    [c.costs, formatEuro(q.planned_costs)],
  ];
  if (!noRate) {
    rows.push([c.recommended, q.recommended_price === null ? "–" : formatEuro(q.recommended_price)]);
    rows.push([c.quoted, q.quoted_price === null ? c.noQuoted : formatEuro(q.quoted_price)]);
    rows.push([c.priceUsed, q.price_used === null ? "–" : formatEuro(q.price_used)]);
    rows.push([c.profit, q.expected_profit === null ? "–" : formatEuro(q.expected_profit)]);
    rows.push([c.hourly, q.effective_hourly_rate === null ? "–" : `${formatEuro(q.effective_hourly_rate)} / Std.`]);
    if (q.taxes_and_reserves !== null && q.taxes_and_reserves > 0) rows.push([c.setAside, formatEuro(q.taxes_and_reserves)]);
  }
  rows.push([c.booked, formatEuro(q.booked_income)]);
  return (
    <div className="space-y-3 rounded-lg bg-neutral-50 p-3">
      <h4 className="text-sm font-semibold">{c.title}</h4>
      {noRate ? <Alert tone="info">{c.missingRate}</Alert> : null}
      {q.expected_profit !== null && q.expected_profit < 0 ? <Alert tone="warning">{c.loss}</Alert> : null}
      {q.expected_profit !== null &&
      q.expected_profit >= 0 &&
      q.effective_hourly_rate !== null &&
      target !== null &&
      q.effective_hourly_rate < target ? (
        <Alert tone="warning">{c.belowTarget}</Alert>
      ) : null}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-700">{label}</dt>
            <dd className="text-right font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-neutral-600">{c.note}</p>
    </div>
  );
}

function JobCard({
  job,
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  job: Job;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-neutral-200" id={`job-${job.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{job.name}</h3>
        {job.client ? <Badge>{job.client}</Badge> : null}
      </div>
      <p className="text-sm text-neutral-700">
        {period(job)} · {t.hours.replace("{h}", formatHours(jobHours(job)))}
        {job.quoted_price !== null ? ` · ${t.price} ${formatEuro(job.quoted_price)}` : ""}
      </p>
      {job.notes ? <p className="whitespace-pre-line text-sm text-neutral-700">{job.notes}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={open} onClick={onToggle}>
          {open ? t.hideCalc : t.showCalc}
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          {t.edit}
        </Button>
        <Button variant="secondary" onClick={onDelete}>
          {t.delete}
        </Button>
      </div>
      {open ? <Calculation job={job} /> : null}
    </li>
  );
}

export default function JobsPage() {
  const today = todayIso();
  const [params] = useSearchParams();
  const [view, setView] = useState<View>("upcoming");
  const [openId, setOpenId] = useState<string | null>(params.get("job"));
  const [form, setForm] = useState<{ job?: Job } | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const jobs = useJobs();
  const remove = useDeleteJob();

  // A job opened from the calendar must be visible, whatever the current filter says.
  const linked = params.get("job");
  const visible = useMemo(() => {
    const all = jobs.data ?? [];
    const upcoming = (j: Job) => lastDay(j) >= today;
    const list =
      view === "all" ? all : all.filter((j) => (view === "upcoming" ? upcoming(j) : !upcoming(j)) || j.id === linked);
    // Upcoming jobs read best soonest first, everything else newest first.
    return view === "upcoming" ? [...list].sort((a, b) => a.start_date.localeCompare(b.start_date)) : list;
  }, [jobs.data, view, today, linked]);

  async function onDelete(job: Job) {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await remove.mutateAsync(job.id);
      setNotice({ tone: "success", text: t.deleted });
    } catch (error) {
      setNotice({ tone: "error", text: mapDbError(error) });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <Button onClick={() => setForm({})}>{t.newJob}</Button>
      </div>

      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <MonthHours />

      <div role="group" aria-label={t.views.label} className="flex gap-2">
        {views.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${
              view === v ? "bg-neutral-900 text-white" : "bg-white text-neutral-800 ring-1 ring-neutral-300"
            }`}
          >
            {t.views[v]}
          </button>
        ))}
      </div>

      {jobs.isLoading ? <p role="status">{de.common.loading}</p> : null}
      {jobs.isError ? (
        <div className="space-y-3">
          <Alert tone="error">{t.loadError}</Alert>
          <Button variant="secondary" onClick={() => void jobs.refetch()}>
            {de.common.retry}
          </Button>
        </div>
      ) : null}
      {jobs.data && jobs.data.length === 0 ? <p className="text-neutral-700">{t.empty}</p> : null}
      {jobs.data && jobs.data.length > 0 && visible.length === 0 ? <p className="text-neutral-700">{t.emptyFiltered}</p> : null}

      <ul className="space-y-3">
        {visible.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            open={openId === job.id}
            onToggle={() => setOpenId(openId === job.id ? null : job.id)}
            onEdit={() => setForm({ job })}
            onDelete={() => void onDelete(job)}
          />
        ))}
      </ul>

      {form ? (
        <JobForm
          initial={form.job}
          onClose={() => setForm(null)}
          onSaved={(text) => {
            setForm(null);
            setNotice({ tone: "success", text });
          }}
        />
      ) : null}
    </div>
  );
}
