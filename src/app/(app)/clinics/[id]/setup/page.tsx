import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { getActivationState } from "@/lib/services/onboarding";
import { switchClinicAction } from "@/app/actions/auth";
import { Card, PageHeader, SetupProgress } from "@/components/ui";
import { cityLabel, clinicStatusLabel, setupChecklist } from "@/lib/copy";

export default async function ClinicSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx?.isOperator) redirect("/inbox");
  const { id } = await params;
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic) redirect("/clinics");
  const state = await getActivationState(clinic.id);
  const progress = setupChecklist(state);

  return (
    <div className="max-w-xl">
      <PageHeader
        eyebrow={cityLabel(clinic.city)}
        title={clinic.name}
        description={
          clinic.status === "active"
            ? "Cette clinique est active."
            : "Votre clinique n’est pas encore active. Voici exactement ce qu’il reste."
        }
      />
      <Card className="mt-8">
        <p className="font-ui mb-4 text-sm text-muted">Statut : {clinicStatusLabel(clinic.status)}</p>
        <SetupProgress items={progress.items} percent={progress.percent} />
        <form action={switchClinicAction} className="mt-8">
          <input type="hidden" name="clinicId" value={clinic.id} />
          <button className="btn-primary" type="submit">
            Ouvrir et configurer
          </button>
        </form>
        <p className="font-ui mt-3 text-xs text-muted">
          L’activation se fait depuis la page Clinique, une fois chaque étape cochée.
        </p>
      </Card>
    </div>
  );
}
