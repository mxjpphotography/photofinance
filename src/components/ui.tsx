import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover disabled:bg-neutral-400",
  secondary: "bg-white text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:text-neutral-400",
  danger: "bg-expense text-white hover:bg-red-800 disabled:bg-neutral-400",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      // min-h-11 = 44px, the recommended minimum touch target.
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  id,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; error?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 placeholder:text-neutral-400"
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-expense">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "bg-expense-soft text-red-900",
    success: "bg-income-soft text-green-900",
    info: "bg-neutral-100 text-neutral-800",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-4 py-3 text-sm ${styles[tone]}`}>
      {children}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-neutral-200">
      {title ? <h2 className="mb-3 text-base font-semibold text-neutral-900">{title}</h2> : null}
      {children}
    </section>
  );
}

/** Honest placeholder for areas whose UI is not built yet (no dead buttons). */
export function NotAvailableYet({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <p className="text-neutral-700">{text}</p>
      </Card>
    </div>
  );
}
