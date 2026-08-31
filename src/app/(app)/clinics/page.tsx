import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/tenancy";
import { createClinicAction } from "@/app/actions/clinic";
import { switchClinicAction } from "@/app/actions/auth";
import { getActivationState } from "@/lib/services/onboarding";
import { Card, CardTitle, Field, PageHeader, controlClass } from "@/components/ui";
import { cityLabel, clinicStatusLabel, setupChecklist } from "@/lib/copy";
import { cn } from "@/lib/cn";

export default async function ClinicsPage() {
  const ctx = await getAppContext();
  if (!ctx?.isOperator) redirect("/inbox");
  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      whatsappConnection: { select: { status: true, displayPhoneE164: true } },
      _count: { select: { inquiries: true, appointments: true } },
    },
  });

  const rows = await Promise.all(
    clinics.map(async (c) => {
      const state = await getActivationState(c.id);
      const booked = await prisma.appointment.count({
        where: { clinicId: c.id, status: "scheduled" },
      });
      return { c, progress: setupChecklist(state), booked };
    }),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Opérateur Selaren"
        title="Cliniques"
        description="Onboarding accompagné. Pas d’inscription publique."
      />

      <Card className="mt-8">
        <CardTitle kicker="Nouvelle clinique">Ouvrir un espace</CardTitle>
        <form action={createClinicAction} className="grid max-w-xl gap-4">
          <Field label="Nom de la clinique" required>
            <input name="name" required className={controlClass()} />
          </Field>
          <Field label="Ville">
            <select name="city" className={controlClass()}>
              <option value="casablanca">Casablanca</option>
              <option value="marrakech">Marrakech</option>
            </select>
          </Field>
          <Field label="Valeur de consultation" hint="MAD, estimation — pas de facturation">
            <input name="defaultConsultationValueMad" type="number" className={controlClass()} />
          </Field>
          <label className="font-ui flex items-start gap-2 text-sm">
            <input type="checkbox" name="depositTypicallyRequired" defaultChecked className="mt-1" />
            Acompte habituellement demandé (suivi uniquement)
          </label>
          <button className="btn-primary w-fit" type="submit">
            Créer l’espace
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <p className="font-ui mt-8 text-sm text-muted">Aucune clinique pour le moment.</p>
      ) : (
        <ul className="mt-8 grid gap-4">
          {rows.map(({ c, progress, booked }) => (
            <li key={c.id}>
              <article className="rounded-2xl border border-line bg-surface p-5 shadow-soft sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl tracking-tight">{c.name}</h2>
                    <p className="font-ui mt-1 text-sm text-muted">
                      {cityLabel(c.city)} · {clinicStatusLabel(c.status)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-ui w-fit rounded-full border px-3 py-1 text-xs",
                      c.status === "active"
                        ? "border-accent/20 bg-accent/10 text-accent"
                        : c.status === "paused"
                          ? "border-gold/25 bg-gold/10 text-gold"
                          : "border-line text-muted",
                    )}
                  >
                    {clinicStatusLabel(c.status)}
                  </span>
                </div>
                <dl className="font-ui mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted">Configuration</dt>
                    <dd className="mt-0.5 tabular-nums">{progress.percent} %</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">WhatsApp</dt>
                    <dd className="mt-0.5">
                      {c.whatsappConnection?.status === "active" ? "Connecté" : "Non connecté"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Demandes</dt>
                    <dd className="mt-0.5 tabular-nums">{c._count.inquiries}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Consultations réservées</dt>
                    <dd className="mt-0.5 tabular-nums">{booked}</dd>
                  </div>
                </dl>
                <div className="font-ui mt-5 flex flex-wrap gap-2">
                  <form action={switchClinicAction}>
                    <input type="hidden" name="clinicId" value={c.id} />
                    <button className="btn-primary btn-sm" type="submit">
                      Ouvrir
                    </button>
                  </form>
                  <Link href={`/clinics/${c.id}/setup`} className="btn-secondary btn-sm">
                    Voir la configuration
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
