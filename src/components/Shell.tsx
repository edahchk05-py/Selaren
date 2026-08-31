"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction, switchClinicAction } from "@/app/actions/auth";
import type { AppContext } from "@/lib/tenancy";
import { clinicStatusLabel, roleLabel } from "@/lib/copy";
import { cn } from "@/lib/cn";

const primary = [
  ["/inbox", "Boîte"],
  ["/calendar", "Agenda"],
  ["/dashboard", "Pilotage"],
] as const;

const secondary = [
  ["/missed-call", "Appel manqué"],
  ["/inquiries/new", "Nouvelle demande"],
  ["/settings", "Clinique"],
] as const;

function NavLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "font-ui flex min-h-11 items-center rounded-lg px-3 text-sm transition",
        active ? "bg-accent text-white" : "text-ink/70 hover:bg-mist hover:text-ink",
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

export function Shell({
  ctx,
  operatorClinics = [],
  children,
}: {
  ctx: AppContext;
  operatorClinics?: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const options =
    operatorClinics.length > 0
      ? operatorClinics
      : ctx.memberships.map((m) => ({ id: m.clinicId, name: m.clinicName }));

  const isActive = (href: string) => (href === "/inbox" ? pathname.startsWith("/inbox") : pathname === href || pathname.startsWith(`${href}/`));

  const extra = ctx.isOperator
    ? ([...secondary, ["/clinics", "Cliniques"]] as const)
    : secondary;

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pb-6 pt-7">
          <p className="text-xl tracking-tight">Selaren</p>
          <p className="font-ui mt-1 text-xs leading-relaxed text-gold">Chaque demande, un rendez-vous.</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Principal">
          {primary.map(([href, label]) => (
            <NavLink key={href} href={href} label={label === "Boîte" ? "Boîte de réception" : label} active={isActive(href)} />
          ))}
          <p className="font-ui px-3 pb-1 pt-5 text-[10px] font-medium uppercase tracking-[0.16em] text-gold">Accueil</p>
          {secondary.map(([href, label]) => (
            <NavLink key={href} href={href} label={label} active={isActive(href)} />
          ))}
          {ctx.isOperator && <NavLink href="/clinics" label="Cliniques" active={isActive("/clinics")} />}
        </nav>
        <div className="border-t border-line p-4">
          <p className="truncate text-sm">{ctx.clinicName ?? "Selaren"}</p>
          <p className="font-ui mt-0.5 text-xs text-muted">
            {roleLabel(ctx.membershipRole, ctx.isOperator)}
            {ctx.clinicStatus ? ` · ${clinicStatusLabel(ctx.clinicStatus)}` : ""}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-[4.5rem] lg:pb-0">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0 lg:hidden">
              <p className="text-lg tracking-tight">Selaren</p>
              <p className="font-ui truncate text-xs text-gold">{ctx.clinicName ?? "Opérateur"}</p>
            </div>
            <p className="font-ui hidden text-sm text-muted lg:block">
              {ctx.clinicName ? `${ctx.clinicName} · ${clinicStatusLabel(ctx.clinicStatus)}` : "Toutes les cliniques"}
            </p>
            <div className="font-ui ml-auto flex items-center gap-2 text-sm">
              {options.length > 0 && (
                <form action={switchClinicAction}>
                  <label className="sr-only" htmlFor="clinic-switch">
                    Clinique
                  </label>
                  <select
                    id="clinic-switch"
                    name="clinicId"
                    defaultValue={ctx.clinicId ?? ""}
                    className="max-w-[9.5rem] rounded-lg border border-line bg-white px-2 py-2 text-sm sm:max-w-xs"
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  >
                    {!ctx.clinicId && <option value="">Choisir…</option>}
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </form>
              )}
              <form action={logoutAction}>
                <button type="submit" className="btn-ghost btn-sm">
                  Sortir
                </button>
              </form>
            </div>
          </div>
        </header>

        {ctx.clinicStatus === "paused" && (
          <div className="bg-gold/15 px-4 py-2.5 text-center font-ui text-sm sm:px-6" role="status">
            Clinique en pause. L’assistance automatique n’envoie rien. L’accueil peut toujours répondre.
          </div>
        )}
        {ctx.clinicStatus === "onboarding" && (
          <div className="bg-mist px-4 py-2.5 text-center font-ui text-sm sm:px-6" role="status">
            Cette clinique n’est pas encore active. Les patients ne reçoivent pas de réponses automatiques.
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
        aria-label="Navigation mobile"
      >
        <div className="grid grid-cols-4 gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
          {primary.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "font-ui flex min-h-12 flex-col items-center justify-center rounded-lg text-[11px]",
                isActive(href) ? "text-accent" : "text-muted",
              )}
            >
              {label}
            </Link>
          ))}
          <button
            type="button"
            className={cn("font-ui flex min-h-12 flex-col items-center justify-center rounded-lg text-[11px]", more ? "text-accent" : "text-muted")}
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            Plus
          </button>
        </div>
        {more && (
          <div className="border-t border-line px-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              {extra.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMore(false)}
                  className="font-ui min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-center text-sm"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}
