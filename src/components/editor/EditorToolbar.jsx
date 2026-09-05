import React, { useState, useEffect } from 'react'
import {
  MousePointer2, Type, Image, Pencil, Square, PenLine,
  Highlighter, EyeOff, Undo2, Redo2, ZoomIn, ZoomOut,
  Download, Scan, Sparkles, Loader2, Bold, Italic, Underline,
  PanelLeft, SlidersHorizontal, Eraser
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import { exportPdf, downloadBytes } from '../../lib/pdfExporter.js'
import { renderPage } from '../../lib/pdfRenderer.js'
import { ocrCanvas } from '../../lib/ocrEngine.js'
import DropZone from '../ui/DropZone.jsx'
import { useT } from '../../i18n/index.jsx'
import { OCR_LANGS } from '../../lib/ocrEngine.js'
import styles from './EditorToolbar.module.css'

const TOOLS = [
  { id: 'select',    icon: MousePointer2, label: 'tb_select' },
  { id: 'text',      icon: Type,          label: 'tb_text' },
  { id: 'image',     icon: Image,         label: 'tb_image' },
  { id: 'draw',      icon: Pencil,        label: 'tb_draw' },
  { id: 'shape',     icon: Square,        label: 'tb_shape' },
  { id: 'sign',      icon: PenLine,       label: 'tb_sign' },
  { id: 'highlight', icon: Highlighter,   label: 'tb_highlight' },
  { id: 'redact',    icon: EyeOff,        label: 'tb_redact' },
  { id: 'whiteout',  icon: Eraser,        label: 'tb_whiteout' },
]

const FONTS = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
  'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Calibri', 'Cambria', 'Garamond', 'Palatino',
  'Noto Naskh Arabic',
]

export default function EditorToolbar() {
  const {
    activeTool, setActiveTool, zoom, setZoom,
    file, editLayers, pageCount, fileName, pageBgs, blockBgs,
    currentPage, addTextBlock,
    selectedElement, selectedElementPage,
    updateTextBlock, commitExtractedEdit,
    undoEdit, redoEdit,
    mobilePagesOpen, mobilePropertiesOpen,
    setMobilePagesOpen, setMobilePropertiesOpen,
  } = usePdfStore()

  const { t, lang } = useT()
  const [ocrRunning,   setOcrRunning]   = useState(false)
  const [ocrProgress,  setOcrProgress]  = useState(0)
  // OCR language defaults to the UI language (falls back to English)
  const [ocrLang, setOcrLang] = useState(() => ({ ar: 'ara', ur: 'urd' }[lang] || 'eng'))

  // Mirror selected element's current formatting in the toolbar
  const sel = selectedElement
  const [fontFamily, setFontFamily] = useState('Arial')
  const [fontSize,   setFontSize]   = useState(12)
  const [bold,       setBold]       = useState(false)
  const [italic,     setItalic]     = useState(false)
  const [underline,  setUnderline]  = useState(false)
  const [color,      setColor]      = useState('#000000')

  // Sync toolbar state when selection changes
  useEffect(() => {
    if (!sel) return
    // Extract CSS font-family to a simple name for the dropdown
    const rawFamily = sel.fontFamily || 'Arial'
    const match = FONTS.find(f => rawFamily.toLowerCase().includes(f.toLowerCase()))
    setFontFamily(match || 'Arial')
    setFontSize(Math.round(sel.fontSize || 12))
    setBold(sel.fontBold   || false)
    setItalic(sel.fontItalic || false)
    setUnderline(sel.fontUnderline || false)
    setColor(sel.color || '#000000')
  }, [sel?.id, sel?.fontBold, sel?.fontItalic, sel?.fontSize, sel?.color])

  // Apply a formatting update to the selected element
  const applyFormat = (updates) => {
    if (!sel || !selectedElementPage) return

    if (sel.isExtracted && !sel.isEdited) {
      // Commit the extracted block first, then update
      commitExtractedEdit(selectedElementPage, sel, sel.str)
      updateTextBlock(selectedElementPage, `edited-${sel.id}`, updates)
    } else {
      updateTextBlock(selectedElementPage, sel.id, updates)
    }
  }

  const handleFontFamily = (f) => {
    setFontFamily(f)
    // Map display name to CSS stack
    const cssMap = {
      'Arial':          'Arial, "Noto Sans", Helvetica, sans-serif',
      'Helvetica':      'Helvetica, Arial, sans-serif',
      'Times New Roman':'"Times New Roman", "Noto Serif", Times, serif',
      'Georgia':        'Georgia, "Noto Serif", serif',
      'Courier New':    '"Courier New", Courier, monospace',
      'Verdana':        'Verdana, Arial, sans-serif',
      'Tahoma':         'Tahoma, Arial, sans-serif',
      'Trebuchet MS':   '"Trebuchet MS", Arial, sans-serif',
      'Calibri':        'Calibri, Arial, sans-serif',
      'Cambria':        'Cambria, Georgia, serif',
      'Garamond':       'Garamond, Georgia, serif',
      'Palatino':       '"Palatino Linotype", Georgia, serif',
      'Noto Naskh Arabic': '"Noto Naskh Arabic", "Noto Sans", Arial, sans-serif',
    }
    applyFormat({ fontFamily: cssMap[f] || f, fontName: f })
  }

  const handleFontSize = (v) => {
    const n = Math.max(4, Math.min(200, Number(v)))
    setFontSize(n)
    applyFormat({ fontSize: n })
  }

  const handleBold = () => {
    const next = !bold
    setBold(next)
    applyFormat({ fontBold: next })
  }

  const handleItalic = () => {
    const next = !italic
    setItalic(next)
    applyFormat({ fontItalic: next })
  }

  const handleUnderline = () => {
    const next = !underline
    setUnderline(next)
    applyFormat({ fontUnderline: next })
  }

  const handleColor = (v) => {
    setColor(v)
    applyFormat({ color: v })
  }

  const handleUndo = () => {
    if (!undoEdit()) { toast(t('tb_nothing_undo')); return }
    toast(t('tb_undone'), { duration: 800 })
  }

  const handleRedo = () => {
    if (!redoEdit()) { toast(t('tb_nothing_redo')); return }
    toast(t('tb_redone'), { duration: 800 })
  }

  const handleExport = async () => {
    if (!file) { toast.error(t('tb_no_pdf')); return }
    const tid = toast.loading(t('tb_exporting'))
    try {
      const bytes = await exportPdf(file, editLayers, pageCount, pageBgs, blockBgs)
      downloadBytes(bytes, `farooqpdf-${fileName || 'edited.pdf'}`)
      toast.success(t('tb_downloaded'), { id: tid })
    } catch (e) {
      toast.error(t('tb_export_failed', { msg: e.message }), { id: tid })
    }
  }

  const handleOcr = async () => {
    if (!file || ocrRunning) return
    setOcrRunning(true); setOcrProgress(0)
    const tid = toast.loading(t('tb_ocr_start'))
    try {
      const { canvas } = await renderPage(currentPage, 1)
      const words = await ocrCanvas(canvas, pct => {
        setOcrProgress(pct)
        toast.loading(t('tb_ocr_pct', { pct }), { id: tid })
      }, ocrLang)
      if (!words.length) { toast.error(t('tb_ocr_none'), { id: tid }); return }
      words.forEach(w => addTextBlock(currentPage, w))
      toast.success(t('tb_ocr_found', { n: words.length }), { id: tid })
    } catch (e) {
      toast.error(t('tb_ocr_failed', { msg: e.message }), { id: tid })
    } finally { setOcrRunning(false); setOcrProgress(0) }
  }

  const hasSelection = !!sel

  return (
    <div className={styles.toolbar}>
      {/* Mobile-only: toggle the Pages drawer (hidden on desktop, panel is always visible there) */}
      <button
        className={`${styles.toolBtn} ${styles.mobileOnly} ${mobilePagesOpen ? styles.active : ''}`}
        onClick={() => setMobilePagesOpen(!mobilePagesOpen)}
        title={t('tb_pages')} aria-label={t('tb_toggle_pages')}
      >
        <PanelLeft size={16} />
      </button>

      <DropZone compact />
      <div className={styles.sep} />

      {/* Drawing tools */}
      <div className={styles.toolGroup}>
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button key={id}
            className={`${styles.toolBtn} ${activeTool === id ? styles.active : ''}`}
            onClick={() => setActiveTool(id)} title={t(label)} aria-label={t(label)}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <div className={`${styles.sep} ${styles.desktopOnly}`} />

      {/* Font family — hidden on mobile; use the Properties drawer instead (less crowding) */}
      <select
        className={`${styles.select} ${styles.desktopOnly}`}
        value={fontFamily}
        onChange={e => handleFontFamily(e.target.value)}
        disabled={!hasSelection}
        title={t('tb_font_family')}
        aria-label={t('tb_font_family')}
      >
        {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>

      {/* Font size */}
      <input
        type="number"
        className={`${styles.numInput} ${styles.desktopOnly}`}
        value={fontSize}
        min={4} max={200}
        disabled={!hasSelection}
        onChange={e => handleFontSize(e.target.value)}
        title={t('tb_font_size')}
        aria-label={t('tb_font_size')}
      />

      {/* Bold */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${bold ? styles.fmtActive : ''}`}
        onClick={handleBold}
        disabled={!hasSelection}
        title={t('tb_bold')}
        aria-label={t('tb_bold')}
        aria-pressed={bold}
      >
        <Bold size={14} />
      </button>

      {/* Italic */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${italic ? styles.fmtActive : ''}`}
        onClick={handleItalic}
        disabled={!hasSelection}
        title={t('tb_italic')}
        aria-label={t('tb_italic')}
        aria-pressed={italic}
      >
        <Italic size={14} />
      </button>

      {/* Underline — CSS only, marks in store */}
      <button
        className={`${styles.fmtBtn} ${styles.desktopOnly} ${underline ? styles.fmtActive : ''}`}
        onClick={handleUnderline}
        disabled={!hasSelection}
        title={t('tb_underline')}
        aria-label={t('tb_underline')}
        aria-pressed={underline}
      >
        <Underline size={14} />
      </button>

      <div className={`${styles.sep} ${styles.desktopOnly}`} />

      {/* Color */}
      <input
        type="color"
        className={`${styles.colorPicker} ${styles.desktopOnly}`}
        value={color}
        disabled={!hasSelection}
        onChange={e => handleColor(e.target.value)}
        title={t('tb_color')}
        aria-label={t('tb_color')}
      />

      <div className={styles.sep} />

      {/* Undo / Redo */}
      <button className={styles.toolBtn} onClick={handleUndo} title={t('tb_undo')} aria-label={t('tb_undo')}>
        <Undo2 size={15} />
      </button>
      <button className={styles.toolBtn} onClick={handleRedo} title={t('tb_redo')} aria-label={t('tb_redo')}>
        <Redo2 size={15} />
      </button>

      <div className={styles.sep} />

      {/* Zoom */}
      <button className={styles.toolBtn} onClick={() => setZoom(zoom - 0.2)} title={t('tb_zoom_out')}><ZoomOut size={15} /></button>
      <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
      <button className={styles.toolBtn} onClick={() => setZoom(zoom + 0.2)} title={t('tb_zoom_in')}><ZoomIn size={15} /></button>

      <div className={styles.spacer} />

      <select
        className={`${styles.select} ${styles.desktopOnly}`}
        value={ocrLang}
        onChange={e => setOcrLang(e.target.value)}
        disabled={ocrRunning}
        title={t('tb_ocr_lang')}
        aria-label={t('tb_ocr_lang')}
      >
        {OCR_LANGS.map(l => <option key={l.code} value={l.code}>{t(l.label)}</option>)}
      </select>

      <button
        className={`${styles.aiBtn} ${ocrRunning ? styles.aiBtnActive : ''}`}
        onClick={handleOcr} disabled={ocrRunning || !file}
      >
        {ocrRunning
          ? <><Loader2 size={13} className={styles.spin} /> {t('tb_ocr')} {ocrProgress}%</>
          : <><Scan size={13} /> {t('tb_ocr')}</>}
      </button>

      <button className={styles.aiBtn} onClick={() => toast(t('tb_ai_soon'), { icon: '✨' })}>
        <Sparkles size={13} /> {t('tb_ai_fix')}
      </button>

      <div className={styles.sep} />

      <div className={styles.sep} />

      {/* Mobile-only: toggle the Properties drawer */}
      <button
        className={`${styles.toolBtn} ${styles.mobileOnly} ${mobilePropertiesOpen ? styles.active : ''}`}
        onClick={() => setMobilePropertiesOpen(!mobilePropertiesOpen)}
        title={t('tb_properties')} aria-label={t('tb_toggle_props')}
      >
        <SlidersHorizontal size={16} />
      </button>

      <button className={styles.exportBtn} onClick={handleExport} disabled={!file}>
        <Download size={14} /> {t('tb_download')}
      </button>
    </div>
  )
}
