import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

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

export function Textarea({
  label,
  id,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string; error?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900"
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

export function Alert({ tone, children }: { tone: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const styles = {
    error: "bg-expense-soft text-red-900",
    success: "bg-income-soft text-green-900",
    info: "bg-neutral-100 text-neutral-800",
    warning: "bg-amber-100 text-amber-950",
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

export function Select({
  label,
  id,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500"
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-expense">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "info"; children: ReactNode }) {
  const styles = { neutral: "bg-neutral-100 text-neutral-700", info: "bg-blue-50 text-blue-900" } as const;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[tone]}`}>{children}</span>;
}

/** Dialog: a bottom sheet on phones, a centred card on larger screens. Escape closes it. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end bg-black/40 sm:place-items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
