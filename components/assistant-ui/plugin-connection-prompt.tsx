"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import { CheckIcon, ExternalLinkIcon, PlugIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { findConfirmedPluginSlugs, findPluginConnectionUrl } from "@/lib/plugin-connections";
import { PENDING_CONNECTION_SESSION_KEY } from "@/lib/integration-key";

type ToolPart = {
  type?: unknown;
  toolName?: unknown;
  result?: unknown;
};

function connectionUrlFromParts(parts: readonly unknown[]): string | null {
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index] as ToolPart;
    if (
      part.type === "tool-call" &&
      typeof part.toolName === "string" &&
      part.toolName.toUpperCase().includes("COMPOSIO_MANAGE_CONNECTIONS")
    ) {
      const url = findPluginConnectionUrl(part.result);
      if (url) return url;
    }
  }
  return null;
}

export function PluginConnectionPrompt() {
  const parts = useAuiState((state) => state.message.parts ?? []);
  const [open, setOpen] = useState(false);
  const [authorizationOpened, setAuthorizationOpened] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const connectionUrl = useMemo(() => connectionUrlFromParts(parts), [parts]);
  const connectionConfirmed = useMemo(
    () => findConfirmedPluginSlugs([{ content: parts }]).size > 0,
    [parts],
  );

  useEffect(() => {
    if (!connectionUrl || connectionConfirmed) return;
    try {
      if (!sessionStorage.getItem(PENDING_CONNECTION_SESSION_KEY)) return;
      sessionStorage.removeItem(PENDING_CONNECTION_SESSION_KEY);
      setOpen(true);
    } catch {
      // Sem autoabertura; o botão Conectar permanece disponível.
    }
  }, [connectionConfirmed, connectionUrl]);

  const openAuthorization = () => {
    if (!connectionUrl) return;
    const authorizationUrl = connectionUrl;
    const width = Math.min(720, Math.max(420, window.screen.availWidth - 80));
    const height = Math.min(820, Math.max(560, window.screen.availHeight - 80));
    const left = Math.max(0, window.screenX + Math.round((window.outerWidth - width) / 2));
    const top = Math.max(0, window.screenY + Math.round((window.outerHeight - height) / 2));
    const features = [
      "popup=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      "resizable=yes",
      "scrollbars=yes",
    ].join(",");

    const existing = popupRef.current;
    const popup =
      existing && !existing.closed
        ? existing
        : window.open(authorizationUrl, "nullain-app-auth", features);
    if (!popup) {
      setPopupBlocked(true);
      return;
    }
    try {
      popup.opener = null;
      if (popup.location.href === "about:blank") popup.location.replace(authorizationUrl);
    } catch {
      // A janela já navegou para outra origem; isso é esperado no OAuth.
    }
    popupRef.current = popup;
    popup.focus();
    setPopupBlocked(false);
    setAuthorizationOpened(true);
  };

  if (!connectionUrl || connectionConfirmed) return null;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4 rounded-2xl border border-foreground/10 bg-muted/30 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-foreground/8">
            <PlugIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Autorize a conexão</p>
            <p className="truncate text-xs text-muted-foreground">
              Continue sem sair da Nullain Agent.
            </p>
          </div>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
          Conectar
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="px-1 pr-10">
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4" />
              Conectar aplicativo
            </DialogTitle>
            <DialogDescription>
              A autorização abre em uma janela compacta sobre a Nullain. Esta página continuará no
              mesmo lugar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-foreground/10 bg-muted/25 px-8 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-foreground/8">
              {authorizationOpened ? (
                <CheckIcon className="size-5 text-emerald-600" />
              ) : (
                <ShieldCheckIcon className="size-5" />
              )}
            </span>
            <p className="mt-4 text-sm font-medium">
              {authorizationOpened ? "Autorização aberta" : "Pronto para conectar"}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {authorizationOpened
                ? "Conclua o acesso na janela de autorização. A conexão será reconhecida automaticamente."
                : "Clique abaixo para entrar no serviço e aprovar o acesso solicitado."}
            </p>
            <Button type="button" className="mt-5" onClick={openAuthorization}>
              <ExternalLinkIcon className="size-3.5" />
              {authorizationOpened ? "Voltar à autorização" : "Abrir autorização"}
            </Button>
            {popupBlocked && (
              <p role="alert" className="mt-3 text-xs text-destructive">
                O navegador bloqueou a janela. Permita pop-ups para este site e tente novamente.
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Fechar</DialogClose>
            <DialogClose render={<Button type="button" />}>Concluí</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
