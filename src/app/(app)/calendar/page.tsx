import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireClinic } from "@/lib/tenancy";
import { formatSlotLabel, ymdInCasablanca, formatCasablanca } from "@/lib/time";
import { attendanceAction, cancelApptAction, depositAction, rescheduleAction } from "@/app/actions/inbox";
import { isOutcomePending } from "@/lib/metrics";
import { listFreeSlots } from "@/lib/services/availability";
import { Card, EmptyState, PageHeader, controlClass } from "@/components/ui";
import { attendanceFr, bookingErrorFr, depositFr } from "@/lib/copy";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireClinic("view").catch(() => null);
  if (!ctx) redirect("/clinics");
  const q = await searchParams;
  const bookErr = bookingErrorFr(q.error);
  const now = new Date();
  const slots = await listFreeSlots(ctx.clinicId, now, true);
  const appts = await prisma.appointment.findMany({
    where: { clinicId: ctx.clinicId, status: { not: "rescheduled" } },
    include: { contact: true, inquiry: { include: { qualification: { include: { treatment: true } } } } },
    orderBy: { startAt: "asc" },
  });

  const scheduled = appts.filter((a) => a.status === "scheduled");
  const groups = new Map<string, typeof scheduled>();
  for (const a of scheduled) {
    const key = ymdInCasablanca(a.startAt);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const cancelled = appts.filter((a) => a.status === "cancelled").slice(0, 8);
  const today = ymdInCasablanca(now);

  return (
    <div>
      <PageHeader
        eyebrow="Un seul calendrier"
        title="Agenda"
        description="Les consultations de la clinique. Pas de salles, pas de praticiens : un planning d’accueil."
      />
      {bookErr ? <p className="font-ui mt-4 text-sm text-warn">{bookErr}</p> : null}

      {groups.size === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Aucun rendez-vous à venir."
            body="Les réservations prises depuis la boîte de réception apparaîtront ici, jour par jour."
          />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="text-xl tracking-tight">
                {day === today
                  ? "Aujourd’hui"
                  : formatCasablanca(list[0]!.startAt, { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <ul className="mt-3 space-y-3">
                {list.map((a) => {
                  const pending = isOutcomePending(
                    {
                      startAt: a.startAt,
                      status: a.status,
                      attendance: a.attendance,
                      depositStatus: a.depositStatus,
                      depositedAt: a.depositedAt,
                      updatedAt: a.createdAt,
                      estimatedValueMad: null,
                      clinicDefaultValueMad: 0,
                      inquiryId: a.inquiryId,
                    },
                    now,
                  );
                  const treatment =
                    a.inquiry.qualification?.treatment?.name || a.inquiry.qualification?.treatmentLabel || "Consultation";
                  return (
                    <li key={a.id}>
                      <Card>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg tracking-tight">{formatSlotLabel(a.startAt, a.endAt)}</p>
                            <p className="font-ui mt-1 text-sm text-ink">
                              {a.contact.name || a.contact.phoneE164}
                            </p>
                            <p className="font-ui mt-1 text-sm text-muted">
                              {treatment}
                              {" · "}
                              {depositFr(a.depositStatus)}
                              {" · "}
                              {attendanceFr(a.attendance)}
                              {pending ? " · Présence à confirmer" : ""}
                              {a.contact.waOptOut ? " · Rappels coupés" : ""}
                            </p>
                          </div>
                          {a.status === "scheduled" && (
                            <div className="font-ui flex flex-col gap-2 sm:items-end">
                              <form action={depositAction} className="flex flex-wrap gap-2">
                                <input type="hidden" name="appointmentId" value={a.id} />
                                <input name="amountMad" className={controlClass("w-24")} placeholder="MAD" aria-label="Montant acompte" />
                                <button name="deposited" value="yes" className="btn-primary btn-sm" type="submit">
                                  Acompte
                                </button>
                                {a.depositStatus === "deposited" && (
                                  <button name="deposited" value="no" className="btn-secondary btn-sm" type="submit">
                                    Retirer
                                  </button>
                                )}
                              </form>
                              <div className="flex flex-wrap gap-2">
                                <form action={attendanceAction}>
                                  <input type="hidden" name="appointmentId" value={a.id} />
                                  <button name="attendance" value="showed" className="btn-secondary btn-sm" type="submit">
                                    Venu
                                  </button>
                                </form>
                                <form action={attendanceAction}>
                                  <input type="hidden" name="appointmentId" value={a.id} />
                                  <button name="attendance" value="no_show" className="btn-secondary btn-sm" type="submit">
                                    Absent
                                  </button>
                                </form>
                                {a.startAt > now && (
                                  <form action={cancelApptAction}>
                                    <input type="hidden" name="appointmentId" value={a.id} />
                                    <button className="btn-ghost btn-sm" type="submit">
                                      Annuler
                                    </button>
                                  </form>
                                )}
                              </div>
                              {a.startAt > now && slots.length > 0 && (
                                <details className="w-full sm:w-72">
                                  <summary className="cursor-pointer text-xs text-muted">Reprogrammer</summary>
                                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                                    {slots.slice(0, 6).map((s) => (
                                      <li key={s.startAt.toISOString()}>
                                        <form action={rescheduleAction}>
                                          <input type="hidden" name="appointmentId" value={a.id} />
                                          <input type="hidden" name="startAt" value={s.startAt.toISOString()} />
                                          <input type="hidden" name="endAt" value={s.endAt.toISOString()} />
                                          <button className="w-full rounded-lg border border-line px-2 py-1.5 text-left text-xs hover:bg-mist" type="submit">
                                            {formatSlotLabel(s.startAt, s.endAt)}
                                          </button>
                                        </form>
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          )}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg tracking-tight text-muted">Annulés récemment</h2>
          <ul className="font-ui mt-2 text-sm text-muted">
            {cancelled.map((a) => (
              <li key={a.id} className="py-1">
                {formatSlotLabel(a.startAt, a.endAt)} · {a.contact.name || a.contact.phoneE164}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
