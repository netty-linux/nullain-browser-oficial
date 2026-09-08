"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyholeIcon } from "lucide-react";
import { NullainLogo } from "@/components/nullain-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NullainCodeLoginForm({ unavailable }: { unavailable?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(unavailable);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, callbackURL: "/code" }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Muitas tentativas. Aguarde um minuto."
            : "E-mail ou senha inválidos.",
        );
      router.replace("/code");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_top,hsl(var(--muted))_0,transparent_50%)] p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border bg-background/95 p-7 shadow-xl"
      >
        <div className="mb-7 flex items-center gap-3">
          <NullainLogo className="size-10" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Nullain Code</h1>
            <p className="text-sm text-muted-foreground">Workspace local protegido</p>
          </div>
        </div>
        <label className="mb-2 block text-sm font-medium" htmlFor="email">
          E-mail
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label className="mb-2 mt-4 block text-sm font-medium" htmlFor="password">
          Senha
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && (
          <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
        <Button className="mt-5 w-full" type="submit" disabled={busy || Boolean(unavailable)}>
          <LockKeyholeIcon className="size-4" /> {busy ? "Entrando…" : "Entrar"}
        </Button>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Novas contas são criadas somente pelo terminal local. Não há recuperação por e-mail.
        </p>
      </form>
    </div>
  );
}
