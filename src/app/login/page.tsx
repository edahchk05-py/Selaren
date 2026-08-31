"use client";

import { useState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Field, controlClass } from "@/components/ui";
import { PRODUCT_LINE } from "@/lib/copy";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gold" style={{ fontFamily: "var(--font-ui), system-ui" }}>
          Selaren
        </p>
        <h1 className="mt-3 text-4xl tracking-tight">Selaren</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink/75">{PRODUCT_LINE}</p>
        <p className="font-ui mt-2 text-sm leading-relaxed text-gold">
          Ne perdez plus le patient que vous avez déjà payé pour attirer.
        </p>
        <form
          className="mt-10 space-y-4"
          action={async (fd) => {
            try {
              const res = await loginAction(fd);
              if (res?.error) setError(res.error);
            } catch {
              setError("Connexion impossible pour le moment. Réessayez dans un instant.");
            }
          }}
        >
          <Field label="E-mail" required>
            <input name="email" type="email" required autoComplete="username" className={controlClass()} />
          </Field>
          <Field label="Mot de passe" required>
            <input name="password" type="password" required autoComplete="current-password" className={controlClass()} />
          </Field>
          {error && (
            <p className="font-ui text-sm text-warn" role="alert">
              {error}
            </p>
          )}
          <button className="btn-primary w-full" type="submit">
            Entrer
          </button>
        </form>
      </div>
    </div>
  );
}
