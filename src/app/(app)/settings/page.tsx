import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireClinic } from "@/lib/tenancy";
import { getActivationState } from "@/lib/services/onboarding";
import { timeFromDb } from "@/lib/time";
import {
  activateClinicAction,
  addExceptionAction,
  addTreatmentAction,
  deactivateMemberAction,
  inviteUserAction,
  pauseClinicAction,
  resetMemberPasswordAction,
  saveClinicBasicsAction,
  saveHoursAction,
  saveKnowledgeAction,
  saveWhatsAppAction,
} from "@/app/actions/clinic";
import { Card, CardTitle, Field, PageHeader, SetupProgress, controlClass } from "@/components/ui";
import { cityLabel, clinicStatusLabel, setupChecklist, treatmentCategoryFr } from "@/lib/copy";
import { formatCasablanca } from "@/lib/time";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ activation?: string }>;
}) {
  const ctx = await requireClinic("view").catch(() => null);
  if (!ctx) redirect("/clinics");
  const { activation } = await searchParams;
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    include: {
      knowledge: true,
      treatments: true,
      workingHours: { orderBy: { weekday: "asc" } },
      availabilityExceptions: true,
      whatsappConnection: true,
      memberships: { include: { user: true } },
    },
  });
  const state = await getActivationState(ctx.clinicId);
  const progress = setupChecklist(state);
  const owner = can(ctx, "edit_config");
  const wa = clinic.whatsappConnection;
  const waOk = wa?.status === "active";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Clinique"
        description={
          clinic.status === "active"
            ? "Votre espace est actif. L’accueil travaille dans la boîte de réception."
            : "Votre clinique n’est pas encore active. Complétez les étapes ci-dessous."
        }
        actions={
          ctx.isOperator ? (
            <div className="flex gap-2">
              <form action={activateClinicAction}>
                <button className="btn-primary" type="submit">
                  Activer Selaren
                </button>
              </form>
              <form action={pauseClinicAction}>
                <button className="btn-secondary" type="submit">
                  Mettre en pause
                </button>
              </form>
            </div>
          ) : undefined
        }
      />

      <Card>
        <p className="font-ui text-sm text-muted">
          Statut : <span className="text-ink">{clinicStatusLabel(clinic.status)}</span>
          {" · "}
          {cityLabel(clinic.city)}
        </p>
        {activation === "blocked" && (
          <p className="font-ui mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">
            Impossible d’activer pour le moment. Les étapes marquées d’un cercle restent à compléter.
          </p>
        )}
        {activation === "ok" && (
          <p className="font-ui mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent" role="status">
            Selaren est actif pour cette clinique.
          </p>
        )}
        <div className="mt-5">
          <SetupProgress items={progress.items} percent={progress.percent} />
        </div>
      </Card>

      {!owner && (
        <Card>
          <p className="font-ui text-sm leading-relaxed text-muted">
            L’accueil consulte cette page, mais ne modifie pas la fiche, les horaires ni WhatsApp. Demandez au
            propriétaire pour un changement.
          </p>
        </Card>
      )}

      {owner && (
        <>
          <Card id="identite">
            <CardTitle kicker="Identité">La clinique</CardTitle>
            <form action={saveClinicBasicsAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom" required>
                <input name="name" defaultValue={clinic.name} className={controlClass()} />
              </Field>
              <Field label="Ville" hint="Fixée à Casablanca ou Marrakech">
                <p className="font-ui py-2.5 text-[15px]">{cityLabel(clinic.city)}</p>
              </Field>
              <Field label="Durée d’une consultation" hint="En minutes, entre 15 et 60">
                <input
                  name="defaultSlotMinutes"
                  type="number"
                  defaultValue={clinic.defaultSlotMinutes}
                  className={controlClass()}
                />
              </Field>
              <Field label="Valeur de consultation" hint="Utilisée pour l’estimation de revenus, pas une facture">
                <input
                  name="defaultConsultationValueMad"
                  type="number"
                  defaultValue={clinic.defaultConsultationValueMad ? Number(clinic.defaultConsultationValueMad) : ""}
                  placeholder="MAD"
                  className={controlClass()}
                />
              </Field>
              <label className="font-ui flex items-start gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="depositTypicallyRequired" defaultChecked={clinic.depositTypicallyRequired} className="mt-1" />
                <span>
                  Un acompte est habituellement demandé
                  <span className="mt-0.5 block text-xs text-muted">
                    Selaren le note. Il n’encaisse rien.
                  </span>
                </span>
              </label>
              <div className="sm:col-span-2">
                <button className="btn-primary" type="submit">
                  Enregistrer l’identité
                </button>
              </div>
            </form>
          </Card>

          <Card id="connaissance">
            <CardTitle kicker="Connaissance" aside={progress.items.find((i) => i.key === "knowledge")?.done ? "✓" : undefined}>
              Ce que Selaren a le droit de dire
            </CardTitle>
            <p className="font-ui mb-5 text-sm leading-relaxed text-muted">
              Cette fiche est le seul contexte de l’assistance automatique, avec les traitements et les horaires. Si un
              prix n’est pas écrit ici, il ne sera pas inventé.
            </p>
            <form action={saveKnowledgeAction} className="grid gap-4">
              {(
                [
                  ["aboutText", "À propos", "Quartier, langues, ce qui distingue la clinique.", clinic.knowledge?.aboutText],
                  ["tone", "Ton", "Ex. : professionnel, chaleureux, sans familiarité.", clinic.knowledge?.tone],
                  ["pricingNotes", "Tarifs autorisés", "Uniquement les fourchettes que l’accueil assume.", clinic.knowledge?.pricingNotes],
                  ["faqs", "Questions fréquentes", "Réponses courtes, prêtes à envoyer.", clinic.knowledge?.faqs],
                  ["policies", "Politiques", "Acompte, retard, annulation — en texte simple.", clinic.knowledge?.policies],
                  ["bookingRules", "Règles de rendez-vous", "Durée, même jour, qui reçoit en consultation.", clinic.knowledge?.bookingRules],
                  ["doNotSay", "Ne jamais dire", "Diagnostic, garanties, comparaison avec un confrère.", clinic.knowledge?.doNotSay],
                  ["followUpText", "Texte de relance", "Optionnel. Utilisé si le patient ne répond plus.", clinic.knowledge?.followUpText],
                  ["missedCallText", "Texte appel manqué", "Optionnel. Premier message après un appel non abouti.", clinic.knowledge?.missedCallText],
                ] as const
              ).map(([name, label, hint, val]) => (
                <Field key={name} label={label} hint={hint}>
                  <textarea name={name} defaultValue={val ?? ""} rows={3} className={controlClass()} />
                </Field>
              ))}
              <button className="btn-primary" type="submit">
                Enregistrer la fiche
              </button>
            </form>
          </Card>

          <Card id="traitements">
            <CardTitle kicker="Traitements">Soins à forte valeur</CardTitle>
            <ul className="font-ui mb-5 divide-y divide-line text-sm">
              {clinic.treatments.length === 0 && <li className="py-2 text-muted">Ajoutez au moins un traitement pour activer Selaren.</li>}
              {clinic.treatments.map((t) => (
                <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {t.name}
                    <span className="text-muted"> · {treatmentCategoryFr(t.category)}</span>
                    {!t.offered && <span className="text-muted"> · non proposé</span>}
                  </span>
                  {t.estimatedValueMad ? (
                    <span className="tabular-nums text-muted">{Number(t.estimatedValueMad)} MAD</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <form action={addTreatmentAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom" required>
                <input name="name" required placeholder="Ex. Facettes" className={controlClass()} />
              </Field>
              <Field label="Catégorie">
                <select name="category" className={controlClass()}>
                  <option value="implant">Implant</option>
                  <option value="veneer">Facettes</option>
                  <option value="aligner">Aligneurs</option>
                  <option value="orthodontics">Orthodontie</option>
                  <option value="aesthetic">Esthétique</option>
                  <option value="other">Autre</option>
                </select>
              </Field>
              <Field label="Valeur estimée" hint="Optionnel, en MAD">
                <input name="estimatedValueMad" placeholder="MAD" className={controlClass()} />
              </Field>
              <Field label="Ce que l’IA peut en dire">
                <input name="notes" placeholder="Consultation nécessaire, point de départ…" className={controlClass()} />
              </Field>
              <div className="sm:col-span-2">
                <button className="btn-primary" type="submit">
                  Ajouter un traitement
                </button>
              </div>
            </form>
          </Card>

          <Card id="horaires">
            <CardTitle kicker="Horaires">Ouverture</CardTitle>
            <form action={saveHoursAction} className="space-y-2">
              {clinic.workingHours.map((h) => (
                <div key={h.weekday} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                  <label className="font-ui flex min-w-[7.5rem] items-center gap-2 text-sm">
                    <input type="checkbox" name={`enabled_${h.weekday}`} defaultChecked={h.enabled} />
                    {DAYS[h.weekday]}
                  </label>
                  <input type="time" name={`start_${h.weekday}`} defaultValue={timeFromDb(h.startTime).slice(0, 5)} className={controlClass("w-auto")} aria-label={`Ouverture ${DAYS[h.weekday]}`} />
                  <span className="text-muted">→</span>
                  <input type="time" name={`end_${h.weekday}`} defaultValue={timeFromDb(h.endTime).slice(0, 5)} className={controlClass("w-auto")} aria-label={`Fermeture ${DAYS[h.weekday]}`} />
                </div>
              ))}
              <button className="btn-primary mt-3" type="submit">
                Enregistrer les horaires
              </button>
            </form>
            <form action={addExceptionAction} className="mt-6 border-t border-line pt-5">
              <p className="font-ui mb-3 text-sm font-medium">Fermeture exceptionnelle</p>
              <div className="flex flex-wrap gap-2">
                <input type="datetime-local" name="startAt" required className={controlClass("w-auto")} aria-label="Début de fermeture" />
                <input type="datetime-local" name="endAt" required className={controlClass("w-auto")} aria-label="Fin de fermeture" />
                <input name="reason" placeholder="Motif" className={controlClass("w-40")} />
                <button className="btn-secondary" type="submit">
                  Bloquer
                </button>
              </div>
            </form>
            {clinic.availabilityExceptions.length > 0 && (
              <ul className="font-ui mt-4 text-sm text-muted">
                {clinic.availabilityExceptions.map((e) => (
                  <li key={e.id}>
                    {formatCasablanca(e.startAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{" "}
                    → {formatCasablanca(e.endAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card id="whatsapp">
            <CardTitle
              kicker="WhatsApp"
              aside={
                <span className="font-ui text-sm text-muted">{waOk ? "Connecté" : "À configurer"}</span>
              }
            >
              Canal patient
            </CardTitle>
            <p className="font-ui mb-4 text-sm leading-relaxed text-muted">
              Connexion sécurisée. Le jeton d’accès est chiffré et masqué pour l’équipe.
              {wa?.displayPhoneE164 ? ` Numéro affiché : ${wa.displayPhoneE164}.` : ""}
            </p>
            <form action={saveWhatsAppAction} className="grid gap-3">
              <Field label="Identifiant du compte WhatsApp Business" hint="WABA ID, fourni dans Meta">
                <input name="wabaId" defaultValue={wa?.wabaId} className={controlClass()} autoComplete="off" />
              </Field>
              <Field label="Identifiant du numéro" hint="Phone number ID">
                <input name="phoneNumberId" defaultValue={wa?.phoneNumberId} className={controlClass()} autoComplete="off" />
              </Field>
              <Field label="Numéro affiché" hint="Format international, ex. +2126…">
                <input name="displayPhoneE164" defaultValue={wa?.displayPhoneE164} placeholder="+212…" className={controlClass()} />
              </Field>
              <Field label="Jeton d’accès" hint="Laissez vide pour conserver le jeton actuel">
                <input name="accessToken" type="password" placeholder="Nouveau jeton" className={controlClass()} autoComplete="new-password" />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="templatesAcknowledged" defaultChecked={wa?.templatesAcknowledged} className="mt-1" />
                <span>
                  Les modèles WhatsApp sont prêts
                  <span className="mt-0.5 block text-xs text-muted">
                    Nécessaires pour les relances et rappels hors des 24 heures.
                  </span>
                </span>
              </label>
              {ctx.isOperator && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="sessionOnlyPilot" defaultChecked={clinic.sessionOnlyPilot} className="mt-1" />
                  <span>
                    Pilote 24 h uniquement
                    <span className="mt-0.5 block text-xs text-muted">
                      Pour tester avant l’approbation des modèles. Les relances hors fenêtre resteront à l’accueil.
                    </span>
                  </span>
                </label>
              )}
              <button className="btn-primary" type="submit">
                Enregistrer WhatsApp
              </button>
            </form>
          </Card>

          <Card id="equipe">
            <CardTitle kicker="Équipe">Propriétaires et accueil</CardTitle>
            <ul className="divide-y divide-line">
              {clinic.memberships
                .filter((m) => !m.deactivatedAt)
                .map((m) => (
                  <li key={m.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[15px]">{m.user.name}</p>
                      <p className="font-ui text-sm text-muted">
                        {m.user.email} · {m.role === "owner" ? "Propriétaire" : "Accueil"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <form action={resetMemberPasswordAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="userId" value={m.userId} />
                        <input
                          name="password"
                          type="password"
                          required
                          minLength={10}
                          placeholder="Mot de passe temporaire"
                          className={controlClass("w-48")}
                          aria-label={`Nouveau mot de passe pour ${m.user.name}`}
                        />
                        <button className="btn-secondary btn-sm" type="submit">
                          Réinitialiser
                        </button>
                      </form>
                      <form action={deactivateMemberAction}>
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button className="btn-ghost btn-sm" type="submit">
                          Désactiver
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
            </ul>
            <form action={inviteUserAction} className="mt-4 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
              <Field label="Nom" required>
                <input name="name" required className={controlClass()} />
              </Field>
              <Field label="E-mail" required>
                <input name="email" type="email" required className={controlClass()} />
              </Field>
              <Field label="Mot de passe temporaire" hint="Au moins 10 caractères. Changé à la première connexion." required>
                <input name="password" required minLength={10} className={controlClass()} />
              </Field>
              <Field label="Rôle">
                <select name="role" className={controlClass()}>
                  <option value="staff">Accueil</option>
                  <option value="owner">Propriétaire</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <button className="btn-primary" type="submit">
                  Inviter
                </button>
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
