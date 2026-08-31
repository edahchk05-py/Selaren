import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireClinic } from "@/lib/tenancy";
import { markConversationRead } from "@/lib/services/conversations";
import { listFreeSlots } from "@/lib/services/availability";
import { formatCasablanca, formatSlotLabel } from "@/lib/time";
import {
  attendanceAction,
  bookAction,
  closeInquiryAction,
  depositAction,
  manualFollowUpAction,
  qualificationAction,
  releaseAiAction,
  sendMessageAction,
  takeoverAction,
  cancelApptAction,
} from "@/app/actions/inbox";
import { deleteContactAction } from "@/app/actions/clinic";
import { Card, CardTitle, Field, controlClass } from "@/components/ui";
import {
  attendanceFr,
  bookingErrorFr,
  depositFr,
  haltReasonFr,
  handlerLabel,
  messageStatusFr,
  qualificationStatusFr,
  senderFr,
} from "@/lib/copy";
import { cn } from "@/lib/cn";

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireClinic("view").catch(() => null);
  if (!ctx) redirect("/clinics");
  const { id } = await params;
  const q = await searchParams;
  const bookErr = bookingErrorFr(q.error);
  const conversation = await prisma.conversation.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: {
      contact: true,
      messages: { orderBy: { createdAt: "asc" } },
      inquiries: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          qualification: { include: { treatment: true } },
          appointments: { where: { status: "scheduled" }, take: 1 },
        },
      },
    },
  });
  if (!conversation) notFound();
  await markConversationRead(conversation.id);

  const inquiry = conversation.inquiries[0];
  const appt = inquiry?.appointments[0];
  const treatments = await prisma.treatment.findMany({
    where: { clinicId: ctx.clinicId, offered: true },
  });
  const slots = await listFreeSlots(ctx.clinicId);
  const human = conversation.mode === "human";
  const halt = haltReasonFr(conversation.aiHaltReason);

  return (
    <div>
      <p className="font-ui mb-4">
        <Link href="/inbox" className="text-sm text-muted hover:text-ink">
          ← Boîte de réception
        </Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl tracking-tight sm:text-3xl">
                {conversation.contact.name || conversation.contact.phoneE164}
              </h1>
              <p className="font-ui mt-1 text-sm text-muted">
                {conversation.contact.phoneE164}
                {conversation.contact.waOptOut ? " · Ne plus contacter sur WhatsApp" : ""}
              </p>
            </div>
            <div className="font-ui flex flex-wrap gap-2">
              <form action={takeoverAction}>
                <input type="hidden" name="conversationId" value={conversation.id} />
                <button className={human ? "btn-secondary btn-sm" : "btn-primary btn-sm"} type="submit">
                  Prendre la main
                </button>
              </form>
              <form action={releaseAiAction}>
                <input type="hidden" name="conversationId" value={conversation.id} />
                <button className="btn-secondary btn-sm" type="submit">
                  Rendre à l’IA
                </button>
              </form>
              {ctx.isOperator && (
                <form action={deleteContactAction}>
                  <input type="hidden" name="contactId" value={conversation.contactId} />
                  <button className="btn-danger btn-sm" type="submit">
                    Supprimer le contact
                  </button>
                </form>
              )}
            </div>
          </div>

          <div
            className={cn(
              "font-ui mt-4 rounded-xl border px-4 py-3 text-sm",
              human ? "border-warn/25 bg-warn/5 text-warn" : "border-line bg-mist/60 text-ink/80",
            )}
            role="status"
          >
            {human ? (
              <>
                <p className="font-semibold">L’accueil a la main.</p>
                <p className="mt-0.5 text-[13px] opacity-90">
                  L’assistance automatique est en pause sur cette conversation. Répondez vous-même.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">{handlerLabel("ai")} active</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Selaren peut répondre dans le cadre de la fiche clinique. Prenez la main à tout moment.
                </p>
              </>
            )}
            {halt && <p className="mt-2 text-[13px] leading-relaxed">{halt}</p>}
          </div>

          <div className="mt-6 space-y-3">
            {conversation.messages.length === 0 && (
              <p className="font-ui rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                Pas encore de messages. Écrivez ci-dessous pour ouvrir la conversation WhatsApp.
              </p>
            )}
            {conversation.messages.map((m) => {
              const inbound = m.direction === "inbound";
              const fail = messageStatusFr(m.status, m.errorDetail);
              return (
                <div
                  key={m.id}
                  className={cn("max-w-[min(100%,28rem)] rounded-2xl px-4 py-3 font-ui text-sm", inbound ? "border border-line bg-white" : "ml-auto bg-accent text-white")}
                >
                  <p className={cn("text-[11px]", inbound ? "text-muted" : "text-white/70")}>
                    {senderFr(m.senderType)} ·{" "}
                    {formatCasablanca(m.createdAt, {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  {m.mediaUrl && (
                    <p className="mt-1">
                      <a className="underline underline-offset-2" href={m.mediaUrl}>
                        Voir le fichier reçu
                      </a>
                    </p>
                  )}
                  {m.body && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.body}</p>}
                  {fail && (
                    <p className={cn("mt-2 text-[12px]", inbound ? "text-warn" : "text-white/85")}>{fail}</p>
                  )}
                </div>
              );
            })}
          </div>

          <form action={sendMessageAction} className="font-ui mt-6 rounded-2xl border border-line bg-surface p-3">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <label className="sr-only" htmlFor="reply">
              Répondre au patient
            </label>
            <textarea
              id="reply"
              name="body"
              required
              rows={3}
              className={controlClass("min-h-[5.5rem]")}
              placeholder="Écrire au patient… (prend la main automatiquement)"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">Envoyer prend la main. L’IA s’arrête.</p>
              <button className="btn-primary" type="submit">
                Répondre
              </button>
            </div>
          </form>
        </section>

        <aside className="font-ui space-y-4 text-sm">
          {inquiry ? (
            <>
              <Card>
                <CardTitle kicker="Étape">Qualification</CardTitle>
                <p className="mb-3 text-muted">{qualificationStatusFr(inquiry.qualification?.status)}</p>
                <form action={qualificationAction} className="space-y-3">
                  <input type="hidden" name="inquiryId" value={inquiry.id} />
                  <Field label="Traitement">
                    <select
                      name="treatmentId"
                      defaultValue={inquiry.qualification?.treatmentId ?? ""}
                      className={controlClass()}
                    >
                      <option value="">Pas encore identifié</option>
                      {treatments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Libellé libre" hint="Si le traitement n’est pas dans la liste">
                    <input
                      name="treatmentLabel"
                      defaultValue={inquiry.qualification?.treatmentLabel ?? ""}
                      className={controlClass()}
                    />
                  </Field>
                  <Field label="Intention">
                    <select name="intent" defaultValue={inquiry.qualification?.intent ?? "unknown"} className={controlClass()}>
                      <option value="unknown">Pas encore claire</option>
                      <option value="information">Cherche une information</option>
                      <option value="book">Souhaite réserver</option>
                      <option value="admin">Déjà patient / administratif</option>
                    </select>
                  </Field>
                  <Field label="Peut se présenter">
                    <select
                      name="canAttendClinic"
                      defaultValue={inquiry.qualification?.canAttendClinic ?? "unknown"}
                      className={controlClass()}
                    >
                      <option value="unknown">On ne sait pas encore</option>
                      <option value="yes">Oui, peut venir</option>
                      <option value="no">Non</option>
                    </select>
                  </Field>
                  <Field label="Écarter" hint="Uniquement si la demande n’est pas une consultation">
                    <select
                      name="disqualifyReason"
                      defaultValue={inquiry.qualification?.disqualifyReason ?? ""}
                      className={controlClass()}
                    >
                      <option value="">Demande à suivre</option>
                      <option value="no_intent">Pas d’intention de venir</option>
                      <option value="cannot_attend">Ne peut pas se présenter</option>
                      <option value="treatment_not_offered">Traitement non proposé</option>
                      <option value="spam">Indésirable</option>
                      <option value="wrong_number">Mauvais numéro</option>
                      <option value="other">Autre</option>
                    </select>
                  </Field>
                  <Field label="Notes internes">
                    <textarea name="notes" defaultValue={inquiry.qualification?.notes ?? ""} rows={2} className={controlClass()} />
                  </Field>
                  <button className="btn-primary w-full" type="submit">
                    Enregistrer
                  </button>
                </form>
              </Card>

              <Card>
                <CardTitle kicker="Créneaux">Réserver</CardTitle>
                {bookErr ? <p className="mb-2 text-sm text-warn">{bookErr}</p> : null}
                {appt ? (
                  <p className="text-muted">Un rendez-vous est déjà confirmé. Annulez-le ou reprogrammez depuis l’agenda pour en prendre un autre.</p>
                ) : slots.length === 0 ? (
                  <p className="text-muted">Aucun créneau libre sur les 14 prochains jours.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {slots.slice(0, 8).map((s) => (
                      <li key={s.startAt.toISOString()}>
                        <form action={bookAction}>
                          <input type="hidden" name="inquiryId" value={inquiry.id} />
                          <input type="hidden" name="startAt" value={s.startAt.toISOString()} />
                          <input type="hidden" name="endAt" value={s.endAt.toISOString()} />
                          <button className="w-full rounded-lg border border-line px-3 py-2 text-left hover:bg-mist" type="submit">
                            {formatSlotLabel(s.startAt, s.endAt)}
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {appt && (
                <Card>
                  <CardTitle kicker="Rendez-vous">Suivi</CardTitle>
                  <p className="text-[15px] text-ink">{formatSlotLabel(appt.startAt, appt.endAt)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {depositFr(appt.depositStatus)} · {attendanceFr(appt.attendance)}
                  </p>
                  <form action={depositAction} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="appointmentId" value={appt.id} />
                    <input name="amountMad" placeholder="MAD" className={controlClass("w-24")} aria-label="Montant de l’acompte" />
                    <button name="deposited" value="yes" className="btn-primary btn-sm" type="submit">
                      Acompte
                    </button>
                    {appt.depositStatus === "deposited" && (
                      <button name="deposited" value="no" className="btn-secondary btn-sm" type="submit">
                        Retirer
                      </button>
                    )}
                  </form>
                  <form action={attendanceAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="appointmentId" value={appt.id} />
                    <button name="attendance" value="showed" className="btn-secondary btn-sm" type="submit">
                      Venu
                    </button>
                    <button name="attendance" value="no_show" className="btn-secondary btn-sm" type="submit">
                      Absent
                    </button>
                  </form>
                  <form action={cancelApptAction} className="mt-2">
                    <input type="hidden" name="appointmentId" value={appt.id} />
                    <button className="btn-ghost btn-sm" type="submit">
                      Annuler le rendez-vous
                    </button>
                  </form>
                </Card>
              )}

              <form action={manualFollowUpAction}>
                <input type="hidden" name="inquiryId" value={inquiry.id} />
                <button className="btn-secondary w-full" type="submit">
                  Relancer
                </button>
              </form>
              <form action={closeInquiryAction} className="flex gap-2">
                <input type="hidden" name="inquiryId" value={inquiry.id} />
                <select name="reason" className={controlClass("flex-1")} aria-label="Motif de clôture">
                  <option value="unresponsive">Sans réponse</option>
                  <option value="not_interested">Pas intéressé</option>
                  <option value="spam">Indésirable</option>
                  <option value="duplicate">Doublon</option>
                  <option value="other">Autre</option>
                </select>
                <button className="btn-ghost" type="submit">
                  Clore
                </button>
              </form>
            </>
          ) : (
            <Card>
              <p className="text-muted">Aucune demande ouverte sur ce fil.</p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
