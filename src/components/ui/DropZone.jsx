import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Upload, FileText, AlertCircle } from 'lucide-react'
import { usePdfStore } from '../../store/pdfStore.js'
import { useT } from '../../i18n/index.jsx'
import styles from './DropZone.module.css'

export default function DropZone({ compact = false }) {
  const navigate = useNavigate()
  const { setFile } = usePdfStore()
  const { t } = useT()

  const onDrop = useCallback(async (accepted, rejected) => {
    if (rejected.length > 0) {
      toast.error(t('dz_only_pdf'))
      return
    }
    if (accepted.length === 0) return

    const file = accepted[0]
    const arrayBuffer = await file.arrayBuffer()
    setFile(arrayBuffer, file.name, file.size)
    toast.success(t('dz_loaded', { name: file.name }))
    navigate('/editor')
  }, [setFile, navigate, t])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  })

  if (compact) {
    return (
      <div {...getRootProps()} className={`${styles.compact} ${isDragActive ? styles.dragging : ''}`}>
        <input {...getInputProps()} />
        <Upload size={16} />
        <span>{t('dz_open')}</span>
      </div>
    )
  }

  return (
    <div {...getRootProps()} className={`${styles.zone} ${isDragActive ? styles.dragging : ''}`}>
      <input {...getInputProps()} />
      <div className={styles.icon}>
        {isDragActive ? <FileText size={36} /> : <Upload size={36} />}
      </div>
      <div className={styles.title}>
        {isDragActive ? t('dz_drop_to_open') : t('dz_drop_here')}
      </div>
      <div className={styles.sub}>
        {t('dz_or')} <span className={styles.browse}>{t('dz_browse')}</span>
      </div>
      <div className={styles.note}>
        <AlertCircle size={12} />
        {t('dz_note')}
      </div>
      <div className={styles.formats}>
        <span>PDF</span>
        <span>{t('dz_scanned')}</span>
        <span>PDF/A</span>
        <span>{t('dz_forms')}</span>
      </div>
    </div>
  )
}
