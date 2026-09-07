"use client";

import { useEffect, useRef, useState } from "react";
import {
  type ControlState,
  readControl,
  releaseControl,
  supplySecret,
  takeControl,
} from "@/lib/computers/control";
import { readPageFrame, readScreenshot, type Screenshot } from "@/lib/computers/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** URLs de browser explicitamente em branco usam arte de placeholder. */
function isBlankBrowser(shot: Screenshot): boolean {
  if (shot.url === undefined) return false;
  const url = shot.url.trim();
  return url === "" || url === "about:blank";
}

/** A parte da URL que vale a pena pôr na tela. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * O que cada turno finalizado abriu, e o frame em que parou, fora do componente.
 *
 * MÓDULO-SCOPE, PORQUE O TILE NÃO SOBREVIVE. Um transcript re-renderiza e
 * remonta os tiles; o que fica em state de componente vai junto. Chaveado na
 * tool call (a identidade do turno, não do componente que o desenha).
 */
type RememberedTurn = {
  page?: { url?: string; title?: string };
  frame?: { base64: string; url: string };
  asked?: boolean;
};
const REMEMBERED_TURNS = new Map<string, RememberedTurn>();
const MAX_REMEMBERED_TURNS = 40;

function rememberTurn(toolCallId: string, patch: RememberedTurn): void {
  const existing = REMEMBERED_TURNS.get(toolCallId) ?? {};
  const merged: RememberedTurn = { ...existing, ...patch };
  if (existing.frame) merged.frame = existing.frame;
  REMEMBERED_TURNS.delete(toolCallId);
  REMEMBERED_TURNS.set(toolCallId, merged);
  while (REMEMBERED_TURNS.size > MAX_REMEMBERED_TURNS) {
    const oldest = REMEMBERED_TURNS.keys().next().value;
    if (oldest === undefined) break;
    REMEMBERED_TURNS.delete(oldest);
  }
}

/** Proporção padrão do viewport do browser. */
const DEFAULT_ASPECT_RATIO = 1280 / 800;
const DEFAULT_MIN_WIDTH = 320;
const DEFAULT_MIN_HEIGHT = 200;

/** Pré-carrega sem quebrar o loop de polling quando um frame não decodifica. */
async function preloadFrame(base64: string): Promise<void> {
  try {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
  } catch {
    // Deixa o <img> visível tratar falhas de decode.
  }
}

/** O que o frame diz quando não há imagem nele. */
function NothingToSee({
  problem,
  blankBrowser,
  settled,
  page,
}: {
  problem: string | null;
  blankBrowser: boolean;
  settled?: boolean;
  page?: { url?: string; title?: string } | undefined;
}) {
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center text-sm text-muted-foreground">
      {settled ? (
        <>
          {page?.url ? (
            <>
              <span className="font-medium">{page.title || "A page"}</span>
              <span className="break-all">{hostOf(page.url)}</span>
              <span className="text-xs">
                Opened during this turn. The screen has moved on since.
              </span>
            </>
          ) : (
            <span>This turn did not open a page.</span>
          )}
        </>
      ) : problem ? (
        <>
          <span className="font-medium">You cannot see the screen right now</span>
          <span>{problem}</span>
        </>
      ) : blankBrowser ? (
        <span>The assistant has not opened a page yet.</span>
      ) : (
        <span>Waiting for the assistant&apos;s screen…</span>
      )}
    </span>
  );
}

// Ciclos de settle e timeouts.
const SETTLED_FRAMES = 3;
const SETTLE_TIMEOUT_MS = 30_000;
const SECRET_CONFIRM_MS = 6_000;

type Props = {
  computerId: string;
  active?: boolean;
  intervalMs?: number;
  aspectRatio?: number;
  minWidth?: number;
  minHeight?: number;
  name?: string;
  page?: { url?: string; title?: string };
  finished?: boolean;
  toolCallId?: string;
};

/**
 * ComputerView portado do OpenBot para a UI Nullain (Inversão FASE 5).
 * Polling de screenshot + controle + secret + take control. O valor do secret
 * vai direto ao caminho da página e nunca entra na conversa (o audit grava só
 * o comprimento, como no OpenBot).
 */
export function ComputerView({
  computerId,
  active = true,
  intervalMs = 1000,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  name,
  page,
  finished,
  toolCallId,
}: Props) {
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [control, setControl] = useState<ControlState | null>(null);
  const [secret, setSecret] = useState("");
  const [secretProblem, setSecretProblem] = useState<string | null>(null);
  const [sendingSecret, setSendingSecret] = useState(false);
  const driving = control?.holder === "human";
  const drivingRef = useRef(false);
  drivingRef.current = driving;

  const handBack = async () => {
    const state = await releaseControl(computerId);
    if (state) setControl(state);
  };

  const secretPending = Boolean(control?.secretWanted);
  const secretPendingRef = useRef(false);
  secretPendingRef.current = secretPending;
  const generation = useRef(0);
  const watchUntil = useRef(0);

  // Turno finalizado é história; se tem página, lembra (para os frames).
  if (toolCallId && page?.url) rememberTurn(toolCallId, { page });
  const knownPage =
    page?.url !== undefined
      ? page
      : toolCallId
        ? REMEMBERED_TURNS.get(toolCallId)?.page
        : undefined;
  const keptFrame = toolCallId ? (REMEMBERED_TURNS.get(toolCallId)?.frame ?? null) : null;
  const [, setFrameArrived] = useState(0);

  const settled = !active && (finished || Boolean(knownPage));

  // Frame histórico (turno encerrado): busca uma vez e guarda.
  useEffect(() => {
    if (!toolCallId || !settled) return;
    const remembered = REMEMBERED_TURNS.get(toolCallId);
    if (remembered?.frame || remembered?.asked) return;
    let current = true;
    void (async () => {
      const stored = await readPageFrame(computerId, toolCallId);
      if (!current) return;
      rememberTurn(toolCallId, {
        asked: true,
        ...(stored ? { frame: { base64: stored.frame, url: stored.url } } : {}),
      });
      if (stored) setFrameArrived((n) => n + 1);
    })();
    return () => {
      current = false;
    };
  }, [computerId, toolCallId, settled]);

  // Polling de screenshot.
  useEffect(() => {
    if (settled) return;
    const mine = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    let unchanged = 0;
    let lastFrame = "";
    const graceStartedAt = Date.now();

    const shouldContinue = () => {
      if (active) return true;
      if (drivingRef.current) return true;
      if (secretPendingRef.current) return true;
      if (Date.now() < watchUntil.current) return true;
      if (Date.now() - graceStartedAt > SETTLE_TIMEOUT_MS) return false;
      return unchanged < SETTLED_FRAMES;
    };

    const tick = async () => {
      try {
        const { frame, error } = await readScreenshot(computerId);
        if (generation.current !== mine) return;
        if (!frame) {
          setProblem(error ?? "The screen is not available right now.");
        } else {
          unchanged = frame.base64 === lastFrame ? unchanged + 1 : 0;
          lastFrame = frame.base64;
          await preloadFrame(frame.base64);
          if (generation.current !== mine) return;
          setShot(frame);
          setProblem(null);
        }
      } finally {
        if (generation.current === mine && shouldContinue()) {
          timer = setTimeout(tick, intervalMs);
        }
      }
    };

    void tick();
    return () => {
      generation.current++;
      clearTimeout(timer);
    };
    // secretPending reinicia o polling por design (via ref).
    // biome-ignore lint/correctness/useExhaustiveDependencies: driving é via ref.
  }, [computerId, active, intervalMs, secretPending, settled]);

  // Polling de controle (para pedidos de ajuda/secret aparecerem).
  useEffect(() => {
    if (settled) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const state = await readControl(computerId);
      if (!live) return;
      if (state) setControl(state);
      timer = setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [computerId, settled]);

  const blankBrowser = !settled && shot ? isBlankBrowser(shot) : false;
  const frameStyle = { aspectRatio, minWidth, minHeight };

  const drawn = settled ? keptFrame : shot ? { base64: shot.base64, url: shot.url ?? "" } : null;
  const showScreen = drawn !== null && !blankBrowser;
  const wheelHere = driving && !settled;

  return (
    <>
      <figure className="w-full overflow-hidden rounded-2xl border">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="relative flex w-full items-center justify-center cursor-pointer bg-muted"
          style={frameStyle}
          aria-label="Open the assistant's screen full size"
        >
          {showScreen && drawn ? (
            <img
              src={`data:image/png;base64,${drawn.base64}`}
              alt="What the assistant is looking at"
              className="absolute inset-0 m-auto max-h-full max-w-full object-contain opacity-100 transition-opacity duration-300"
            />
          ) : null}

          {name || wheelHere ? (
            <span className="absolute right-2 bottom-2 flex items-center gap-1.5">
              {name ? (
                <span className="flex items-center gap-1.5 rounded-full bg-black/60 py-1 pr-2.5 pl-1.5 text-xs font-medium text-white backdrop-blur-sm">
                  {name}
                </span>
              ) : null}
              {wheelHere ? (
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-black shadow-sm">
                  You have control
                </span>
              ) : null}
            </span>
          ) : null}

          {showScreen ? null : (
            <NothingToSee
              blankBrowser={blankBrowser}
              page={knownPage}
              problem={problem}
              settled={settled}
            />
          )}
        </button>

        {/* Bot PEDINDO o volante (estado excecional com motivo). */}
        {!driving && !settled && control?.requested ? (
          <div className="flex items-start justify-between gap-3 border-t bg-amber-500/10 px-3 py-2 text-sm">
            <span>
              <strong className="font-medium">The assistant needs you.</strong> {control.reason}
            </span>
            <Button
              size="sm"
              onClick={async () => {
                const state = await takeControl(computerId);
                if (state) setControl(state);
                setExpanded(true);
              }}
            >
              Take control
            </Button>
          </div>
        ) : null}

        {/* Secret: vai direto à página, nunca entra na conversa. */}
        {control?.secretWanted ? (
          <form
            className="border-t bg-muted/40 px-3 py-2 text-sm"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!secret || sendingSecret) return;
              setSendingSecret(true);
              watchUntil.current = Date.now() + SECRET_CONFIRM_MS;
              const result = await supplySecret(computerId, secret);
              setSendingSecret(false);
              setSecret("");
              setSecretProblem(result.ok ? null : (result.error ?? null));
              const state = await readControl(computerId);
              if (state) setControl(state);
            }}
          >
            <label className="block" htmlFor="openbot-secret">
              <span className="font-medium">The assistant needs </span>
              <span>{control.secretWanted}</span>
            </label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="openbot-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Typed here, never shown to the assistant"
                className="min-w-0 flex-1"
              />
              <Button type="submit" disabled={!secret || sendingSecret} size="sm">
                {sendingSecret ? "Sending…" : "Send to the page"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              This goes straight to the page. It is not shown in the conversation and the assistant
              never receives it.
            </p>
            {secretProblem ? (
              <p className="mt-1 text-xs text-destructive">{secretProblem}</p>
            ) : null}
          </form>
        ) : null}

        {/* Rodapé: só quando há interação real (pedido de ajuda, segredo ou
          pessoa dirigindo). No modo "só assistindo" o tile já mostra a tela
          ao vivo com o badge de nome — um rodapé com botão em CADA tile
          (uma resposta pode ter vários navigates) era ruído visual. */}
        {!settled && (driving || control?.requested || control?.secretWanted) ? (
          <div
            className={cn(
              "flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground",
            )}
          >
            <span>
              {driving ? "You control this computer" : "The assistant controls this computer"}
            </span>
            {driving ? (
              <Button size="sm" variant="outline" onClick={handBack}>
                Hand back
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={async () => {
                  const state = await takeControl(computerId);
                  if (state) setControl(state);
                  setExpanded(true);
                }}
              >
                Take control
              </Button>
            )}
          </div>
        ) : null}
      </figure>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="h-[94vh] w-[96vw] max-w-[1800px] p-2 sm:max-w-[1800px]">
          <DialogTitle className="sr-only">Tela do computador da assistente</DialogTitle>
          {drawn ? (
            <img
              src={`data:image/png;base64,${drawn.base64}`}
              alt="Tela ampliada do computador da assistente"
              className="h-full min-h-0 w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
