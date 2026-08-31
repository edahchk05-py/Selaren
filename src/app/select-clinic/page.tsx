import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { switchClinicAction } from "@/app/actions/auth";
import { PageHeader } from "@/components/ui";

export default async function SelectClinicPage() {
  const ctx = await getAppContext();
  if (!ctx) redirect("/login");
  const clinics = ctx.isOperator ? await prisma.clinic.findMany({ orderBy: { name: "asc" } }) : [];
  const list = ctx.isOperator
    ? clinics.map((c) => ({ id: c.id, name: c.name }))
    : ctx.memberships.map((m) => ({ id: m.clinicId, name: m.clinicName }));

  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <PageHeader
        title="Choisir une clinique"
        description="Ouvrez l’espace dans lequel vous travaillez aujourd’hui."
      />
      <ul className="mt-8 space-y-2">
        {list.map((c) => (
          <li key={c.id}>
            <form action={switchClinicAction}>
              <input type="hidden" name="clinicId" value={c.id} />
              <button className="w-full rounded-xl border border-line bg-surface px-4 py-4 text-left hover:bg-mist" type="submit">
                {c.name}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
