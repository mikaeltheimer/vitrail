import type { Locale } from '@/i18n/config'
import messages from './messages/fr.json'

// Clés de messages typées : le français sert de référence (l'anglais est vérifié par npm run check:i18n).
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof messages
  }
}
