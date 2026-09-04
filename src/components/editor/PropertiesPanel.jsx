import React from 'react'
import { FileText, Layers, Info, Lock, Droplets, EyeOff, Palette } from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import { addWatermark, downloadBytes } from '../../lib/pdfExporter.js'
import { useT } from '../../i18n/index.jsx'
import styles from './PropertiesPanel.module.css'

export default function PropertiesPanel() {
  const {
    selectedElement, selectedElementPage,
    file, fileName, pageCount, editLayers,
    updateTextBlock, commitExtractedEdit,
  } = usePdfStore()
  const { t } = useT()

  const totalEdits = Object.values(editLayers).reduce(
    (sum, layer) => sum + (layer.texts?.length || 0) + (layer.annotations?.length || 0), 0
  )

  // Update a property on the selected element (works for both store & extracted)
  const updateProp = (updates) => {
    if (!selectedElement || !selectedElementPage) return
    const targetId = selectedElement.isExtracted && !selectedElement.isEdited
      ? `edited-${selectedElement.id}`
      : selectedElement.id
    // For extracted blocks that haven't been committed yet, commitExtractedEdit
    // For store blocks (user-added or already-committed), updateTextBlock
    if (selectedElement.isExtracted && !selectedElement.isEdited) {
      commitExtractedEdit(selectedElementPage, selectedElement, selectedElement.str)
    }
    updateTextBlock(selectedElementPage, targetId, updates)
    // Also update selectedElement in store so UI reflects immediately
  }

  const handleWatermark = async () => {
    if (!file) return
    const text = window.prompt(t('pp_watermark_prompt'), 'CONFIDENTIAL')
    if (!text) return
    const tid = toast.loading(t('pp_adding_watermark'))
    try {
      const bytes = await addWatermark(file, text)
      downloadBytes(bytes, `watermarked-${fileName}`)
      toast.success(t('pp_downloaded'), { id: tid })
    } catch { toast.error(t('pp_failed'), { id: tid }) }
  }

  // Clean font name for display
  const displayFont = (name) => {
    if (!name) return t('pp_unknown')
    return name
      .replace(/^[A-Z]{6}\+/, '')
      .replace(/-(Bold|Italic|Oblique|Regular)/gi, '')
      .replace(/^g_[a-z0-9]+_/i, '')
      .slice(0, 22)
  }

  return (
    <div className={styles.panel}>

      {/* Document info */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}><Info size={12} /> {t('pp_document')}</div>
        <div className={styles.row}><span className={styles.lbl}>{t('pp_pages')}</span><span className={styles.val}>{pageCount || '—'}</span></div>
        <div className={styles.row}><span className={styles.lbl}>{t('pp_edits')}</span><span className={styles.val}>{totalEdits}</span></div>
        <div className={styles.row}><span className={styles.lbl}>{t('pp_file')}</span><span className={styles.val} style={{ fontSize: 10, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || '—'}</span></div>
      </div>

      {/* Selection properties — only when something is selected */}
      {selectedElement ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Layers size={12} /> {t('pp_selection')}</div>

          {/* Detected font badge */}
          <div className={styles.detectedFont}>
            <Palette size={11} />
            {displayFont(selectedElement.fontName)}
            {selectedElement.isExtracted && !selectedElement.isEdited && (
              <span className={styles.extractedBadge}>{t('pp_original')}</span>
            )}
          </div>

          {/* Text preview */}
          <div className={styles.textPreview}>
            {selectedElement.str?.slice(0, 60) || t('pp_empty')}
            {(selectedElement.str?.length || 0) > 60 ? '…' : ''}
          </div>

          {/* Font family */}
          <div className={styles.row}>
            <span className={styles.lbl}>{t('pp_font')}</span>
            <select
              className={styles.ctrl}
              defaultValue="Helvetica"
              onChange={e => updateProp({ fontName: e.target.value })}
            >
              {['Helvetica', 'Times New Roman', 'Times-Roman', 'Courier New', 'Courier', 'Georgia', 'Arial', 'Noto Naskh Arabic'].map(f => (
                <option key={f} value={f}>{f.replace('Times-Roman','Times Roman')}</option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div className={styles.row}>
            <span className={styles.lbl}>{t('pp_size')}</span>
            <input
              type="number" min={4} max={200}
              className={styles.numCtrl}
              defaultValue={Math.round(selectedElement.fontSize || 12)}
              onChange={e => updateProp({ fontSize: Math.max(4, Number(e.target.value)) })}
            />
          </div>

          {/* Color — shows the DETECTED color from PDF */}
          <div className={styles.row}>
            <span className={styles.lbl}>{t('pp_color')}</span>
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorCtrl}
                defaultValue={selectedElement.color || '#000000'}
                onChange={e => updateProp({ color: e.target.value })}
              />
              <span className={styles.colorHex}>{selectedElement.color || '#000000'}</span>
            </div>
          </div>

          {/* Position readout */}
          <div className={styles.row}>
            <span className={styles.lbl}>X</span>
            <span className={styles.val} style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(selectedElement.x)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.lbl}>Y</span>
            <span className={styles.val} style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(selectedElement.y)}</span>
          </div>
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Layers size={12} /> {t('pp_selection')}</div>
          <div className={styles.emptyHint}>
            {t('pp_hint')}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}><FileText size={12} /> {t('pp_actions')}</div>
        <div className={styles.actionList}>
          <button className={styles.actionBtn} onClick={handleWatermark}>
            <Droplets size={13} /> {t('pp_watermark')}
          </button>
          <button className={styles.actionBtn} onClick={() => toast(t('pp_redact_hint'), { icon: '🔲' })}>
            <EyeOff size={13} /> {t('pp_redact')}
          </button>
          <button className={styles.actionBtn} onClick={() => toast(t('pp_protect_hint'), { icon: '🔒' })}>
            <Lock size={13} /> {t('pp_protect')}
          </button>
        </div>
      </div>

      {/* Export as */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('pp_export_as')}</div>
        <div className={styles.actionList}>
          <button className={styles.actionBtn} onClick={() => toast(t('pp_later'), { icon: '📄' })}>📄 {t('pp_docx')}</button>
          <button className={styles.actionBtn} onClick={() => toast(t('pp_later'), { icon: '🖼' })}>🖼 {t('pp_png')}</button>
          <button className={styles.actionBtn} onClick={() => toast(t('pp_later'), { icon: '📋' })}>📋 {t('pp_txt')}</button>
        </div>
      </div>

    </div>
  )
}
