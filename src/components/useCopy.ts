import { usePreview } from '../PreviewContext'
import { translations } from '../i18n'

export function useCopy() {
  const { language } = usePreview()
  return translations[language]
}
