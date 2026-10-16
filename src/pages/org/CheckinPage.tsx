import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, CameraOff, Flashlight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { orgKeys, useCheckinStats } from '@/features/org/hooks'
import { useQrScanner } from '@/features/org/checkin/useQrScanner'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/format'
import { ApiError, USE_MOCKS } from '@/services/api/http'
import { orgService } from '@/services/api/org.service'
import type { CheckinResult } from '@/types/organizer'

const RESULT_MS = 3000

const LOOK: Record<CheckinResult['result'], { bg: string; icon: string; title: string }> = {
  valid: { bg: 'bg-success', icon: '✓', title: 'Entrada autorizada' },
  used: { bg: 'bg-warning', icon: '!', title: 'Ingresso já utilizado' },
  invalid: { bg: 'bg-accent-700', icon: '✕', title: 'Entrada não autorizada' },
}

/**
 * /org/checkin/:eventId — scanner de portaria (tablet/celular). A tela só lê o
 * código e exibe o veredito do servidor: válido, já utilizado ou inválido.
 */
export function CheckinPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const queryClient = useQueryClient()
  const { data: stats, isPending, error, refetch } = useCheckinStats(eventId)
  useDocumentTitle(stats ? `Check-in · ${stats.eventTitle}` : 'Check-in')

  const [gate, setGate] = useState('Portão A')
  const [manual, setManual] = useState('')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const validate = useMutation({
    mutationFn: (code: string) => orgService.checkin(eventId, code, gate),
    onSuccess: (r) => {
      setNetworkError(null)
      setResult(r)
      navigator.vibrate?.(r.result === 'valid' ? 80 : [120, 60, 120])
      void queryClient.invalidateQueries({ queryKey: orgKeys.checkin(eventId) })
      void queryClient.invalidateQueries({ queryKey: ['org', 'attendees'] })
    },
    onError: (err) => {
      setNetworkError(
        err instanceof ApiError
          ? err.code === 'EVENT_NOT_ACTIVE' ? err.message : err.status === null ? 'Sem conexão. A leitura NÃO foi registrada — tente de novo.' : err.message
          : 'Não foi possível validar agora. Tente de novo.',
      )
    },
  })

  const submitCode = useCallback(
    (raw: string) => {
      const code = raw.trim()
      if (!code || validate.isPending) return
      // A câmera lê o mesmo QR várias vezes por segundo: ignora repetições imediatas.
      const now = Date.now()
      if (lastScan.current.code === code && now - lastScan.current.at < RESULT_MS + 500) return
      lastScan.current = { code, at: now }
      validate.mutate(code)
    },
    [validate],
  )

  const scanner = useQrScanner(videoRef, submitCode)

  // Resultado em tela cheia por 3 s e reinício automático para o próximo ingresso.
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => {
      setResult(null)
      setManual('')
      inputRef.current?.focus()
    }, RESULT_MS)
    return () => window.clearTimeout(t)
  }, [result])

  if (!eventId) return <Navigate to="/org/checkin" replace />

  const pct = stats && stats.sold ? Math.round((stats.checkedIn / stats.sold) * 100) : 0
  const look = result ? LOOK[result.result] : null

  return (
    <div className="mx-auto flex min-h-dvh max-w-[834px] flex-col bg-bg">
      <header className="flex flex-none items-center justify-between gap-3 border-b-2 border-divider px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <Link to="/org/checkin" className="text-muted text-xs font-semibold no-underline hover:text-text">← Painel</Link>
          <h1 className="m-0 text-lg leading-tight font-extrabold tracking-normal">Check-in</h1>
          <div className="text-muted flex items-center gap-1 truncate text-xs">
            {stats?.eventTitle ?? '…'} ·
            <Select
              bare
              value={gate}
              onChange={setGate}
              aria-label="Portão"
              options={(stats?.gates ?? ['Portão A']).map((g) => ({ value: g, label: g }))}
              className="text-xs"
            />
          </div>
        </div>
        <div className="text-right" aria-live="polite">
          <b className="tabular text-[22px]">
            {stats?.checkedIn.toLocaleString('pt-BR') ?? '—'} <span className="text-muted text-sm">/ {stats?.sold.toLocaleString('pt-BR') ?? '—'}</span>
          </b>
          <div className="text-muted text-xs">{pct}% · {stats?.perMinute.toLocaleString('pt-BR') ?? 0} / min</div>
        </div>
      </header>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Check-ins realizados" className="h-1.5 flex-none bg-neutral-300">
        <div className="h-full bg-text transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      {error && !stats ? (
        <div className="p-4">
          <LoadError title="Não foi possível carregar o check-in." error={error} onRetry={() => refetch()} />
        </div>
      ) : isPending ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <main className="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-6">
          {/* Visor da câmera */}
          <div
            className="relative grid h-[min(380px,42dvh)] flex-none place-items-center overflow-hidden"
            style={{ background: 'repeating-linear-gradient(135deg,#3a3736 0 14px,#2d2b2b 14px 28px)' }}
          >
            <video ref={videoRef} muted playsInline aria-label="Câmera" className={cn('absolute inset-0 size-full object-cover', scanner.state !== 'on' && scanner.state !== 'no-detector' && 'hidden')} />
            <div aria-hidden className="relative size-[min(240px,60%)] aspect-square">
              {['left-0 top-0 border-l-[5px] border-t-[5px]', 'right-0 top-0 border-r-[5px] border-t-[5px]', 'left-0 bottom-0 border-l-[5px] border-b-[5px]', 'right-0 bottom-0 border-r-[5px] border-b-[5px]'].map((c) => (
                <i key={c} className={cn('absolute size-11 border-accent', c)} />
              ))}
            </div>
            <span className="absolute inset-x-0 bottom-3 px-3 text-center text-[13px] font-semibold text-neutral-100">
              {scanner.state === 'on' ? 'Aponte a câmera para o QR Code' : scanner.state === 'no-detector' ? 'Câmera ligada, mas este navegador não lê QR automaticamente — digite o código' : 'Câmera desligada'}
            </span>
            <div className="absolute top-3 right-3 flex gap-2">
              {scanner.torchAvailable && (
                <button type="button" onClick={scanner.toggleTorch} aria-pressed={scanner.torch} className="inline-flex items-center gap-1.5 bg-bg px-3 py-1.5 text-xs font-semibold">
                  <Flashlight size={13} aria-hidden /> Lanterna
                </button>
              )}
              <button
                type="button"
                onClick={() => (scanner.state === 'on' || scanner.state === 'no-detector' ? scanner.stop() : void scanner.start())}
                className="inline-flex items-center gap-1.5 bg-bg px-3 py-1.5 text-xs font-semibold"
                disabled={scanner.state === 'starting'}
              >
                {scanner.state === 'on' || scanner.state === 'no-detector' ? <><CameraOff size={13} aria-hidden /> Desligar câmera</> : <><Camera size={13} aria-hidden /> {scanner.state === 'starting' ? 'Abrindo…' : 'Ligar câmera'}</>}
              </button>
            </div>
          </div>
          {scanner.state === 'denied' && <Alert tone="warning" title="Permissão da câmera negada">{' '}Libere a câmera nas configurações do navegador ou use o código digitado.</Alert>}
          {scanner.state === 'unsupported' && <Alert tone="warning" title="Câmera indisponível">{' '}Este aparelho/navegador não permite acesso à câmera. Use o código digitado.</Alert>}
          {scanner.state === 'error' && <Alert title="Não foi possível abrir a câmera">{' '}Tente de novo ou use o código digitado.</Alert>}
          {networkError && <Alert title={networkError} />}

          {/* Código manual */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitCode(manual)
            }}
            className="flex flex-none gap-2"
          >
            <label className="sr-only" htmlFor="manual-code">Código do ingresso</label>
            <input
              id="manual-code"
              ref={inputRef}
              value={manual}
              onChange={(e) => setManual(e.target.value.toUpperCase())}
              placeholder="Ou digite o código: TF-····-····"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="min-w-0 flex-1 border border-divider bg-surface px-3.5 py-3 font-mono text-sm"
            />
            <Button type="submit" variant="secondary" className="px-5" disabled={validate.isPending || !manual.trim()}>
              {validate.isPending ? 'Validando…' : 'Validar'}
            </Button>
          </form>

          {/* Resultados possíveis */}
          <h2 className="mt-1 mb-0 text-[13px] tracking-[0.08em] uppercase">Resultados possíveis</h2>
          <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-rows-3">
            {(['valid', 'used', 'invalid'] as const).map((k) => (
              <li key={k} className={cn('flex items-center gap-5 px-5 py-4 text-white', LOOK[k].bg)}>
                <span aria-hidden className="text-[40px] leading-none font-extrabold">{LOOK[k].icon}</span>
                <div>
                  <div className="text-xl font-extrabold">{LOOK[k].title}</div>
                  <div className="text-sm">{k === 'valid' ? 'Nome · setor · assento' : k === 'used' ? 'Check-in realizado às HH:MM · Portão' : 'Ingresso inválido ou de outro evento'}</div>
                </div>
              </li>
            ))}
          </ul>

          {stats && stats.recent.length > 0 && (
            <section aria-label="Últimas leituras">
              <h2 className="mt-3 mb-1 text-[13px] tracking-[0.08em] uppercase">Últimas leituras</h2>
              <ul className="m-0 list-none border-t-2 border-text p-0">
                {stats.recent.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-b border-neutral-300 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span aria-hidden className={cn('mr-2 inline-block size-2.5', r.result === 'valid' ? 'bg-success' : r.result === 'used' ? 'bg-warning' : 'bg-accent-700')} />
                      <span className="sr-only">{LOOK[r.result].title}: </span>
                      {r.holderName ?? 'Ingresso inválido'} <span className="text-muted font-mono text-xs">{r.code}</span>
                    </span>
                    <span className="text-muted tabular text-xs">{r.gate} · {formatTime(r.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {USE_MOCKS && <TestCodes eventId={eventId} onPick={submitCode} />}
        </main>
      )}

      {/* Resultado em tela cheia (3 s) */}
      {result && look && (
        <div
          role="alert"
          aria-live="assertive"
          onClick={() => setResult(null)}
          className={cn('fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-4 p-8 text-center text-white', look.bg)}
        >
          <div aria-hidden className="text-[120px] leading-none font-extrabold">{look.icon}</div>
          <div className="text-[40px] leading-tight font-extrabold">{look.title}</div>
          {result.holderName && <div className="text-2xl font-semibold">{result.holderName}</div>}
          {result.result === 'valid' && <div className="text-lg">{[result.sector ?? result.typeName, result.seat].filter(Boolean).join(' · ')}</div>}
          {result.result === 'used' && <div className="text-lg">Check-in realizado às {result.checkedInAt ? formatTime(result.checkedInAt) : '—'}{result.gate ? ` · ${result.gate}` : ''}</div>}
          {result.result === 'invalid' && <div className="text-lg">{result.message}</div>}
          <div className="mt-4 font-mono text-sm opacity-80">{result.code}</div>
          <div className="mt-2 h-1.5 w-56 bg-white/30"><div className="h-full bg-white" style={{ animation: `tf-shrink ${RESULT_MS}ms linear forwards` }} /></div>
          <div className="text-xs opacity-80">Toque para continuar</div>
        </div>
      )}
    </div>
  )
}

/** Só no mock: códigos reais do evento para testar sem câmera. */
function TestCodes({ eventId, onPick }: { eventId: string; onPick: (code: string) => void }) {
  const [codes, setCodes] = useState<Array<{ code: string; name: string; used: boolean }>>([])
  useEffect(() => {
    let alive = true
    void orgService.attendees({ eventId, q: '', status: 'waiting', page: 1, pageSize: 3 }).then((w) =>
      orgService.attendees({ eventId, q: '', status: 'checked-in', page: 1, pageSize: 1 }).then((c) => {
        if (alive) setCodes([...w.items.map((a) => ({ code: a.code, name: a.name, used: false })), ...c.items.map((a) => ({ code: a.code, name: a.name, used: true }))])
      }),
    ).catch(() => undefined)
    return () => { alive = false }
  }, [eventId])
  return (
    <details className="border-2 border-dashed border-neutral-500 p-3 text-xs">
      <summary className="cursor-pointer font-semibold">Ambiente de simulação · códigos de teste</summary>
      <p className="text-muted my-2">Toque para simular a leitura. Ingressos comprados na jornada do comprador também valem para eventos do mesmo link.</p>
      <div className="flex flex-wrap gap-2">
        {codes.map((c) => (
          <button key={c.code} type="button" onClick={() => onPick(c.code)} className="border border-divider px-2.5 py-1.5 text-left hover:bg-text/7">
            <span className="font-mono">{c.code}</span>
            <span className="text-muted block">{c.name} · {c.used ? 'já utilizado' : 'válido'}</span>
          </button>
        ))}
        <button type="button" onClick={() => onPick('TF-ZZZZ-0000')} className="border border-divider px-2.5 py-1.5 text-left hover:bg-text/7">
          <span className="font-mono">TF-ZZZZ-0000</span>
          <span className="text-muted block">inexistente · inválido</span>
        </button>
      </div>
    </details>
  )
}
