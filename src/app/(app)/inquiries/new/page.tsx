"use client";

import { useState } from "react";
import { manualInquiryAction } from "@/app/actions/inbox";
import { Field, PageHeader, controlClass } from "@/components/ui";

export default function NewInquiryPage() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <div className="max-w-lg">
      <PageHeader
        eyebrow="Saisie accueil"
        title="Nouvelle demande"
        description="Pour un passage à l’accueil, un numéro dicté, ou une demande reçue ailleurs que sur WhatsApp."
      />
      <form
        className="mt-8 space-y-4"
        action={async (fd) => {
          const source = String(fd.get("origin") ?? "");
          const treatment = String(fd.get("treatmentKnown") ?? "").trim();
          const extra = [source && `Provenance : ${source}`, treatment && `Traitement : ${treatment}`]
            .filter(Boolean)
            .join(" · ");
          const note = [extra, String(fd.get("note") ?? "").trim()].filter(Boolean).join("\n");
          fd.set("note", note);
          try {
            await manualInquiryAction(fd);
            setError(null);
            setOk(true);
          } catch (e) {
            setOk(false);
            setError(e instanceof Error ? e.message : "Impossible d’enregistrer cette demande.");
          }
        }}
      >
        <Field label="Téléphone" required>
          <input name="phone" required inputMode="tel" autoComplete="tel" className={controlClass()} placeholder="06…" />
        </Field>
        <Field label="Nom">
          <input name="name" className={controlClass()} />
        </Field>
        <Field label="D’où vient la demande">
          <select name="origin" className={controlClass()}>
            <option value="Accueil">Passage à l’accueil</option>
            <option value="Téléphone">Téléphone</option>
            <option value="Instagram">Instagram (saisie manuelle)</option>
            <option value="Google">Google / site</option>
            <option value="Autre">Autre</option>
          </select>
        </Field>
        <Field label="Traitement si connu" hint="Optionnel">
          <input name="treatmentKnown" placeholder="Ex. facettes" className={controlClass()} />
        </Field>
        <Field label="Note">
          <textarea name="note" rows={2} className={controlClass()} />
        </Field>
        <label className="font-ui flex items-start gap-2 text-sm">
          <input type="checkbox" name="sendWhatsApp" className="mt-1" />
          <span>
            Envoyer un WhatsApp maintenant
            <span className="mt-0.5 block text-xs text-muted">Le texte ci-dessous partira sur le numéro de la clinique.</span>
          </span>
        </label>
        <Field label="Message WhatsApp" hint="Si vous avez coché l’envoi">
          <textarea name="body" rows={3} className={controlClass()} />
        </Field>
        {error && (
          <p className="font-ui text-sm text-warn" role="alert">
            {error}
          </p>
        )}
        {ok && (
          <p className="font-ui rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent" role="status">
            Demande enregistrée. Elle apparaît dans la boîte de réception.
          </p>
        )}
        <button className="btn-primary" type="submit">
          Enregistrer
        </button>
      </form>
    </div>
  );
}
