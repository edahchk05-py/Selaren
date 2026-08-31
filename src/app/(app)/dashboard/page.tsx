import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClinic } from "@/lib/tenancy";
import { clinicDashboard, defaultFourteenDayRange } from "@/lib/services/dashboard";
import { casablancaDateTime, ymdInCasablanca } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";

function pct(n: number | null) {
  if (n === null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 1000) / 10} %`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ctx = await requireClinic("dashboard").catch(() => null);
  if (!ctx) redirect("/clinics");
  const sp = await searchParams;
  const now = new Date();
  let range = defaultFourteenDayRange(now);
  if (sp.range === "today") {
    const t = ymdInCasablanca(now);
    range = { start: casablancaDateTime(t, "00:00:00"), end: casablancaDateTime(t, "23:59:59") };
  } else if (sp.range === "7d") {
    range = defaultFourteenDayRange(new Date(now.getTime() - 7 * 86400000));
    const t = ymdInCasablanca(now);
    range.end = casablancaDateTime(t, "23:59:59");
    range.start = casablancaDateTime(
      ymdInCasablanca(new Date(casablancaDateTime(t, "00:00:00").getTime() - 6 * 86400000)),
      "00:00:00",
    );
  } else if (sp.range === "30d") {
    const t = ymdInCasablanca(now);
    range.end = casablancaDateTime(t, "23:59:59");
    range.start = casablancaDateTime(
      ymdInCasablanca(new Date(casablancaDateTime(t, "00:00:00").getTime() - 29 * 86400000)),
      "00:00:00",
    );
  } else if (sp.from && sp.to) {
    range = { start: casablancaDateTime(sp.from, "00:00:00"), end: casablancaDateTime(sp.to, "23:59:59") };
  }

  const m = await clinicDashboard(ctx.clinicId, range.start, range.end, now);
  const funnel = [
    { label: "Demandes", n: m.inquiries },
    { label: "Qualifiées", n: m.qualifiedInquiries },
    { label: "Réservées", n: m.bookedAppointments },
    { label: "Acomptes", n: m.deposits },
    { label: "Présents", n: m.showed },
  ];
  const max = Math.max(...funnel.map((s) => s.n), 1);
  const ranges = [
    ["", "14 jours"],
    ["today", "Aujourd’hui"],
    ["7d", "7 jours"],
    ["30d", "30 jours"],
  ] as const;
  const current = sp.range ?? "";

  return (
    <div>
      <PageHeader
        eyebrow="Résultats"
        title="Pilotage"
        description="Ce que Selaren a aidé à convertir — pas de comptabilité, une lecture de la demande."
      />

      <div className="font-ui mt-6 flex gap-2 overflow-x-auto pb-1">
        {ranges.map(([v, l]) => (
          <Link
            key={v || "14"}
            href={v ? `/dashboard?range=${v}` : "/dashboard"}
            className={cn(
              "shrink-0 rounded-full border px-3 py-2 text-sm",
              current === v ? "border-accent bg-accent text-white" : "border-line bg-surface",
            )}
          >
            {l}
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-accent px-6 py-8 text-white sm:px-8">
        <p className="font-ui text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">Indicateur principal</p>
        <p className="mt-3 text-6xl tabular-nums tracking-tight sm:text-7xl">{m.northStar}</p>
        <p className="mt-3 max-w-lg text-lg text-white/85">Consultations déposées via Selaren</p>
        <p className="font-ui mt-2 max-w-lg text-sm text-white/60">
          Acomptes notés sur la période. Estimation — pas de comptabilité.
        </p>
      </div>

      <Card className="mt-6">
        <p className="font-ui text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Parcours</p>
        <p className="mt-1 text-xl tracking-tight">De la demande à la présence</p>
        <ol className="mt-6 space-y-4">
          {funnel.map((step, i) => (
            <li key={step.label}>
              <div className="font-ui mb-1.5 flex items-baseline justify-between text-sm">
                <span>
                  {i > 0 && <span className="mr-2 text-gold">↓</span>}
                  {step.label}
                </span>
                <span className="tabular-nums text-ink">{step.n}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-mist">
                <div className="h-full rounded-full bg-accent/80" style={{ width: `${Math.max(6, (step.n / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
        <dl className="font-ui mt-8 grid gap-4 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Taux de qualification</dt>
            <dd className="mt-1 text-lg tabular-nums">{pct(m.qualifiedInquiryRate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Taux de réservation</dt>
            <dd className="mt-1 text-lg tabular-nums">{pct(m.bookingRate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Taux d’acompte</dt>
            <dd className="mt-1 text-lg tabular-nums">{pct(m.depositRate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Taux de présence</dt>
            <dd className="mt-1 text-lg tabular-nums">{m.showUpRate === null ? "—" : pct(m.showUpRate)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["Temps médian de 1re réponse", m.medianFirstResponseMinutes === null ? "—" : `${Math.round(m.medianFirstResponseMinutes)} min`],
            ["Demandes récupérées", String(m.recoveredInquiries)],
            ["Sans réponse", String(m.unanswered)],
            ["Relances envoyées", String(m.followUpsSent)],
            ["Absences", String(m.noShows)],
            ["Présence à confirmer", String(m.outcomePending)],
            ["Revenu estimé", `${Math.round(m.estimatedRevenueGenerated).toLocaleString("fr-MA")} MAD`],
            ["Taux de conversion", pct(m.conversionRate)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-surface p-4">
            <p className="font-ui text-xs text-muted">{k}</p>
            <p className="mt-2 text-2xl tabular-nums tracking-tight">{v}</p>
            {k === "Revenu estimé" && <p className="font-ui mt-1 text-xs text-muted">Estimation — pas de comptabilité</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
