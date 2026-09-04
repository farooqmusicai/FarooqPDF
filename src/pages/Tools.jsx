import React, { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Scissors, Merge, FileDown, RotateCcw, ScanLine, Lock,
  Unlock, Droplets, EyeOff, Edit3, FileSearch, Layers,
  ChevronRight, Upload, FileText, X, Loader2, RotateCw, Image as ImageIcon,
  GripVertical, Check, ArrowLeft
} from 'lucide-react'
import Navbar from '../components/layout/Navbar.jsx'
import {
  mergePdfs, splitPdf, compressPdf, rotatePdf, rotateAllPages,
  addWatermark, extractPages, reorderPages, downloadBytes,
  compressPdfToTarget, protectPdf
} from '../lib/pdfExporter.js'
import { loadPdf, renderThumbnail, renderPage } from '../lib/pdfRenderer.js'
import { ocrCanvas, OCR_LANGS } from '../lib/ocrEngine.js'
import { useT } from '../i18n/index.jsx'
import styles from './Tools.module.css'

/* ─────────────────── shared helpers ─────────────────── */

function FileDropper({ onFile, file, onClear, multiple = false, label }) {
  const { t } = useT()
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: multiple ? undefined : 1,
    onDrop: multiple
      ? (files) => onFile(files)
      : ([f]) => f && onFile(f),
  })

  if (!multiple && file) {
    return (
      <div className={styles.fileChip}>
        <FileText size={15} />
        <span className={styles.fileName}>{file.name}</span>
        <span className={styles.fileSize}>{(file.size / 1024).toFixed(0)} KB</span>
        <button className={styles.removeBtn} onClick={onClear}><X size={13} /></button>
      </div>
    )
  }

  return (
    <div {...getRootProps()} className={`${styles.dropArea} ${isDragActive ? styles.dropActive : ''}`}>
      <input {...getInputProps()} />
      <Upload size={28} />
      <span>{isDragActive ? t('t_drop_it') : (label || t('t_drop_label'))}</span>
    </div>
  )
}

function ToolShell({ title, desc, children, wide = false }) {
  return (
    <div className={`${styles.toolUI} ${wide ? styles.toolUIWide : ''}`}>
      <h2 className={styles.toolUITitle}>{title}</h2>
      <p className={styles.toolUIDesc}>{desc}</p>
      {children}
    </div>
  )
}

function ActionBtn({ onClick, disabled, loading, icon: Icon, children }) {
  return (
    <button className={styles.actionBtn} onClick={onClick} disabled={disabled || loading}>
      {loading ? <Loader2 size={15} className={styles.spin} /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  )
}

const WATERMARK_FONT_OPTIONS = [
  { id: 'Helvetica', label: 'Helvetica / Arial', css: 'Arial, Helvetica, sans-serif' },
  { id: 'Times-Roman', label: 'Times / Georgia', css: 'Georgia, "Times New Roman", serif' },
  { id: 'Courier', label: 'Courier Mono', css: '"Courier New", Courier, monospace' },
  { id: 'NotoNaskhArabic', labelKey: 'wm_font_arabic', css: '"Noto Naskh Arabic", "Noto Sans", Arial, sans-serif' },
]

const WATERMARK_POSITION_PRESETS = [
  ['top-left', 'wm_top_left'],
  ['top', 'wm_top'],
  ['top-right', 'wm_top_right'],
  ['center', 'wm_center'],
  ['bottom-left', 'wm_bottom_left'],
  ['bottom', 'wm_bottom'],
  ['bottom-right', 'wm_bottom_right'],
]

let previewMeasureCtx = null

function getPreviewMeasureContext() {
  if (!previewMeasureCtx && typeof document !== 'undefined') {
    previewMeasureCtx = document.createElement('canvas').getContext('2d')
  }
  return previewMeasureCtx
}

function measurePreviewText(text, fontSize, fontFamily, bold, italic) {
  const ctx = getPreviewMeasureContext()
  if (!ctx) {
    return {
      width: Math.max((text || '').length * fontSize * 0.58, fontSize * 2),
      height: fontSize * 1.08,
    }
  }

  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${fontSize}px ${fontFamily}`
  return {
    width: Math.max(ctx.measureText(text || '').width, fontSize * 2),
    height: fontSize * 1.08,
  }
}

function parseWatermarkPages(mode, input, totalPages) {
  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1)
  if (mode === 'all') return allPages
  if (!input.trim()) throw new Error(mode === 'specific' ? 'Enter specific page numbers' : 'Enter page ranges')

  const pages = []
  for (const rawPart of input.split(',')) {
    const part = rawPart.trim()
    if (!part) continue

    if (mode === 'specific') {
      if (!/^\d+$/.test(part)) throw new Error('Specific pages must look like: 1, 3, 7')
      pages.push(Number(part))
      continue
    }

    if (/^\d+$/.test(part)) {
      pages.push(Number(part))
      continue
    }

    const match = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (!match) throw new Error('Ranges must look like: 1-3, 5, 8-10')
    const start = Number(match[1])
    const end = Number(match[2])
    if (end < start) throw new Error(`Invalid range: ${part}`)
    for (let page = start; page <= end; page += 1) pages.push(page)
  }

  const unique = [...new Set(pages)].sort((a, b) => a - b)
  if (!unique.length) throw new Error('No pages matched your selection')
  if (unique.some((page) => page < 1 || page > totalPages)) {
    throw new Error(`Page selection must stay within 1-${totalPages}`)
  }
  return unique
}

function getPresetPosition(preset, pageWidth, pageHeight, markWidth, markHeight, margin = 18) {
  switch (preset) {
    case 'top-left':
      return { x: margin, y: margin }
    case 'top-right':
      return { x: pageWidth - markWidth - margin, y: margin }
    case 'bottom-left':
      return { x: margin, y: pageHeight - markHeight - margin }
    case 'bottom-right':
      return { x: pageWidth - markWidth - margin, y: pageHeight - markHeight - margin }
    case 'top':
      return { x: (pageWidth - markWidth) / 2, y: margin }
    case 'bottom':
      return { x: (pageWidth - markWidth) / 2, y: pageHeight - markHeight - margin }
    case 'center':
    default:
      return { x: (pageWidth - markWidth) / 2, y: (pageHeight - markHeight) / 2 }
  }
}

function buildPreviewPlacements(pageWidth, pageHeight, markWidth, markHeight, options) {
  if (!options.tiled) {
    const base = getPresetPosition(options.positionPreset, pageWidth, pageHeight, markWidth, markHeight)
    return [{ x: base.x + options.offsetX, y: base.y + options.offsetY }]
  }

  const stepX = markWidth + Math.max(markWidth * 0.65, 24)
  const stepY = markHeight + Math.max(markHeight * 0.9, 18)
  const placements = []

  for (let row = 0, y = -markHeight * 0.3 + options.offsetY; y < pageHeight + markHeight; row += 1, y += stepY) {
    const rowShift = row % 2 === 0 ? 0 : stepX / 2
    for (let x = -markWidth * 0.4 + options.offsetX - rowShift; x < pageWidth + markWidth; x += stepX) {
      placements.push({ x, y })
    }
  }

  return placements.slice(0, 80)
}

/* ─────────────────── individual tools ─────────────────── */

function MergeTool() {
  const { t } = useT()
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)

  const onDrop = useCallback((dropped) => {
    setFiles(prev => [...prev, ...dropped])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop,
  })

  const handleMerge = async () => {
    if (files.length < 2) { toast.error(t('mg_min2')); return }
    setBusy(true)
    const tid = toast.loading(t('mg_merging', { n: files.length }))
    try {
      const buffers = await Promise.all(files.map(f => f.arrayBuffer()))
      const bytes = await mergePdfs(buffers)
      downloadBytes(bytes, 'merged.pdf')
      toast.success(t('mg_done', { n: files.length }), { id: tid })
    } catch (e) { toast.error(t('mg_failed', { msg: e.message }), { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_merge')} desc={t('mg_desc')}>
      <div {...getRootProps()} className={`${styles.dropArea} ${isDragActive ? styles.dropActive : ''}`}>
        <input {...getInputProps()} />
        <Upload size={28} /><span>{isDragActive ? t('mg_drop_active') : t('mg_drop')}</span>
      </div>
      {files.length > 0 && (
        <div className={styles.fileList}>
          {files.map((f, i) => (
            <div key={i} className={styles.fileChip}>
              <span className={styles.fileIndex}>{i + 1}</span>
              <FileText size={14} />
              <span className={styles.fileName}>{f.name}</span>
              <span className={styles.fileSize}>{(f.size/1024).toFixed(0)} KB</span>
              <button className={styles.removeBtn} onClick={() => setFiles(fs => fs.filter((_,j)=>j!==i))}><X size={12}/></button>
            </div>
          ))}
        </div>
      )}
      <ActionBtn onClick={handleMerge} disabled={files.length < 2} loading={busy} icon={Merge}>
        {t('mg_btn', { n: files.length })}
      </ActionBtn>
    </ToolShell>
  )
}

function SplitTool() {
  const { t } = useT()
  const [file, setFile] = useState(null)
  const [mode, setMode] = useState('range') // range | every | all
  const [from, setFrom] = useState(1)
  const [to,   setTo]   = useState(1)
  const [every, setEvery] = useState(1)
  const [busy, setBusy] = useState(false)

  const handleSplit = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading(t('sp_splitting'))
    try {
      const buf = await file.arrayBuffer()
      const doc = await loadPdf(buf.slice(0))
      const total = doc.numPages
      let ranges = []

      if (mode === 'range')  ranges = [{ from, to: Math.min(to, total) }]
      if (mode === 'every')  { for (let i=1; i<=total; i+=every) ranges.push({ from: i, to: Math.min(i+every-1, total) }) }
      if (mode === 'all')    { for (let i=1; i<=total; i++) ranges.push({ from: i, to: i }) }

      const results = await splitPdf(buf, ranges)
      results.forEach((bytes, i) => downloadBytes(bytes, `split-part-${i+1}.pdf`))
      toast.success(t('sp_done', { n: results.length }), { id: tid })
    } catch (e) { toast.error(t('sp_failed', { msg: e.message }), { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_split')} desc={t('sp_desc')}>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.modeRow}>
        {[['range',t('sp_by_range')],['every',t('sp_every_n')],['all',t('sp_all')]].map(([v,l])=>(
          <button key={v} className={`${styles.modeBtn} ${mode===v?styles.modeBtnActive:''}`} onClick={()=>setMode(v)}>{l}</button>
        ))}
      </div>
      {mode === 'range' && (
        <div className={styles.rangeRow}>
          <label>{t('sp_from')} <input type="number" min={1} value={from} onChange={e=>setFrom(+e.target.value)} className={styles.numInput}/></label>
          <label>{t('sp_to')} <input type="number" min={1} value={to}   onChange={e=>setTo(+e.target.value)}   className={styles.numInput}/></label>
        </div>
      )}
      {mode === 'every' && (
        <div className={styles.rangeRow}>
          <label>{t('sp_every')} <input type="number" min={1} value={every} onChange={e=>setEvery(+e.target.value)} className={styles.numInput}/> {t('sp_pages')}</label>
        </div>
      )}
      <ActionBtn onClick={handleSplit} disabled={!file} loading={busy} icon={Scissors}>{t('sp_btn')}</ActionBtn>
    </ToolShell>
  )
}

function CompressTool() {
  const { t } = useT()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [targetKb, setTargetKb] = useState('')
  const [preset, setPreset] = useState('balanced')
  const [progress, setProgress] = useState(null)

  const handleCompress = async () => {
    if (!file) return
    const targetBytes = targetKb ? Math.max(1, Number(targetKb)) * 1024 : null
    if (targetKb && (!Number.isFinite(targetBytes) || targetBytes <= 0)) {
      toast.error(t('cp_invalid'))
      return
    }
    if (targetBytes && targetBytes >= file.size) {
      toast.error(t('cp_too_big'))
      return
    }

    setBusy(true)
    setProgress(null)
    const tid = toast.loading(targetBytes ? t('cp_optimizing') : t('cp_compressing'))
    try {
      const buf   = await file.arrayBuffer()
      const output = targetBytes
        ? await compressPdfToTarget(buf, {
            targetBytes,
            preset,
            onProgress: (p) => {
              setProgress(p)
              toast.loading(t('cp_attempt', { a: p.attempt, b: p.attempts, p: p.page, q: p.pages }), { id: tid })
            },
          })
        : { bytes: await compressPdf(buf), mode: 'lossless', reachedTarget: true }
      const bytes = output.bytes
      const saved = ((file.size - bytes.byteLength) / file.size * 100).toFixed(1)
      const name  = `compressed-${file.name}`
      downloadBytes(bytes, name)
      setResult({ original: file.size, compressed: bytes.byteLength, saved, ...output, targetBytes })
      toast.success(output.reachedTarget ? t('cp_to', { n: (bytes.byteLength/1024).toFixed(0) }) : t('cp_best', { n: (bytes.byteLength/1024).toFixed(0) }), { id: tid })
    } catch (e) { toast.error(t('cp_failed', { msg: e.message }), { id: tid }) }
    setProgress(null)
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_compress')} desc={t('cp_desc')}>
      <FileDropper file={file} onFile={setFile} onClear={() => { setFile(null); setResult(null); setProgress(null) }} />
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>{t('cp_target')}</label>
          <input
            className={styles.formInput}
            type="number"
            min={1}
            value={targetKb}
            onChange={e=>setTargetKb(e.target.value)}
            placeholder={t('cp_eg', { n: file ? Math.max(50, Math.round(file.size / 1024 * 0.35)) : 100 })}
          />
        </div>
        <div className={styles.modeRow}>
          {[
            ['balanced', t('cp_balanced')],
            ['high', t('cp_quality')],
            ['small', t('cp_smallest')],
          ].map(([id, label]) => (
            <button key={id} className={`${styles.modeBtn} ${preset===id?styles.modeBtnActive:''}`} onClick={()=>setPreset(id)}>{label}</button>
          ))}
        </div>
      </div>
      {progress && (
        <div className={styles.progressBox}>
          <div className={styles.progressText}>{t('cp_attempt', { a: progress.attempt, b: progress.attempts, p: progress.page, q: progress.pages })}</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${((progress.page / progress.pages) * 100).toFixed(0)}%` }} />
          </div>
        </div>
      )}
      {result && (
        <div className={styles.resultBox}>
          <div className={styles.resultRow}><span>{t('cp_original')}</span><strong>{(result.original/1024).toFixed(0)} KB</strong></div>
          <div className={styles.resultRow}><span>{t('cp_compressed')}</span><strong>{(result.compressed/1024).toFixed(0)} KB</strong></div>
          {result.targetBytes && <div className={styles.resultRow}><span>{t('cp_target_l')}</span><strong>{(result.targetBytes/1024).toFixed(0)} KB</strong></div>}
          <div className={styles.resultRow}><span>{t('cp_mode')}</span><strong>{result.mode === 'visual' ? t('cp_visual') : t('cp_lossless')}</strong></div>
          <div className={`${styles.resultRow} ${styles.resultSaved}`}><span>{t('cp_saved')}</span><strong>{result.saved}%</strong></div>
          {!result.reachedTarget && <div className={styles.infoBox}>{t('cp_not_reached')}</div>}
        </div>
      )}
      <div className={styles.infoBox}>{t('cp_info')}</div>
      <ActionBtn onClick={handleCompress} disabled={!file} loading={busy} icon={FileDown}>{targetKb ? t('cp_btn_below', { n: targetKb }) : t('cp_btn_lossless')}</ActionBtn>
    </ToolShell>
  )
}

function RotateTool() {
  const { t } = useT()
  const [file, setFile]   = useState(null)
  const [mode, setMode]   = useState('all') // all | single
  const [page, setPage]   = useState(1)
  const [angle, setAngle] = useState(90)
  const [busy, setBusy]   = useState(false)

  const handleRotate = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading(t('rt_rotating'))
    try {
      const buf   = await file.arrayBuffer()
      const bytes = mode === 'all'
        ? await rotateAllPages(buf, angle)
        : await rotatePdf(buf, page, angle)
      downloadBytes(bytes, `rotated-${file.name}`)
      toast.success(t('rt_done'), { id: tid })
    } catch (e) { toast.error(t('rt_failed', { msg: e.message }), { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_rotate')} desc={t('rt_desc')}>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.modeRow}>
        {[['all',t('rt_all')],['single',t('rt_single')]].map(([v,l])=>(
          <button key={v} className={`${styles.modeBtn} ${mode===v?styles.modeBtnActive:''}`} onClick={()=>setMode(v)}>{l}</button>
        ))}
      </div>
      {mode === 'single' && (
        <div className={styles.rangeRow}>
          <label>{t('rt_page_number')} <input type="number" min={1} value={page} onChange={e=>setPage(+e.target.value)} className={styles.numInput}/></label>
        </div>
      )}
      <div className={styles.angleRow}>
        {[90,180,270].map(a => (
          <button key={a} className={`${styles.angleBtn} ${angle===a?styles.angleBtnActive:''}`} onClick={()=>setAngle(a)}>
            <RotateCw size={14}/> {a}°
          </button>
        ))}
      </div>
      <ActionBtn onClick={handleRotate} disabled={!file} loading={busy} icon={RotateCcw}>{t('rt_btn', { n: angle })}</ActionBtn>
    </ToolShell>
  )
}

function WatermarkTool() {
  const { t } = useT()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')
  const [previewDims, setPreviewDims] = useState({ width: 360, height: 480 })
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })
  const [pageCount, setPageCount] = useState(0)

  const [watermarkType, setWatermarkType] = useState('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [fontFamily, setFontFamily] = useState('Helvetica')
  const [bold, setBold] = useState(true)
  const [italic, setItalic] = useState(false)
  const [color, setColor] = useState('#737373')
  const [size, setSize] = useState(52)
  const [opacity, setOpacity] = useState(15)
  const [rotation, setRotation] = useState(315)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [positionPreset, setPositionPreset] = useState('center')
  const [tiled, setTiled] = useState(false)
  const [pageMode, setPageMode] = useState('all')
  const [pageInput, setPageInput] = useState('')

  const [imageFile, setImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [imageDims, setImageDims] = useState({ width: 1, height: 1 })
  const [imageScale, setImageScale] = useState(28)

  useEffect(() => {
    if (!file) {
      setPreviewSrc('')
      setPageCount(0)
      return
    }

    let cancelled = false
    setPreviewLoading(true)

    ;(async () => {
      try {
        const buf = await file.arrayBuffer()
        const doc = await loadPdf(buf.slice(0))
        if (cancelled) return
        setPageCount(doc.numPages)
        const firstPage = await doc.getPage(1)
        const viewport = firstPage.getViewport({ scale: 1 })
        if (cancelled) return
        setPageSize({ width: viewport.width, height: viewport.height })
        const preview = await renderPage(1, 0.65)
        if (cancelled) return
        setPreviewSrc(preview.canvas.toDataURL('image/jpeg', 0.88))
        setPreviewDims({ width: preview.width, height: preview.height })
      } catch (e) {
        if (!cancelled) {
          setPreviewSrc('')
          toast.error(t('wm_preview_failed', { msg: e.message }))
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [file])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl('')
      setImageDims({ width: 1, height: 1 })
      return
    }

    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    const img = new window.Image()
    img.onload = () => setImageDims({ width: img.width || 1, height: img.height || 1 })
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const previewScaleX = previewDims.width / pageSize.width
  const previewScaleY = previewDims.height / pageSize.height
  const previewFont = WATERMARK_FONT_OPTIONS.find((font) => font.id === fontFamily)?.css || WATERMARK_FONT_OPTIONS[0].css
  const previewFontSize = Math.max(size * previewScaleY, 12)
  const textMetrics = measurePreviewText(text || 'CONFIDENTIAL', previewFontSize, previewFont, bold, italic)
  const previewImageWidth = previewDims.width * (imageScale / 100)
  const previewImageHeight = previewImageWidth * (imageDims.height / imageDims.width)
  const previewMarkWidth = watermarkType === 'text' ? textMetrics.width : previewImageWidth
  const previewMarkHeight = watermarkType === 'text' ? textMetrics.height : previewImageHeight
  const previewItems = buildPreviewPlacements(previewDims.width, previewDims.height, previewMarkWidth, previewMarkHeight, {
    positionPreset,
    offsetX: offsetX * previewScaleX,
    offsetY: offsetY * previewScaleY,
    tiled,
  })

  const canApply = !!file && (
    (watermarkType === 'text' && text.trim()) ||
    (watermarkType === 'image' && imageFile)
  )

  const handleWatermark = async () => {
    if (!file) return

    let targetPages
    try {
      targetPages = parseWatermarkPages(pageMode, pageInput, pageCount)
    } catch (e) {
      toast.error(e.message)
      return
    }

    if (watermarkType === 'text' && !text.trim()) {
      toast.error(t('wm_enter_text'))
      return
    }
    if (watermarkType === 'image' && !imageFile) {
      toast.error(t('wm_choose_img_err'))
      return
    }

    setBusy(true)
    const tid = toast.loading(t('wm_applying'))
    try {
      const buf = await file.arrayBuffer()
      const options = {
        type: watermarkType,
        text: text.trim(),
        fontFamily,
        bold,
        italic,
        color,
        fontSize: size,
        opacity: opacity / 100,
        rotation,
        offsetX,
        offsetY,
        positionPreset,
        tiled,
        targetPages,
        imageScale,
      }

      if (watermarkType === 'image' && imageFile) {
        options.imageBytes = await imageFile.arrayBuffer()
        options.imageType = imageFile.type
      }

      const bytes = await addWatermark(buf, options)
      downloadBytes(bytes, `watermarked-${file.name}`)
      toast.success(t('wm_applied', { n: targetPages.length }), { id: tid })
    } catch (e) {
      toast.error(t('t_failed', { msg: e.message }), { id: tid })
    }
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_watermark')} desc={t('wm_desc')} wide>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />

      <div className={styles.watermarkLayout}>
        <div className={styles.watermarkPanel}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>{t('wm_type')}</div>
            <div className={styles.modeRow}>
              <button className={`${styles.modeBtn} ${watermarkType === 'text' ? styles.modeBtnActive : ''}`} onClick={() => setWatermarkType('text')}>
                {t('wm_text')}
              </button>
              <button className={`${styles.modeBtn} ${watermarkType === 'image' ? styles.modeBtnActive : ''}`} onClick={() => setWatermarkType('image')}>
                <ImageIcon size={13} /> {t('wm_image')}
              </button>
            </div>

            {watermarkType === 'text' ? (
              <div className={styles.watermarkFieldGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>{t('wm_text_label')}</label>
                  <input className={styles.formInput} value={text} onChange={e => setText(e.target.value)} placeholder={t('wm_text_ph')} dir="auto" />
                </div>
                <div className={styles.dualGrid}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>{t('wm_font')}</label>
                    <select className={styles.formInput} value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                      {WATERMARK_FONT_OPTIONS.map((font) => (
                        <option key={font.id} value={font.id}>{font.labelKey ? t(font.labelKey) : font.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>{t('wm_color')}</label>
                    <div className={styles.colorInputRow}>
                      <input className={styles.colorInput} type="color" value={color} onChange={e => setColor(e.target.value)} />
                      <input className={styles.formInput} value={color} onChange={e => setColor(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className={styles.toggleRow}>
                  <button className={`${styles.toggleBtn} ${bold ? styles.toggleBtnActive : ''}`} onClick={() => setBold(v => !v)}>{t('wm_bold')}</button>
                  <button className={`${styles.toggleBtn} ${italic ? styles.toggleBtnActive : ''}`} onClick={() => setItalic(v => !v)}>{t('wm_italic')}</button>
                </div>
              </div>
            ) : (
              <div className={styles.watermarkFieldGrid}>
                {imageFile ? (
                  <div className={styles.fileChip}>
                    <ImageIcon size={15} />
                    <span className={styles.fileName}>{imageFile.name}</span>
                    <span className={styles.fileSize}>{(imageFile.size / 1024).toFixed(0)} KB</span>
                    <button className={styles.removeBtn} onClick={() => setImageFile(null)}><X size={13} /></button>
                  </div>
                ) : (
                  <label className={styles.imageDropArea}>
                    <input type="file" accept="image/png,image/jpeg" hidden onChange={e => setImageFile(e.target.files?.[0] || null)} />
                    <ImageIcon size={18} />
                    <span>{t('wm_choose_image')}</span>
                  </label>
                )}
              </div>
            )}
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>{t('wm_appearance')}</div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>
                {watermarkType === 'text' ? t('wm_font_size', { n: size }) : t('wm_image_size', { n: imageScale })}
              </label>
              <input
                type="range"
                min={watermarkType === 'text' ? 18 : 10}
                max={watermarkType === 'text' ? 140 : 60}
                value={watermarkType === 'text' ? size : imageScale}
                onChange={e => watermarkType === 'text' ? setSize(+e.target.value) : setImageScale(+e.target.value)}
                className={styles.slider}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>{t('wm_opacity', { n: opacity })}</label>
              <input type="range" min={5} max={80} value={opacity} onChange={e => setOpacity(+e.target.value)} className={styles.slider} />
            </div>
            <div className={styles.dualGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('wm_rotation')}</label>
                <div className={styles.inlineControlRow}>
                  <input type="range" min={0} max={360} value={rotation} onChange={e => setRotation(+e.target.value)} className={styles.slider} />
                  <input className={styles.miniInput} type="number" min={0} max={360} value={rotation} onChange={e => setRotation(Math.max(0, Math.min(360, +e.target.value || 0)))} />
                </div>
              </div>
              <label className={styles.checkPill}>
                <input type="checkbox" checked={tiled} onChange={e => setTiled(e.target.checked)} />
                {t('wm_tiled')}
              </label>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>{t('wm_placement')}</div>
            <div className={styles.presetGrid}>
              {WATERMARK_POSITION_PRESETS.map(([id, label]) => (
                <button key={id} className={`${styles.presetBtn} ${positionPreset === id ? styles.presetBtnActive : ''}`} onClick={() => setPositionPreset(id)}>
                  {t(label)}
                </button>
              ))}
            </div>
            <div className={styles.dualGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('wm_x')}</label>
                <input className={styles.formInput} type="number" value={offsetX} onChange={e => setOffsetX(+e.target.value || 0)} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>{t('wm_y')}</label>
                <input className={styles.formInput} type="number" value={offsetY} onChange={e => setOffsetY(+e.target.value || 0)} />
              </div>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>{t('wm_pages')}</div>
            <div className={styles.modeRow}>
              <button className={`${styles.modeBtn} ${pageMode === 'all' ? styles.modeBtnActive : ''}`} onClick={() => setPageMode('all')}>{t('wm_all_pages')}</button>
              <button className={`${styles.modeBtn} ${pageMode === 'specific' ? styles.modeBtnActive : ''}`} onClick={() => setPageMode('specific')}>{t('wm_specific')}</button>
              <button className={`${styles.modeBtn} ${pageMode === 'ranges' ? styles.modeBtnActive : ''}`} onClick={() => setPageMode('ranges')}>{t('wm_ranges')}</button>
            </div>
            {pageMode !== 'all' && (
              <div className={styles.formField}>
                <label className={styles.formLabel}>
                  {pageMode === 'specific' ? t('wm_pages_like') : t('wm_ranges_like')}
                </label>
                <input className={styles.formInput} value={pageInput} onChange={e => setPageInput(e.target.value)} placeholder={pageMode === 'specific' ? '1, 3, 7' : '1-3, 6, 9-12'} />
              </div>
            )}
            <div className={styles.infoBox}>{t('wm_loaded', { n: pageCount || 0 })}</div>
          </div>
        </div>

        <div className={`${styles.watermarkPanel} ${styles.previewPanel}`}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>{t('wm_preview')}</div>
            <div className={styles.previewMeta}>{t('wm_preview_meta')}</div>
            {previewLoading ? (
              <div className={styles.previewEmpty}><Loader2 size={18} className={styles.spin} /> {t('wm_rendering')}</div>
            ) : previewSrc ? (
              <div className={styles.previewFrame} style={{ aspectRatio: `${previewDims.width} / ${previewDims.height}` }}>
                <img src={previewSrc} alt="Watermark preview" className={styles.previewImage} />
                <div className={styles.previewOverlay}>
                  {previewItems.map((item, index) => (
                    watermarkType === 'text' ? (
                      <div
                        key={`${item.x}-${item.y}-${index}`}
                        className={styles.previewTextMark}
                        style={{
                          left: item.x,
                          top: item.y,
                          fontSize: previewFontSize,
                          fontFamily: previewFont,
                          fontWeight: bold ? 700 : 400,
                          fontStyle: italic ? 'italic' : 'normal',
                          color,
                          opacity: opacity / 100,
                          transform: `rotate(${rotation}deg)`,
                        }}
                      >
                        {text || 'CONFIDENTIAL'}
                      </div>
                    ) : imagePreviewUrl ? (
                      <img
                        key={`${item.x}-${item.y}-${index}`}
                        src={imagePreviewUrl}
                        alt=""
                        className={styles.previewImageMark}
                        style={{
                          left: item.x,
                          top: item.y,
                          width: previewImageWidth,
                          height: previewImageHeight,
                          opacity: opacity / 100,
                          transform: `rotate(${rotation}deg)`,
                        }}
                      />
                    ) : null
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.previewEmpty}>{t('wm_add_pdf')}</div>
            )}
          </div>
          <ActionBtn onClick={handleWatermark} disabled={!canApply} loading={busy} icon={Droplets}>
            {t('wm_btn')}
          </ActionBtn>
        </div>
      </div>
    </ToolShell>
  )
}

function ExtractTool() {
  const { t } = useT()
  const [file, setFile]   = useState(null)
  const [pages, setPages] = useState('')
  const [busy, setBusy]   = useState(false)

  const handleExtract = async () => {
    if (!file || !pages.trim()) return
    setBusy(true)
    const tid = toast.loading(t('ex_extracting'))
    try {
      const buf = await file.arrayBuffer()
      // Parse "1,3,5-8" style input
      const nums = []
      for (const part of pages.split(',')) {
        const t = part.trim()
        if (t.includes('-')) {
          const [a,b] = t.split('-').map(Number)
          for (let i=a; i<=b; i++) nums.push(i)
        } else {
          const n = Number(t)
          if (!isNaN(n)) nums.push(n)
        }
      }
      const unique = [...new Set(nums)].sort((a,b)=>a-b)
      const bytes  = await extractPages(buf, unique)
      downloadBytes(bytes, `extracted-pages-${file.name}`)
      toast.success(t('ex_done', { n: unique.length }), { id: tid })
    } catch (e) { toast.error(t('ex_failed', { msg: e.message }), { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_extract')} desc={t('ex_desc')}>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.formField}>
        <label className={styles.formLabel}>{t('ex_label')}</label>
        <input className={styles.formInput} value={pages} onChange={e=>setPages(e.target.value)} placeholder="1, 3, 5-8, 12" />
      </div>
      <ActionBtn onClick={handleExtract} disabled={!file || !pages.trim()} loading={busy} icon={FileSearch}>{t('ex_btn')}</ActionBtn>
    </ToolShell>
  )
}

function ReorderTool() {
  const { t } = useT()
  const [file, setFile]     = useState(null)
  const [thumbs, setThumbs] = useState([])
  const [order, setOrder]   = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]     = useState(false)
  const dragIdx = React.useRef(null)

  const onFile = async (f) => {
    setFile(f)
    setLoading(true)
    try {
      const buf = await f.arrayBuffer()
      const doc = await loadPdf(buf.slice(0))
      const total = doc.numPages
      const pages = Array.from({length: total}, (_,i) => i+1)
      setOrder(pages)
      const ts = []
      for (let i=1; i<=Math.min(total,20); i++) {
        const dataUrl = await renderThumbnail(i)
        ts.push({ page: i, dataUrl })
      }
      setThumbs(ts)
    } catch (e) { toast.error(t('ro_load_failed', { msg: e.message })) }
    setLoading(false)
  }

  const handleDragStart = (i) => { dragIdx.current = i }
  const handleDragOver  = (e) => e.preventDefault()
  const handleDrop      = (i) => {
    if (dragIdx.current === null || dragIdx.current === i) return
    const newOrder = [...order]
    const [moved]  = newOrder.splice(dragIdx.current, 1)
    newOrder.splice(i, 0, moved)
    setOrder(newOrder)
    const newThumbs = [...thumbs]
    const [mt] = newThumbs.splice(dragIdx.current, 1)
    newThumbs.splice(i, 0, mt)
    setThumbs(newThumbs)
    dragIdx.current = null
  }

  const handleSave = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading(t('ro_reordering'))
    try {
      const buf   = await file.arrayBuffer()
      const bytes = await reorderPages(buf, order)
      downloadBytes(bytes, `reordered-${file.name}`)
      toast.success(t('ro_done'), { id: tid })
    } catch (e) { toast.error(t('t_failed', { msg: e.message }), { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_reorder')} desc={t('ro_desc')}>
      {!file
        ? <FileDropper file={null} onFile={onFile} onClear={() => {}} />
        : (
          <>
            <div className={styles.fileChip}>
              <FileText size={14}/>
              <span className={styles.fileName}>{file.name}</span>
              <button className={styles.removeBtn} onClick={() => { setFile(null); setThumbs([]); setOrder([]) }}><X size={12}/></button>
            </div>
            {loading
              ? <div className={styles.loadingRow}><Loader2 size={18} className={styles.spin}/> {t('ro_loading')}</div>
              : (
                <div className={styles.reorderGrid}>
                  {thumbs.map((t, i) => (
                    <div
                      key={t.page}
                      className={styles.reorderCard}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(i)}
                    >
                      <div className={styles.reorderHandle}><GripVertical size={12}/></div>
                      <img src={t.dataUrl} alt={String(t.page)} className={styles.reorderThumb} />
                      <span className={styles.reorderNum}>{i+1}</span>
                    </div>
                  ))}
                </div>
              )
            }
            <ActionBtn onClick={handleSave} disabled={!file || loading} loading={busy} icon={Check}>{t('ro_btn')}</ActionBtn>
          </>
        )
      }
    </ToolShell>
  )
}

function OcrTool() {
  const { t, lang } = useT()
  const [file, setFile]     = useState(null)
  const [busy, setBusy]     = useState(false)
  const [progress, setProgress] = useState(0)
  const [ocrLang, setOcrLang] = useState(() => ({ ar: 'ara', ur: 'urd' }[lang] || 'eng'))

  const handleOcr = async () => {
    if (!file) return
    setBusy(true)
    setProgress(0)
    const tid = toast.loading(t('oc_init'))
    try {
      const { renderPage } = await import('../lib/pdfRenderer.js')
      const { ocrCanvas }  = await import('../lib/ocrEngine.js')
      const buf = await file.arrayBuffer()
      const doc = await loadPdf(buf.slice(0))
      const total = doc.numPages
      const allText = []

      for (let p = 1; p <= total; p++) {
        toast.loading(t('oc_page', { p, q: total }), { id: tid })
        const { canvas } = await renderPage(p, 1)
        const words = await ocrCanvas(canvas, pct => setProgress(Math.round((p-1)/total*100 + pct/total)), ocrLang)
        if (words.length) allText.push(`--- Page ${p} ---\n` + words.map(w=>w.str).join(' '))
      }

      // Download as searchable text file
      const blob = new Blob([allText.join('\n\n')], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = file.name.replace('.pdf','') + '-ocr.txt'; a.click()
      URL.revokeObjectURL(url)
      toast.success(t('oc_done', { n: total }), { id: tid })
    } catch (e) { toast.error(t('oc_failed', { msg: e.message }), { id: tid }) }
    setBusy(false)
    setProgress(0)
  }

  return (
    <ToolShell title={t('tool_ocr')} desc={t('oc_desc')}>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.formField}>
        <label className={styles.formLabel}>{t('oc_lang')}</label>
        <select className={styles.formInput} value={ocrLang} onChange={e => setOcrLang(e.target.value)} disabled={busy}>
          {OCR_LANGS.map(l => <option key={l.code} value={l.code}>{t(l.label)}</option>)}
        </select>
      </div>
      {busy && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}
      <ActionBtn onClick={handleOcr} disabled={!file} loading={busy} icon={ScanLine}>
        {busy ? t('oc_scanning', { n: progress }) : t('oc_btn')}
      </ActionBtn>
    </ToolShell>
  )
}

function ProtectTool() {
  const { t } = useT()
  const [file, setFile] = useState(null)
  const [pw, setPw]     = useState('')
  const [ownerPw, setOwnerPw] = useState('')
  const [algorithm, setAlgorithm] = useState('AES-256')
  const [allowPrinting, setAllowPrinting] = useState(true)
  const [allowCopying, setAllowCopying] = useState(false)
  const [allowModifying, setAllowModifying] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleProtect = async () => {
    if (!file || !pw) return
    setBusy(true)
    const tid = toast.loading(t('pr_encrypting'))
    try {
      const buf = await file.arrayBuffer()
      const bytes = await protectPdf(buf, pw, {
        ownerPassword: ownerPw || pw,
        algorithm,
        allowPrinting,
        allowCopying,
        allowModifying,
      })
      downloadBytes(bytes, `protected-${file.name}`)
      toast.success(t('pr_done'), { id: tid })
    } catch (e) { toast.error(t('t_failed', { msg: e.message }), { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_protect')} desc={t('pr_desc')}>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>{t('pr_open_pw')}</label>
          <input className={styles.formInput} type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder={t('pr_open_ph')} />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>{t('pr_owner_pw')}</label>
          <input className={styles.formInput} type="password" value={ownerPw} onChange={e=>setOwnerPw(e.target.value)} placeholder={t('pr_owner_ph')} />
        </div>
        <div className={styles.modeRow}>
          {['AES-256', 'RC4'].map(id => (
            <button key={id} className={`${styles.modeBtn} ${algorithm===id?styles.modeBtnActive:''}`} onClick={()=>setAlgorithm(id)}>{id}</button>
          ))}
        </div>
        <div className={styles.checkGrid}>
          <label><input type="checkbox" checked={allowPrinting} onChange={e=>setAllowPrinting(e.target.checked)} /> {t('pr_allow_print')}</label>
          <label><input type="checkbox" checked={allowCopying} onChange={e=>setAllowCopying(e.target.checked)} /> {t('pr_allow_copy')}</label>
          <label><input type="checkbox" checked={allowModifying} onChange={e=>setAllowModifying(e.target.checked)} /> {t('pr_allow_edit')}</label>
        </div>
      </div>
      <div className={styles.infoBox}>
        {t('pr_info')}
      </div>
      <ActionBtn onClick={handleProtect} disabled={!file || !pw} loading={busy} icon={Lock}>{t('pr_btn')}</ActionBtn>
    </ToolShell>
  )
}
function UnlockTool() {
  const { t } = useT()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleUnlock = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading(t('un_removing'))
    try {
      const { PDFDocument } = await import('pdf-lib')
      const buf   = await file.arrayBuffer()
      const doc   = await PDFDocument.load(buf, { ignoreEncryption: true })
      const bytes = await doc.save()
      downloadBytes(bytes, `unlocked-${file.name}`)
      toast.success(t('un_done'), { id: tid })
    } catch (e) { toast.error(t('t_failed', { msg: e.message }), { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title={t('tool_unlock')} desc={t('un_desc')}>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.infoBox}>
        {t('un_info')}
      </div>
      <ActionBtn onClick={handleUnlock} disabled={!file} loading={busy} icon={Unlock}>{t('un_btn')}</ActionBtn>
    </ToolShell>
  )
}

function RedactTool() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <ToolShell title={t('tool_redact')} desc={t('rd_desc')}>
      <div className={styles.infoBox} style={{ borderColor: 'rgba(232,69,69,0.3)', background: 'rgba(232,69,69,0.05)' }}>
        {t('rd_info')}
      </div>
      <ActionBtn onClick={() => navigate('/editor')} icon={Edit3}>{t('rd_btn')}</ActionBtn>
    </ToolShell>
  )
}

function EditTool() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <ToolShell title={t('tool_edit')} desc={t('et_desc')}>
      <ActionBtn onClick={() => navigate('/editor')} icon={Edit3}>{t('et_btn')}</ActionBtn>
    </ToolShell>
  )
}

/* ─────────────────── tool registry ─────────────────── */
const TOOL_DEFS = [
  { id:'edit',      icon:Edit3,       color:'#e84545', category:'Edit'     },
  { id:'merge',     icon:Merge,       color:'#3b82f6', category:'Organize' },
  { id:'split',     icon:Scissors,    color:'#e84545', category:'Organize' },
  { id:'extract',   icon:FileSearch,  color:'#f59e0b', category:'Organize' },
  { id:'reorder',   icon:Layers,      color:'#8b5cf6', category:'Organize' },
  { id:'rotate',    icon:RotateCcw,   color:'#8b5cf6', category:'Organize' },
  { id:'compress',  icon:FileDown,    color:'#f59e0b', category:'Optimize' },
  { id:'ocr',       icon:ScanLine,    color:'#10b981', category:'Convert'  },
  { id:'watermark', icon:Droplets,    color:'#06b6d4', category:'Secure'   },
  { id:'protect',   icon:Lock,        color:'#e84545', category:'Secure'   },
  { id:'unlock',    icon:Unlock,      color:'#10b981', category:'Secure'   },
  { id:'redact',    icon:EyeOff,      color:'#1a1a1a', category:'Secure'   },
]

const TOOL_COMPONENTS = {
  edit: EditTool, merge: MergeTool, split: SplitTool, extract: ExtractTool,
  reorder: ReorderTool, rotate: RotateTool, compress: CompressTool,
  ocr: OcrTool, watermark: WatermarkTool, protect: ProtectTool,
  unlock: UnlockTool, redact: RedactTool,
}

const CATEGORIES = ['All','Organize','Optimize','Convert','Secure','Edit']

export default function Tools() {
  const { t, rtl } = useT()
  const [activeCat,  setActiveCat]  = useState('All')
  const [activeTool, setActiveTool] = useState(null)

  const filtered = activeCat === 'All' ? TOOL_DEFS : TOOL_DEFS.filter(t => t.category === activeCat)
  const ToolUI   = activeTool ? TOOL_COMPONENTS[activeTool] : null

  return (
    <div className={styles.page}>
      <Navbar variant="app" />
      <div className={styles.layout}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>{t('t_pdf_tools')}</span>
            <span className={styles.toolCount}>{TOOL_DEFS.length}</span>
          </div>
          <div className={styles.cats}>
            {CATEGORIES.map(c => (
              <button key={c} className={`${styles.catBtn} ${activeCat===c?styles.catActive:''}`} onClick={()=>setActiveCat(c)}>{t('cat_' + c)}</button>
            ))}
          </div>
          <div className={styles.toolList}>
            {filtered.map(tool => {
              const Icon = tool.icon
              return (
                <button key={tool.id} className={`${styles.toolListItem} ${activeTool===tool.id?styles.toolListActive:''}`} onClick={()=>setActiveTool(tool.id)}>
                  <div className={styles.toolListIcon} style={{ background: tool.color+'18' }}>
                    <Icon size={15} style={{ color: tool.color }} />
                  </div>
                  <div className={styles.toolListInfo}>
                    <span className={styles.toolListName}>{t('tool_' + tool.id)}</span>
                    <span className={styles.toolListCat}>{t('cat_' + tool.category)}</span>
                  </div>
                  <ChevronRight size={12} className={styles.toolListArrow} style={rtl ? { transform: 'scaleX(-1)' } : undefined}/>
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.content}>
          {ToolUI
            ? <>
                <button className={styles.backBtn} onClick={() => setActiveTool(null)}>
                  <ArrowLeft size={14} style={rtl ? { transform: 'scaleX(-1)' } : undefined}/> {t('t_all_tools')}
                </button>
                <ToolUI />
              </>
            : (
              <div className={styles.toolGrid}>
                <div className={styles.toolGridHeader}>
                  <h1 className={styles.toolGridTitle}>{t('t_all_pdf_tools')}</h1>
                  <p className={styles.toolGridSub}>{t('t_all_sub')}</p>
                </div>
                <div className={styles.cards}>
                  {filtered.map(tool => {
                    const Icon = tool.icon
                    return (
                      <div key={tool.id} className={styles.toolCard} onClick={() => setActiveTool(tool.id)}>
                        <div className={styles.toolCardIcon} style={{ background: tool.color+'18' }}>
                          <Icon size={22} style={{ color: tool.color }} />
                        </div>
                        <div className={styles.toolCardName}>{t('tool_' + tool.id)}</div>
                        <div className={styles.toolCardDesc}>{t('tool_' + tool.id + '_d')}</div>
                        <span className={styles.freeBadge}>{t('t_free')}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}
