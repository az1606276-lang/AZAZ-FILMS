import { useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { extractFilmChromaticDna, type FilmChromaticDNA } from '../services/filmDnaService';
import type { AppLanguage } from '../types/cinema';

interface FilmColorBarcodeProps {
  filmId: string;
  imageUrl?: string;
  lang: AppLanguage;
}

export function FilmColorBarcode({ filmId, imageUrl, lang }: FilmColorBarcodeProps) {
  const [dna, setDna] = useState<FilmChromaticDNA | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDna(null);
    if (!imageUrl || !imageUrl.trim()) return;
    extractFilmChromaticDna(imageUrl).then((res) => {
      if (!cancelled) setDna(res);
    });
    return () => {
      cancelled = true;
    };
  }, [filmId, imageUrl]);

  const handleCopyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      window.setTimeout(() => setCopiedHex(null), 1800);
    } catch {
      // Clipboard unsupported
    }
  };

  if (!dna) {
    return null;
  }

  return (
    <section className="space-y-4 border-t border-white/[0.08] pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-[#D4AF37]" />
          <h2 className="text-lg font-bold text-[#D4AF37]">
            {lang === 'ar' ? 'البصمة اللونية للعمل' : 'Chromatic Film DNA'}
          </h2>
        </div>
        <span className="text-xs text-[#F5F5F0]/50">
          {lang === 'ar'
            ? 'تحليل طيفي مستخرج من إطارات العمل الفعلية'
            : 'Live chromatic spectrum sampled from official artwork'}
        </span>
      </div>

      {/* 36-Slice Cinema Barcode Ribbon */}
      <div
        className="flex h-12 w-full overflow-hidden rounded-lg border border-white/10"
        role="img"
        aria-label={lang === 'ar' ? 'شريط الألوان الطيفي للفيلم' : 'Film chromatic barcode'}
      >
        {dna.slices.map((hex, i) => (
          <div
            key={`${hex}-${i}`}
            className="h-full flex-1 transition-transform duration-200 hover:scale-y-110"
            style={{ backgroundColor: hex }}
            title={hex}
          />
        ))}
      </div>

      {/* 5 Clickable Color Swatches */}
      <div className="flex flex-wrap items-center gap-3">
        {dna.swatches.map((hex) => {
          const isCopied = copiedHex === hex;
          return (
            <button
              key={hex}
              type="button"
              onClick={() => handleCopyHex(hex)}
              className="group flex items-center gap-2.5 rounded-lg border border-white/10 bg-[#0B0B0E] px-3 py-2 text-xs transition-colors hover:border-[#D4AF37]/60 cursor-pointer"
            >
              <span
                className="h-4 w-4 rounded border border-white/20 shrink-0"
                style={{ backgroundColor: hex }}
              />
              <span className="font-cinema-mono text-[#F5F5F0]/85">{hex}</span>
              {isCopied && <Check className="h-3.5 w-3.5 text-[#D4AF37]" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
