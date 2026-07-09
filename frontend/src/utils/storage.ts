/** Chaves de persistência local — branding Sistemma */
export const STORAGE_TOKEN = '@sistemma:token'
export const STORAGE_USER = '@sistemma:user'
export const STORAGE_EMAIL = '@sistemma:email'

const LEGACY_TOKEN = '@abastecimento:token'
const LEGACY_USER = '@abastecimento:user'
const LEGACY_EMAIL = '@abastecimento:email'

/** Migra sessão salva com chaves antigas (uma vez por navegador) */
export function migrarStorageLegado(): void {
  try {
    if (!localStorage.getItem(STORAGE_TOKEN) && localStorage.getItem(LEGACY_TOKEN)) {
      localStorage.setItem(STORAGE_TOKEN, localStorage.getItem(LEGACY_TOKEN)!)
      localStorage.removeItem(LEGACY_TOKEN)
    }
    if (!localStorage.getItem(STORAGE_USER) && localStorage.getItem(LEGACY_USER)) {
      localStorage.setItem(STORAGE_USER, localStorage.getItem(LEGACY_USER)!)
      localStorage.removeItem(LEGACY_USER)
    }
    if (!localStorage.getItem(STORAGE_EMAIL) && localStorage.getItem(LEGACY_EMAIL)) {
      localStorage.setItem(STORAGE_EMAIL, localStorage.getItem(LEGACY_EMAIL)!)
      localStorage.removeItem(LEGACY_EMAIL)
    }
  } catch {
    /* storage indisponível */
  }
}
