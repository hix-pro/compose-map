import { AlertTriangle, Check, Upload } from 'lucide-react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { Header } from './components/Header'
import { SourcePanel } from './components/SourcePanel'
import { GraphPanel } from './components/GraphPanel'
import { FindingsPanel } from './components/FindingsPanel'
import { CompareDialog } from './components/CompareDialog'
import { analyzeCompose } from './lib/analyze'
import { parseCompose } from './lib/parse-compose'
import { defaultSample, findSample, type ComposeSample } from './lib/samples'

const STORAGE_KEY = 'compose-map:session:v1'
const MAX_FILE_BYTES = 1_000_000

interface Session {
  source: string
  filename: string
  sampleId: string | null
}

function loadSession(): Session {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Session>
      if (typeof parsed.source === 'string' && parsed.source.trim()) {
        return {
          source: parsed.source,
          filename:
            typeof parsed.filename === 'string' && parsed.filename
              ? parsed.filename
              : defaultSample.filename,
          sampleId: typeof parsed.sampleId === 'string' ? parsed.sampleId : null,
        }
      }
    }
  } catch {
    // Storage can be unavailable in private or locked-down browsers.
  }
  return {
    source: defaultSample.yaml,
    filename: defaultSample.filename,
    sampleId: defaultSample.id,
  }
}

interface Toast {
  id: number
  message: string
  tone: 'ok' | 'error'
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export default function App() {
  const [initial] = useState(loadSession)
  const [source, setSource] = useState(initial.source)
  const [filename, setFilename] = useState(initial.filename)
  const [activeSampleId, setActiveSampleId] = useState<string | null>(initial.sampleId)
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [dragging, setDragging] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const dragDepth = useRef(0)

  const notify = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ id: Date.now(), message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ source, filename, sampleId: activeSampleId }),
      )
    } catch {
      // Persistence is a convenience; the editor still works without it.
    }
  }, [source, filename, activeSampleId])

  const deferredSource = useDeferredValue(source)
  const parseResult = useMemo(
    () => parseCompose(deferredSource, filename),
    [deferredSource, filename],
  )
  const analysis = useMemo(
    () => (parseResult.model ? analyzeCompose(parseResult.model) : null),
    [parseResult.model],
  )

  useEffect(() => {
    if (!parseResult.model || !selectedService) return
    const exists = parseResult.model.services.some(
      (service) => service.name === selectedService,
    )
    if (!exists) setSelectedService(null)
  }, [parseResult.model, selectedService])

  function loadSample(sample: ComposeSample) {
    setSource(sample.yaml)
    setFilename(sample.filename)
    setActiveSampleId(sample.id)
    setSelectedService(null)
  }

  function resetSample() {
    loadSample(findSample(activeSampleId ?? '') ?? defaultSample)
  }

  async function loadFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      notify('That file is larger than 1 MB. Compose files should be tiny.', 'error')
      return
    }
    try {
      const text = await file.text()
      if (!text.trim()) {
        notify('That file is empty.', 'error')
        return
      }
      setSource(text)
      setFilename(file.name)
      setActiveSampleId(null)
      setSelectedService(null)
      notify(`Loaded ${file.name}`)
    } catch {
      notify('Could not read that file.', 'error')
    }
  }

  function handleDragEnter(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function handleDragOver(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event: DragEvent) {
    if (!hasFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void loadFile(file)
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col bg-ink-950 text-slate-200 lg:h-dvh lg:overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(198,245,110,0.055),transparent_75%)]" />

      <Header />

      <main className="relative z-10 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[296px_minmax(0,1fr)_340px] xl:grid-cols-[330px_minmax(0,1fr)_382px] lg:overflow-hidden">
        <SourcePanel
          source={source}
          filename={filename}
          activeSampleId={activeSampleId}
          error={parseResult.error}
          analysis={analysis}
          onChange={(value) => {
            setSource(value)
            setActiveSampleId(null)
          }}
          onLoadSample={loadSample}
          onLoadFile={(file) => void loadFile(file)}
          onReset={resetSample}
          onCompare={() => setCompareOpen(true)}
        />

        <GraphPanel
          model={parseResult.model}
          analysis={analysis}
          error={parseResult.error}
          filename={filename}
          selectedService={selectedService}
          onSelectService={setSelectedService}
          onLoadDefaultSample={() => loadSample(defaultSample)}
          onNotify={notify}
        />

        <div className="min-h-0">
          <FindingsPanel
            analysis={analysis}
            model={parseResult.model}
            selectedService={selectedService}
            onClearService={() => setSelectedService(null)}
          />
        </div>
      </main>

      {compareOpen && (
        <CompareDialog
          source={source}
          filename={filename}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={[
            'toast-in fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-medium shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur',
            toast.tone === 'error'
              ? 'border-crit/30 bg-[#1a0e11]/95 text-crit'
              : 'border-acid/25 bg-[#11170d]/95 text-acid',
          ].join(' ')}
        >
          {toast.tone === 'error' ? (
            <AlertTriangle size={12} strokeWidth={2.2} />
          ) : (
            <Check size={12} strokeWidth={2.6} />
          )}
          {toast.message}
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/85 backdrop-blur-sm">
          <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-acid/40" />
          <div className="relative flex flex-col items-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-acid/30 bg-acid/10 text-acid">
              <Upload size={24} strokeWidth={1.8} />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-slate-100">
              Drop your Compose file
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              .yml or .yaml · parsed in this tab, never uploaded
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
