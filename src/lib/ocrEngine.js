import { createWorker } from 'tesseract.js'

// Languages offered in the UI. `code` is the Tesseract traineddata code,
// `label` is an i18n key (see src/i18n/strings.js).
export const OCR_LANGS = [
  { code: 'eng', label: 'oc_lang_eng' },
  { code: 'ara', label: 'oc_lang_ara' },
  { code: 'urd', label: 'oc_lang_urd' },
  { code: 'hin', label: 'oc_lang_hin' },
  { code: 'mal', label: 'oc_lang_mal' },
  { code: 'ben', label: 'oc_lang_ben' },
  { code: 'nep', label: 'oc_lang_nep' },
]

// Scripts written right-to-left — used to set the direction of OCR'd text blocks.
const RTL_LANGS = new Set(['ara', 'urd'])

let worker = null
let workerLang = null
let progressCb = null

export async function initOcr(onProgress, lang = 'eng') {
  progressCb = onProgress
  if (worker && workerLang === lang) return worker
  if (worker) {
    await worker.terminate()
    worker = null
    workerLang = null
  }
  worker = await createWorker(lang, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && progressCb) {
        progressCb(Math.round(m.progress * 100))
      }
    },
  })
  workerLang = lang
  return worker
}

/**
 * Run OCR on a rendered canvas element.
 * Returns array of word objects: { text, x, y, width, height, confidence }
 */
export async function ocrCanvas(canvas, onProgress, lang = 'eng') {
  const w = await initOcr(onProgress, lang)
  const { data } = await w.recognize(canvas)
  const rtl = RTL_LANGS.has(lang)

  const words = []
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const word of line.words || []) {
          if (!word.text.trim() || word.confidence < 30) continue
          words.push({
            id:         `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            str:        word.text,
            x:          word.bbox.x0,
            y:          word.bbox.y0,
            width:      word.bbox.x1 - word.bbox.x0,
            height:     word.bbox.y1 - word.bbox.y0,
            fontSize:   Math.max((word.bbox.y1 - word.bbox.y0) * 0.8, 8),
            fontName:   rtl ? 'Noto Naskh Arabic' : 'Helvetica',
            fontFamily: rtl ? '"Noto Naskh Arabic", "Noto Sans", Arial, sans-serif' : undefined,
            color:      '#000000',
            confidence: word.confidence,
            fromOcr:    true,
          })
        }
      }
    }
  }
  return words
}

export async function terminateOcr() {
  if (worker) { await worker.terminate(); worker = null; workerLang = null }
}
