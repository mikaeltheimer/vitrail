// Cache d'images pour le canvas : charge chaque photo une seule fois, à la demande, et prévient quand une image arrive
// pour que l'appelant redessine. Les photos locales (blob:) de l'aperçu passent par le même chemin.

export class ImageCache {
  private map = new Map<string, HTMLImageElement | 'loading' | 'error'>()
  private listeners = new Set<() => void>()

  /** Appelle `fn` chaque fois qu'une image vient de finir de charger. Renvoie la fonction pour se désabonner. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** L'image si elle est prête (et lance son chargement sinon). */
  get(url: string): HTMLImageElement | null {
    const v = this.map.get(url)
    if (v === undefined) {
      this.load(url)
      return null
    }
    return typeof v === 'string' ? null : v
  }

  /** L'image si elle est déjà prête, sans rien lancer. */
  peek(url: string): HTMLImageElement | null {
    const v = this.map.get(url)
    return v === undefined || typeof v === 'string' ? null : v
  }

  private load(url: string) {
    this.map.set(url, 'loading')
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      this.map.set(url, img)
      this.listeners.forEach(fn => fn())
    }
    img.onerror = () => {
      this.map.set(url, 'error')
      // Nouvel essai possible plus tard, sans marteler le serveur
      setTimeout(() => this.map.delete(url), 30_000)
    }
    img.src = url
  }
}
