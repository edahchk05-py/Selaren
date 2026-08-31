"use client";

import { useState } from "react";
import { missedCallAction } from "@/app/actions/inbox";
import { Field, PageHeader, controlClass } from "@/components/ui";

export default function MissedCallPage() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<"sent" | "booked" | null>(null);
  return (
    <div className="max-w-lg">
      <PageHeader
        eyebrow="Récupération"
        title="Appel manqué"
        description="Saisissez le numéro. Nous enverrons un message WhatsApp pour récupérer cette demande. Pas de standard téléphonique."
      />
      <form
        className="mt-8 space-y-4"
        action={async (fd) => {
          setOk(null);
          try {
            const res = await missedCallAction(fd);
            setError(null);
            setOk(res?.booked ? "booked" : "sent");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Impossible d’enregistrer ce numéro.");
          }
        }}
      >
        <Field label="Numéro" hint="06… ou +212…" required>
          <input name="phone" required inputMode="tel" autoComplete="tel" className={controlClass()} placeholder="06…" />
        </Field>
        <Field label="Nom" hint="Si vous l’avez">
          <input name="name" className={controlClass()} />
        </Field>
        <Field label="Note interne">
          <textarea name="notes" rows={2} className={controlClass()} />
        </Field>
        {error && (
          <p className="font-ui text-sm text-warn" role="alert">
            {error}
          </p>
        )}
        {ok === "sent" && (
          <p className="font-ui rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent" role="status">
            Message WhatsApp envoyé pour récupérer la demande.
          </p>
        )}
        {ok === "booked" && (
          <p className="font-ui rounded-lg bg-mist px-3 py-2 text-sm text-ink" role="status">
            Ce numéro a déjà un rendez-vous. Aucun message commercial n’a été envoyé.
          </p>
        )}
        <button className="btn-primary" type="submit">
          Envoyer un message WhatsApp
        </button>
      </form>
    </div>
  );
}
