"use client";

import { useState } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { Field, controlClass } from "@/components/ui";

export default function ChangePasswordPage() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl tracking-tight">Nouveau mot de passe</h1>
      <p className="font-ui mt-2 text-sm leading-relaxed text-muted">
        Première connexion : choisissez un mot de passe personnel, d’au moins 10 caractères.
      </p>
      <form
        className="mt-8 space-y-4"
        action={async (fd) => {
          const res = await changePasswordAction(fd);
          if (res?.error) setError(res.error);
        }}
      >
        <Field label="Mot de passe" required>
          <input name="password" type="password" minLength={10} required autoComplete="new-password" className={controlClass()} />
        </Field>
        {error && (
          <p className="font-ui text-sm text-warn" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary" type="submit">
          Enregistrer
        </button>
      </form>
    </div>
  );
}
