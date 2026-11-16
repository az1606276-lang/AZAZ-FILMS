import type { Film } from '../types/cinema';

export interface FilmChromaticDNA {
  slices: string[];
  swatches: string[];
  contrastRatio: number; // 0..100
  warmthRatio: number; // 0..100
  saturationRatio: number; // 0..100
  luminanceRatio: number; // 0..100
}

export interface FilmRadarMetrics {
  contrast: number;
  warmth: number;
  saturation: number;
  pacing: number;
  originality: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function isSameOriginUrl(url: string): boolean {
  if (url.startsWith('/') || url.startsWith('data:')) return true;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function extractFilmChromaticDna(imageUrl: string): Promise<FilmChromaticDNA | null> {
  return new Promise((resolve) => {
    if (!imageUrl || !imageUrl.trim()) {
      resolve(null);
      return;
    }

    const img = new Image();
    if (!isSameOriginUrl(imageUrl)) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const w = 72;
        const h = 40;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        const sliceCount = 36;
        const colsPerSlice = Math.floor(w / sliceCount);
        const slices: string[] = [];
        const candidates: { r: number; g: number; b: number; lum: number; sat: number }[] = [];

        let minLum = 255;
        let maxLum = 0;
        let lumTotal = 0;
        let satTotal = 0;
        let warmthTotal = 0;

        for (let s = 0; s < sliceCount; s++) {
          let rSum = 0;
          let gSum = 0;
          let bSum = 0;
          let count = 0;
          const xStart = s * colsPerSlice;
          const xEnd = Math.min(w, xStart + colsPerSlice);
          for (let y = 0; y < h; y++) {
            for (let x = xStart; x < xEnd; x++) {
              const idx = (y * w + x) * 4;
              rSum += data[idx];
              gSum += data[idx + 1];
              bSum += data[idx + 2];
              count++;
            }
          }
          const r = rSum / count;
          const g = gSum / count;
          const b = bSum / count;
          slices.push(rgbToHex(r, g, b));

          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
          const warmDelta = (r - b) / 255; // -1 cool to +1 warm

          minLum = Math.min(minLum, lum);
          maxLum = Math.max(maxLum, lum);
          lumTotal += lum;
          satTotal += sat;
          warmthTotal += warmDelta;

          candidates.push({ r, g, b, lum, sat });
        }

        const sortedByLum = [...candidates].sort((a, b) => a.lum - b.lum);
        const pickIndices = [
          Math.floor(sortedByLum.length * 0.1),
          Math.floor(sortedByLum.length * 0.35),
          Math.floor(sortedByLum.length * 0.62),
          Math.floor(sortedByLum.length * 0.88),
        ];
        const mostVibrant = [...candidates].sort(
          (a, b) => b.sat * (b.lum + 40) - a.sat * (a.lum + 40)
        )[0];
        const rawSwatches = [...pickIndices.map((i) => sortedByLum[i]), mostVibrant].filter(Boolean);

        const uniqueSwatches: string[] = [];
        for (const c of rawSwatches) {
          const hex = rgbToHex(c.r, c.g, c.b);
          if (!uniqueSwatches.includes(hex)) {
            uniqueSwatches.push(hex);
          }
        }

        const contrastRatio = Math.min(100, Math.max(18, Math.round(((maxLum - minLum) / 235) * 100)));
        const warmthRatio = Math.min(
          100,
          Math.max(12, Math.round(((warmthTotal / sliceCount + 0.6) / 1.2) * 100))
        );
        const saturationRatio = Math.min(
          100,
          Math.max(15, Math.round((satTotal / sliceCount) * 145))
        );
        const luminanceRatio = Math.min(
          100,
          Math.max(12, Math.round((lumTotal / sliceCount / 255) * 130))
        );

        resolve({
          slices,
          swatches: uniqueSwatches.slice(0, 5),
          contrastRatio,
          warmthRatio,
          saturationRatio,
          luminanceRatio,
        });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

export function computeFilmRadarMetrics(
  film: Film,
  dna: FilmChromaticDNA | null
): FilmRadarMetrics {
  // Deterministic genre baseline if artwork pixels are cross-origin blocked
  const genreDefaults: Record<string, { contrast: number; warmth: number; sat: number; pacing: number }> = {
    military: { contrast: 84, warmth: 62, sat: 58, pacing: 86 },
    action: { contrast: 80, warmth: 68, sat: 72, pacing: 90 },
    thriller: { contrast: 88, warmth: 40, sat: 46, pacing: 82 },
    historical: { contrast: 70, warmth: 76, sat: 60, pacing: 64 },
    drama: { contrast: 66, warmth: 58, sat: 54, pacing: 58 },
    other: { contrast: 72, warmth: 55, sat: 60, pacing: 68 },
  };
  const fallback = genreDefaults[film.genre] || genreDefaults.other;

  const durMin = (film.durationSeconds || 0) / 60;
  const pacingFromDuration =
    durMin > 0
      ? Math.max(35, Math.min(95, Math.round(105 - Math.min(durMin, 140) * 0.45)))
      : fallback.pacing;

  const originality =
    (film.isOriginal ? 78 : 56) +
    (film.director ? 10 : 0) +
    (film.stillUrls && film.stillUrls.length > 0 ? 8 : 0);

  return {
    contrast: dna ? dna.contrastRatio : fallback.contrast,
    warmth: dna ? dna.warmthRatio : fallback.warmth,
    saturation: dna ? dna.saturationRatio : fallback.sat,
    pacing: pacingFromDuration,
    originality: Math.min(98, originality),
  };
}
