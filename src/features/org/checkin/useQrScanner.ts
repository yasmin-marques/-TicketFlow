import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type ScannerState = 'off' | 'starting' | 'on' | 'no-detector' | 'denied' | 'unsupported' | 'error'

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike
  }
}

/**
 * Leitura de QR Code pela câmera (getUserMedia + BarcodeDetector quando o
 * navegador oferece). Sem suporte, o app continua funcionando pelo código
 * digitado. A leitura só entrega o texto: quem decide se o ingresso é válido
 * é o servidor.
 */
export function useQrScanner(videoRef: RefObject<HTMLVideoElement | null>, onCode: (code: string) => void) {
  const [state, setState] = useState<ScannerState>('off')
  const [torch, setTorchState] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const timer = useRef<number | null>(null)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setTorchState(false)
    setTorchAvailable(false)
    setState('off')
  }, [videoRef])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setState('unsupported')
    setState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return stop()
      video.srcObject = stream
      await video.play()
      const track = stream.getVideoTracks()[0]
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
      setTorchAvailable(!!caps?.torch)
      setState('on')

      if (!window.BarcodeDetector) return setState('no-detector') // câmera ok, leitura automática não
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      timer.current = window.setInterval(async () => {
        if (video.readyState < 2) return
        try {
          const found = await detector.detect(video)
          if (found[0]?.rawValue) onCodeRef.current(found[0].rawValue)
        } catch {
          /* frame ilegível: tenta no próximo */
        }
      }, 250)
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error')
    }
  }, [videoRef, stop])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torch
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchState(next)
    } catch {
      setTorchAvailable(false)
    }
  }, [torch])

  useEffect(() => stop, [stop])

  return { state, start, stop, torch, torchAvailable, toggleTorch, detectorSupported: typeof window !== 'undefined' && !!window.BarcodeDetector }
}
