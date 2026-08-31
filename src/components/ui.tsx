import { cn } from "@/lib/cn";
import type { SetupItem } from "@/lib/copy";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="font-ui text-[11px] font-medium uppercase tracking-[0.16em] text-gold">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl tracking-tight text-ink sm:text-[2rem]">{title}</h1>
        {description && <p className="font-ui mt-2 max-w-xl text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "gold" | "warn" | "ok" | "muted";
}) {
  const tones = {
    neutral: "border-line bg-white text-ink/80",
    accent: "border-accent/20 bg-accent text-white",
    gold: "border-gold/25 bg-gold/10 text-gold",
    warn: "border-warn/20 bg-warn/10 text-warn",
    ok: "border-accent/20 bg-accent/10 text-accent",
    muted: "border-transparent bg-mist text-muted",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 font-ui text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <p className="text-xl tracking-tight">{title}</p>
      <p className="font-ui mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  required,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="font-ui block text-sm">
      <span className="font-medium text-ink">
        {label}
        {required && (
          <span className="text-gold" aria-hidden>
            {" "}
            *
          </span>
        )}
      </span>
      {hint && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function Card({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-2xl border border-line bg-surface p-5 shadow-soft sm:p-6", className)}>
      {children}
    </section>
  );
}

export function CardTitle({
  kicker,
  children,
  aside,
}: {
  kicker?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        {kicker && <p className="font-ui text-[11px] font-medium uppercase tracking-[0.16em] text-gold">{kicker}</p>}
        <h2 className="mt-1 text-xl tracking-tight">{children}</h2>
      </div>
      {aside}
    </div>
  );
}

export function SetupProgress({ items, percent }: { items: SetupItem[]; percent: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-ui text-sm text-muted">Configuration</p>
        <p className="font-ui text-sm tabular-nums text-ink">{percent} %</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement de la configuration">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} className="font-ui flex items-start gap-2 text-sm">
            <span className={cn("mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]", item.done ? "bg-accent text-white" : "border border-line text-muted")} aria-hidden>
              {item.done ? "✓" : "○"}
            </span>
            <span>
              <span className={item.done ? "text-ink" : "text-ink/80"}>{item.label}</span>
              {!item.done && <span className="block text-xs text-muted">{item.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function controlClass(extra?: string) {
  return cn(
    "w-full rounded-lg border border-line bg-white px-3 py-2.5 font-ui text-[15px] text-ink shadow-inner outline-none transition placeholder:text-ink/35",
    "focus:border-accent focus:ring-2 focus:ring-accent/20",
    extra,
  );
}
