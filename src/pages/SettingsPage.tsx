import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Alert, Button, Card, Field } from "../components/ui";
import { useUpdateSettings, useUserSettings } from "../features/finance/api";
import { parseDecimalDe, toGermanInput } from "../lib/amount";
import { de } from "../lib/de";
import { mapDbError } from "../lib/errors";
import type { UserSettings } from "../lib/types";

const t = de.settings;

type Errors = Partial<
  Record<"balanceMonths" | "chartMonths" | "hourlyRate" | "billableHours" | "taxRate" | "reserveRate", string>
>;

const percentText = (fraction: number | null) => (fraction === null ? "" : toGermanInput(Number((fraction * 100).toFixed(2))));

function SettingsForm({ settings, userId }: { settings: UserSettings; userId: string }) {
  const save = useUpdateSettings(userId);
  const [balanceMonths, setBalanceMonths] = useState(String(settings.balance_months));
  const [chartMonths, setChartMonths] = useState(String(settings.chart_months));
  const [hourlyRate, setHourlyRate] = useState(toGermanInput(settings.target_hourly_rate));
  const [billableHours, setBillableHours] = useState(toGermanInput(settings.billable_hours_per_month));
  const [taxRate, setTaxRate] = useState(percentText(settings.tax_rate));
  const [reserveRate, setReserveRate] = useState(percentText(settings.reserve_rate));
  const [orgHours, setOrgHours] = useState(settings.org_hours_billable);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const next: Errors = {};

    const months = (value: string) => (/^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 24 ? Number(value) : null);
    const balance = months(balanceMonths);
    const chart = months(chartMonths);
    if (balance === null) next.balanceMonths = t.errMonths;
    if (chart === null) next.chartMonths = t.errMonths;

    // Empty means "not configured". A non-empty invalid value is an error.
    let hourly: number | null = null;
    if (hourlyRate.trim() !== "") {
      hourly = parseDecimalDe(hourlyRate);
      if (hourly === null || hourly > 100000) next.hourlyRate = t.errHourly;
    }

    let hours: number | null = null;
    if (billableHours.trim() !== "") {
      hours = parseDecimalDe(billableHours);
      if (hours === null || hours <= 0 || hours > 744) next.billableHours = t.errHours;
    }

    const rate = (value: string, key: "taxRate" | "reserveRate"): number | null => {
      if (value.trim() === "") return null;
      const percent = parseDecimalDe(value);
      if (percent === null || percent >= 100) {
        next[key] = t.errRate;
        return null;
      }
      return Number((percent / 100).toFixed(4));
    };
    const tax = rate(taxRate, "taxRate");
    const reserve = rate(reserveRate, "reserveRate");
    if (!next.taxRate && !next.reserveRate && (tax ?? 0) + (reserve ?? 0) >= 1) next.reserveRate = t.errRateSum;

    setErrors(next);
    if (Object.keys(next).length > 0 || balance === null || chart === null) return;

    try {
      await save.mutateAsync({
        balance_months: balance,
        chart_months: chart,
        target_hourly_rate: hourly,
        billable_hours_per_month: hours,
        tax_rate: tax,
        reserve_rate: reserve,
        org_hours_billable: orgHours,
      });
      setMessage({ tone: "success", text: t.saved });
    } catch (error) {
      setMessage({ tone: "error", text: mapDbError(error) });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <Card title={t.overviewTitle}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="set-balance" label={t.balanceMonths} inputMode="numeric" value={balanceMonths} onChange={(e) => setBalanceMonths(e.target.value)} error={errors.balanceMonths} />
          <Field id="set-chart" label={t.chartMonths} inputMode="numeric" value={chartMonths} onChange={(e) => setChartMonths(e.target.value)} error={errors.chartMonths} />
        </div>
        <p className="mt-2 text-sm text-neutral-600">{t.monthsHint}</p>
      </Card>

      <Card title={t.calcTitle}>
        <p className="mb-4 text-sm text-neutral-700">{t.calcIntro}</p>
        <div className="space-y-4">
          <div className="space-y-1">
            <Field id="set-hourly" label={t.hourlyRate} inputMode="decimal" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} error={errors.hourlyRate} />
            <p className="text-sm text-neutral-600">{t.hourlyRateHint}</p>
          </div>
          <div className="space-y-1">
            <Field id="set-hours" label={t.billableHours} inputMode="decimal" value={billableHours} onChange={(e) => setBillableHours(e.target.value)} error={errors.billableHours} />
            <p className="text-sm text-neutral-600">{t.billableHoursHint}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="set-tax" label={t.taxRate} inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} error={errors.taxRate} />
            <Field id="set-reserve" label={t.reserveRate} inputMode="decimal" value={reserveRate} onChange={(e) => setReserveRate(e.target.value)} error={errors.reserveRate} />
          </div>
          <p className="text-sm text-neutral-600">{t.rateHint}</p>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="size-5" checked={orgHours} onChange={(e) => setOrgHours(e.target.checked)} />
            {t.orgHours}
          </label>
        </div>
      </Card>

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t.saving : t.save}
      </Button>
    </form>
  );
}

export default function SettingsPage() {
  const { session } = useAuth();
  const settings = useUserSettings();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      {settings.isLoading ? <p role="status">{de.common.loading}</p> : null}
      {settings.isError ? (
        <div className="space-y-3">
          <Alert tone="error">{mapDbError(settings.error)}</Alert>
          <Button variant="secondary" onClick={() => void settings.refetch()}>
            {de.common.retry}
          </Button>
        </div>
      ) : null}
      {settings.data && session ? <SettingsForm settings={settings.data} userId={session.user.id} /> : null}
      {settings.isSuccess && !settings.data ? <Alert tone="error">{de.common.error}</Alert> : null}
    </div>
  );
}
