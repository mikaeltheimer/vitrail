// Côté navigateur : recadre la photo choisie en carré (centre) et la réduit en JPEG avant l'envoi.
// Le serveur n'accepte que du JPEG de 700 Ko au plus ; une photo de téléphone de plusieurs Mo devient ~100 Ko.

/** Erreur côté navigateur : porte une clé de `photo.erreurs`, traduite par le composant. `message` ne sert qu'aux serveurs ou aux journaux. */
export type PhotoErrorKey = 'pasUneImage' | 'illisible' | 'navigateur' | 'imageVide' | 'tropLourde' | 'envoi'
export class PhotoError extends Error {
  constructor(
    public key: PhotoErrorKey,
    /** Message déjà traduit renvoyé par le serveur (dans la langue de la requête), s'il y en a un. */
    public serverMessage?: string,
  ) {
    super(key)
  }
}

const MAX_SIDE = 768
const MAX_BYTES = 650_000

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' }) // respecte l'orientation de la photo
  } catch {
    return await createImageBitmap(file)
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new PhotoError('imageVide'))), 'image/jpeg', quality))
}

export async function squareJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new PhotoError('pasUneImage')
  const bitmap = await decode(file).catch(() => {
    throw new PhotoError('illisible')
  })
  const side = Math.min(bitmap.width, bitmap.height)
  const out = Math.min(MAX_SIDE, side)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoError('navigateur')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out)
  bitmap.close()

  let blob = await toJpeg(canvas, 0.85)
  if (blob.size > MAX_BYTES) blob = await toJpeg(canvas, 0.65)
  if (blob.size > MAX_BYTES) throw new PhotoError('tropLourde')
  return blob
}

/** Envoie la photo au serveur ; renvoie le chemin à joindre au don. */
export async function uploadPhoto(blob: Blob): Promise<string> {
  const res = await fetch('/api/photo', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.path) throw new PhotoError('envoi', typeof data.error === 'string' ? data.error : undefined)
  return data.path as string
}
