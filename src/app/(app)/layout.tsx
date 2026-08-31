import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  if (!ctx) redirect("/login");
  if (ctx.mustChangePassword) redirect("/change-password");

  const operatorClinics = ctx.isOperator
    ? await prisma.clinic.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  return (
    <Shell ctx={ctx} operatorClinics={operatorClinics}>
      {children}
    </Shell>
  );
}
