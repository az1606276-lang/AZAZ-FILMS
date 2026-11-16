import { useState, type PointerEvent } from 'react';
import { Film as FilmIcon } from 'lucide-react';
import { GENRE_LABELS, STATUS_LABELS } from '../lib/i18n';
import type { AppLanguage, Film } from '../types/cinema';

interface FilmPosterCardProps {
  film: Film;
  lang: AppLanguage;
  onSelect: (film: Film) => void;
}

export function FilmPosterCard({ film, lang, onSelect }: FilmPosterCardProps) {
  const [imgError, setImgError] = useState(false);
  const [tilt, setTilt] = useState<{ rx: number; ry: number; mx: number; my: number; active: boolean }>({
    rx: 0,
    ry: 0,
    mx: 50,
    my: 50,
    active: false,
  });
  const hasPoster = Boolean(film.posterUrl && film.posterUrl.trim().length > 0 && !imgError);

  const primaryTitle = lang === 'ar' ? film.titleAr : film.titleEn;
  const secondaryTitle =
    film.titleAr !== film.titleEn ? (lang === 'ar' ? film.titleEn : film.titleAr) : '';
  const genreLabel = GENRE_LABELS[film.genre]?.[lang] || film.genre;
  const statusLabel = STATUS_LABELS[film.status]?.[lang] || film.status;

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({
      rx: (0.5 - y) * 7,
      ry: (x - 0.5) * 7,
      mx: x * 100,
      my: y * 100,
      active: true,
    });
  };

  const resetTilt = () => {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50, active: false });
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(film)}
      className="group relative flex w-full flex-col text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] cursor-pointer"
    >
      <div
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        style={{
          transform: tilt.active
            ? `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateY(-4px)`
            : 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)',
        }}
        className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#0B0B0E] transition-[transform,border-color] duration-200 ease-out group-hover:border-[#D4AF37]/55"
      >
        {/* Specular Gold Sheen Tracking Pointer */}
        <div
          aria-hidden="true"
          style={{
            opacity: tilt.active ? 1 : 0,
            background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(212,175,55,0.18), transparent 55%)`,
          }}
          className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-200"
        />

        {hasPoster ? (
          <>
            <img
              src={film.posterUrl}
              alt={`${film.titleAr} — ${film.titleEn}`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-transparent opacity-85" />
          </>
        ) : (
          /* Editorial Typography Cinema Plate when official poster is not yet uploaded */
          <div className="relative flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_50%_25%,rgba(212,175,55,0.12),rgba(11,11,14,0.98)_70%)] p-5">
            <div className="pointer-events-none absolute inset-3 rounded-lg border border-[#D4AF37]/20 transition-colors duration-300 group-hover:border-[#D4AF37]/45" />

            <div className="relative z-10 flex items-center justify-between text-[11px] tracking-[0.18em] text-[#D4AF37]/80">
              <span>{film.isOriginal ? 'AZ ORIGINALS' : 'AZ FILMS'}</span>
              <FilmIcon className="h-3.5 w-3.5 text-[#D4AF37]/60" />
            </div>

            <div className="relative z-10 my-auto space-y-2 text-center px-2">
              <h3 className="text-xl sm:text-2xl font-bold leading-snug text-[#F5F5F0] text-balance">
                {primaryTitle}
              </h3>
              {secondaryTitle && (
                <p className="font-cinema-display text-sm tracking-[0.16em] text-[#D4AF37]/90">
                  {secondaryTitle}
                </p>
              )}
            </div>

            <div className="relative z-10 flex items-center justify-center gap-2 text-[11px] text-[#F5F5F0]/55">
              <span className="tabular-nums">{film.year}</span>
              <span aria-hidden="true">·</span>
              <span>{genreLabel}</span>
              {film.status !== 'released' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#D4AF37]">{statusLabel}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Overlay footer on uploaded poster */}
        {hasPoster && (
          <div className="absolute inset-x-0 bottom-0 p-4">
            {film.isOriginal && (
              <p className="mb-1 text-[10px] font-medium tracking-[0.2em] text-[#D4AF37]">
                AZ ORIGINALS
              </p>
            )}
            <h3 className="text-base font-bold leading-snug text-[#F5F5F0] line-clamp-1">
              {primaryTitle}
            </h3>
            {secondaryTitle && (
              <p className="mt-0.5 text-xs tracking-wide text-[#F5F5F0]/70 line-clamp-1">
                {secondaryTitle}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Clean unboxed metadata below poster frame */}
      <div className="mt-3 flex flex-col gap-1 px-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#F5F5F0] truncate group-hover:text-[#D4AF37] transition-colors">
            {primaryTitle}
          </span>
          <span className="text-xs text-[#F5F5F0]/50 tabular-nums shrink-0">{film.year}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#F5F5F0]/55">
          <span className="truncate">{genreLabel}</span>
          {film.status !== 'released' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#D4AF37] shrink-0">{statusLabel}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
