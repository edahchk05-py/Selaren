import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/tenancy";

export default async function Home() {
  const ctx = await getAppContext();
  if (!ctx) redirect("/login");
  if (ctx.mustChangePassword) redirect("/change-password");
  if (!ctx.clinicId) redirect("/clinics");
  redirect("/inbox");
}
