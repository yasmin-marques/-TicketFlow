import QR from 'qrcode'
import { useMemo } from 'react'
import { cn } from '@/lib/cn'

interface QrCodeProps {
  value: string
  /** Lado em px (o SVG escala, mas o tamanho de leitura depende do container). */
  size?: number
  label?: string
  className?: string
  /** Fundo claro (padrão) ou transparente. */
  plain?: boolean
}

/** Módulos do QR como um único `path` SVG (1 unidade = 1 módulo). */
export function buildQr(value: string): { count: number; path: string } {
  const qr = QR.create(value, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  let d = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`
    }
  }
  return { count: n, path: d }
}

/** QR Code real (módulos em SVG, cor `text`), gerado localmente a partir do conteúdo. */
export function QrCode({ value, size = 120, label = 'QR Code do ingresso', className, plain }: QrCodeProps) {
  const { count, path } = useMemo(() => buildQr(value), [value])

  const quiet = 2
  const view = count + quiet * 2
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${view} ${view}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('block max-w-full', !plain && 'bg-white', className)}
    >
      <path d={path} transform={`translate(${quiet} ${quiet})`} fill="#201e1d" />
    </svg>
  )
}
