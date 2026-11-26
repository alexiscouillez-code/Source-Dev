/**
 * Photos prises dans l'appli (étiquette d'un produit, assiette) : réduites dans le téléphone avant l'envoi
 * (1024 px, JPEG) pour partir vite et peu coûter, et lecture du code-barres sur place quand le navigateur sait le faire.
 */

/** Réduit une photo en image JPEG de 1024 px au plus sur le grand côté, en adresse « data: ». */
export async function shrinkPhoto(file: File, max = 1024): Promise<string> {
  const src = await loadImage(file);
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("Photo illisible");
  g.drawImage(src.img, 0, 0, w, h);
  if ("close" in src.img) (src.img as ImageBitmap).close();
  return c.toDataURL("image/jpeg", 0.82);
}

async function loadImage(file: File): Promise<{ img: CanvasImageSource; width: number; height: number }> {
  // Orientation de l'appareil respectée (photos prises en portrait).
  if ("createImageBitmap" in window) {
    try { const b = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions); return { img: b, width: b.width, height: b.height }; } catch { /* format non pris en charge : on passe par une image */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("Photo illisible")); img.src = url; });
    return { img, width: img.naturalWidth, height: img.naturalHeight };
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

interface Detector { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> }
/** Code-barres lu directement sur la photo (Chrome sur Android notamment) ; null si le navigateur ne sait pas faire. */
export async function barcodeFrom(file: File): Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (!BD) return null;
  try {
    const det = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const bmp = await createImageBitmap(file);
    const found = await det.detect(bmp);
    bmp.close();
    const code = found.map((f) => f.rawValue.replace(/\D/g, "")).find((v) => v.length >= 8 && v.length <= 14);
    return code ?? null;
  } catch { return null; }
}
