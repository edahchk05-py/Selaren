import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireClinic } from "@/lib/tenancy";
import { deriveInboxLabels, inboxSortKey, type InboxLabel } from "@/lib/inquiryStage";
import {
  handlerLabel,
  inboxLabelFr,
  primaryInboxLabel,
  relativeWhen,
  sourceLabel,
} from "@/lib/copy";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";

function toneFor(label: InboxLabel): "warn" | "accent" | "gold" | "ok" | "muted" | "neutral" {
  if (label === "Needs staff" || label === "Waiting on clinic" || label === "New") return "warn";
  if (label === "Qualified" || label === "Qualifying") return "gold";
  if (label === "Booked" || label === "Deposited" || label === "Showed") return "ok";
  if (label === "Closed") return "muted";
  return "neutral";
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const ctx = await requireClinic("view").catch(() => null);
  if (!ctx) redirect("/clinics");
  const { filter } = await searchParams;

  const conversations = await prisma.conversation.findMany({
    where: { clinicId: ctx.clinicId },
    include: {
      contact: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      inquiries: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          qualification: { include: { treatment: true } },
          appointments: { where: { status: "scheduled" }, take: 1 },
          followUps: true,
        },
      },
    },
  });

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: ctx.clinicId } });
  const now = new Date();

  const rows = conversations.map((c) => {
    const inq = c.inquiries[0];
    const appt = inq?.appointments[0];
    const labels = inq
      ? deriveInboxLabels({
          inquiryStatus: inq.status,
          firstResponseAt: inq.firstResponseAt,
          lastMessageDirection: c.messages[0]?.direction ?? null,
          conversationMode: c.mode,
          aiHaltReason: c.aiHaltReason,
          qualificationStatus: inq.qualification?.status ?? "unevaluated",
          hasScheduledAppointment: Boolean(appt),
          depositStatus: appt?.depositStatus ?? null,
          depositTypicallyRequired: clinic.depositTypicallyRequired,
          attendance: appt?.attendance ?? null,
          appointmentStartAt: appt?.startAt ?? null,
          followUpScheduledOrSent: (inq.followUps ?? []).some((f) => f.sentAt || !f.canceledAt),
          followUpExhausted: c.aiHaltReason === "follow_up_exhausted",
          now,
        })
      : (["Needs staff"] as InboxLabel[]);
    return { c, inq, labels, last: c.messages[0] };
  });

  rows.sort((a, b) => {
    const ka = inboxSortKey(a.labels, a.c.lastPatientMessageAt);
    const kb = inboxSortKey(b.labels, b.c.lastPatientMessageAt);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });

  const counts = {
    all: rows.length,
    needs: rows.filter((r) => r.labels.includes("Needs staff") || r.labels.includes("Waiting on clinic")).length,
    unread: rows.filter((r) => r.c.unreadCount > 0).length,
    unbooked: rows.filter((r) => r.inq?.status === "open").length,
    qualified: rows.filter((r) => r.inq?.qualification?.status === "qualified").length,
    booked: rows.filter((r) => r.inq?.status === "booked").length,
  };

  const filtered = rows.filter((r) => {
    if (filter === "needs") return r.labels.includes("Needs staff") || r.labels.includes("Waiting on clinic");
    if (filter === "unread") return r.c.unreadCount > 0;
    if (filter === "unbooked") return r.inq?.status === "open";
    if (filter === "qualified") return r.inq?.qualification?.status === "qualified";
    if (filter === "booked") return r.inq?.status === "booked";
    return true;
  });

  const filters: [string, string, number][] = [
    ["", "Tout", counts.all],
    ["needs", "À traiter", counts.needs],
    ["unread", "Non lus", counts.unread],
    ["unbooked", "En cours", counts.unbooked],
    ["qualified", "Qualifiés", counts.qualified],
    ["booked", "Réservés", counts.booked],
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Quotidien"
        title="Boîte de réception"
        description="Les demandes patients à traiter, à relancer, ou déjà réservées."
      />

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters.map(([v, l, n]) => {
          const on = filter === v || (!filter && !v);
          return (
            <Link
              key={v || "all"}
              href={v ? `/inbox?filter=${v}` : "/inbox"}
              className={cn(
                "font-ui shrink-0 rounded-full border px-3 py-2 text-sm",
                on ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink/70",
              )}
            >
              {l}
              <span className={cn("ml-1.5 tabular-nums", on ? "text-white/70" : "text-muted")}>{n}</span>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={rows.length === 0 ? "Votre boîte est calme." : "Rien dans ce filtre."}
            body={
              rows.length === 0
                ? "Les nouvelles demandes WhatsApp apparaîtront ici. Vous pouvez aussi enregistrer un appel manqué ou une demande reçue à l’accueil."
                : "Changez de filtre pour revoir les autres demandes."
            }
            action={
              rows.length === 0 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/missed-call" className="btn-secondary">
                    Appel manqué
                  </Link>
                  <Link href="/inquiries/new" className="btn-primary">
                    Nouvelle demande
                  </Link>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filtered.map(({ c, inq, labels, last }) => {
            const primary = primaryInboxLabel(labels);
            const extras = labels.filter((l) => l !== primary).slice(0, 2);
            const treatment =
              inq?.qualification?.treatment?.name || inq?.qualification?.treatmentLabel || null;
            const when = last?.createdAt ?? c.lastPatientMessageAt;
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox/${c.id}`}
                  className="flex items-start gap-4 px-4 py-4 transition hover:bg-mist/50 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-ui truncate text-[15px] font-semibold">
                        {c.contact.name || c.contact.phoneE164}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="rounded-full bg-accent px-2 py-0.5 font-ui text-[11px] text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="font-ui mt-1 line-clamp-1 text-sm text-muted">
                      {last?.body || (last?.mediaType ? "Média reçu" : "Pas encore de message")}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={toneFor(primary)}>{inboxLabelFr(primary)}</Badge>
                      {extras.map((l) => (
                        <Badge key={l} tone="muted">
                          {inboxLabelFr(l)}
                        </Badge>
                      ))}
                      <Badge tone={c.mode === "human" ? "warn" : "neutral"}>{handlerLabel(c.mode)}</Badge>
                      {treatment && <Badge tone="gold">{treatment}</Badge>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-ui text-xs text-muted">{when ? relativeWhen(when, now) : ""}</p>
                    {inq?.source && (
                      <p className="font-ui mt-1 text-[11px] text-ink/40">{sourceLabel(inq.source)}</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
