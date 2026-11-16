import { useEffect, useRef, useState } from 'react';
import { Armchair, Bookmark, Check, ChevronLeft, ChevronRight, Info, Play, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { GENRE_LABELS, STATUS_LABELS, t } from '../lib/i18n';
import type { AppLanguage, Film } from '../types/cinema';
import heroStageBackdrop from '../assets/images/cinema_hero_stage_1794735694699.jpg';

function isDirectPreviewUrl(url?: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (!clean) return false;
  if (clean.startsWith('/assets/') || clean.startsWith('/uploads/')) return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/.test(clean);
}

interface HeroSectionProps {
  slides: Film[];
  lang: AppLanguage;
  watchlistIds: string[];
  onWatchFilm: (film: Film) => void;
  onWatchInHall?: (film: Film) => void;
  onOpenFathersSinGala?: (film: Film) => void;
  onViewDetails: (film: Film) => void;
  onToggleWatchlist: (film: Film) => void;
}

export function HeroSection({
  slides,
  lang,
  watchlistIds,
  onWatchFilm,
  onWatchInHall,
  onOpenFathersSinGala,
  onViewDetails,
  onToggleWatchlist,
}: HeroSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [slides.length, activeIndex]);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 7500);
    return () => window.clearInterval(timer);
  }, [slides.length, paused]);

  const film = slides[activeIndex] || slides[0];
  const previewSrc =
    film && isDirectPreviewUrl(film.trailerUrl)
      ? film.trailerUrl!.trim()
      : film && isDirectPreviewUrl(film.videoUrl)
      ? film.videoUrl!.trim()
      : '';

  useEffect(() => {
    setPreviewReady(false);
    setPreviewFailed(false);
    setPreviewMuted(true);
  }, [film?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = previewMuted;
  }, [previewMuted]);

  if (!film) return null;

  const inWatchlist = watchlistIds.includes(film.id);
  const backdropSrc = film.backdropUrl && film.backdropUrl.trim() ? film.backdropUrl : heroStageBackdrop;
  const primaryTitle = lang === 'ar' ? film.titleAr : film.titleEn;
  const secondaryTitle =
    film.titleAr !== film.titleEn ? (lang === 'ar' ? film.titleEn : film.titleAr) : '';
  const synopsis =
    lang === 'ar'
      ? film.synopsisAr || film.synopsisEn || ''
      : film.synopsisEn || film.synopsisAr || '';
  const genreLabel = GENRE_LABELS[film.genre]?.[lang] || film.genre;
  const statusLabel = STATUS_LABELS[film.status]?.[lang] || film.status;
  const isComingSoon = film.status !== 'released';

  const goPrev = () => setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  const goNext = () => setActiveIndex((prev) => (prev + 1) % slides.length);

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative min-h-[76vh] w-full overflow-hidden border-b border-white/[0.08] bg-[#050505]"
    >
      {/* Cinema Backdrop Image */}
      <img
        key={film.id}
        src={backdropSrc}
        alt={`${film.titleAr} — ${film.titleEn}`}
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-75 transition-opacity duration-700"
      />

      {/* Ambient Muted Video Preview */}
      {previewSrc && !previewFailed && (
        <video
          ref={videoRef}
          key={`preview-${film.id}`}
          src={previewSrc}
          poster={backdropSrc}
          autoPlay
          muted={previewMuted}
          loop
          playsInline
          preload="metadata"
          onCanPlay={() => setPreviewReady(true)}
          onError={() => setPreviewFailed(true)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${
            previewReady ? 'opacity-65' : 'opacity-0'
          }`}
        />
      )}

      {/* Directional Cinema Scrims for WCAG contrast */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/55 to-[#050505]/30" />
      <div
        className={`pointer-events-none absolute inset-0 ${
          lang === 'ar'
            ? 'bg-gradient-to-l from-[#050505] via-[#050505]/70 to-transparent'
            : 'bg-gradient-to-r from-[#050505] via-[#050505]/70 to-transparent'
        }`}
      />

      <div className="relative z-10 mx-auto flex min-h-[76vh] max-w-[1440px] flex-col justify-end px-4 pb-14 pt-28 sm:px-8 lg:pb-20">
        <div className="max-w-2xl space-y-5">
          {/* Unboxed Editorial Kicker */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium tracking-[0.16em] text-[#D4AF37]">
            <span>{film.isOriginal ? 'AZ ORIGINALS' : 'AZ FILMS'}</span>
            <span aria-hidden="true" className="text-[#F5F5F0]/35">
              ·
            </span>
            <span className="text-[#F5F5F0]/75 tracking-normal">{t(lang, 'brandTagline')}</span>
          </div>

          {/* Primary Headline */}
          <div className="space-y-1.5">
            <h1 className="text-4xl font-bold leading-tight text-[#F5F5F0] sm:text-5xl lg:text-6xl text-balance">
              {primaryTitle}
            </h1>
            {secondaryTitle && (
              <p className="font-cinema-display text-xl tracking-[0.18em] text-[#D4AF37]/90 sm:text-2xl">
                {secondaryTitle}
              </p>
            )}
          </div>

          {/* Unboxed Metadata Row */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-[#F5F5F0]/75">
            <span className="tabular-nums font-medium text-[#F5F5F0]">{film.year}</span>
            <span aria-hidden="true" className="text-[#F5F5F0]/35">
              ·
            </span>
            <span>{genreLabel}</span>
            {film.duration && film.duration !== '—' && (
              <>
                <span aria-hidden="true" className="text-[#F5F5F0]/35">
                  ·
                </span>
                <span className="tabular-nums">{film.duration}</span>
              </>
            )}
            <span aria-hidden="true" className="text-[#F5F5F0]/35">
              ·
            </span>
            <span className={isComingSoon ? 'text-[#D4AF37]' : 'text-[#F5F5F0]/70'}>
              {statusLabel}
            </span>
            <span aria-hidden="true" className="text-[#F5F5F0]/35">
              ·
            </span>
            <span className="font-cinema-mono text-xs tracking-[0.12em] text-[#D4AF37]/85">
              4K · 2.39:1 · IMAX DSP
            </span>
          </div>

          {/* Short Synopsis */}
          {synopsis && (
            <p className="max-w-xl text-sm leading-relaxed text-[#F5F5F0]/80 sm:text-base line-clamp-3">
              {synopsis}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!isComingSoon && (
              <>
                <button
                  type="button"
                  onClick={() => onWatchFilm(film)}
                  className="flex h-12 items-center gap-2.5 rounded-lg bg-[#D4AF37] px-6 text-sm font-semibold text-[#050505] transition-colors hover:bg-[#E6C65B] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>{t(lang, 'watchFilm')}</span>
                </button>

                {onWatchInHall && (
                  <button
                    type="button"
                    onClick={() => onWatchInHall(film)}
                    className="flex h-12 items-center gap-2.5 rounded-lg border border-[#D4AF37]/55 bg-[#D4AF37]/15 px-5 text-sm font-semibold text-[#D4AF37] backdrop-blur-sm transition-colors hover:bg-[#D4AF37] hover:text-[#050505] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Armchair className="h-4 w-4" />
                    <span>{lang === 'ar' ? 'ادخل قاعة العرض 3D' : '3D Cinema Hall'}</span>
                  </button>
                )}

                {film.id === 'fathers-sin' && onOpenFathersSinGala && (
                  <button
                    type="button"
                    onClick={() => onOpenFathersSinGala(film)}
                    className="flex h-12 items-center gap-2.5 rounded-lg border border-[#D4AF37] bg-[#D4AF37]/20 px-5 text-sm font-semibold text-[#F5DE93] backdrop-blur-sm transition-colors hover:bg-[#D4AF37] hover:text-[#050505] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{lang === 'ar' ? 'حفل التقديم الحي' : 'Live Gala Premiere'}</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => onViewDetails(film)}
              className="flex h-12 items-center gap-2.5 rounded-lg border border-white/20 bg-white/[0.06] px-6 text-sm font-semibold text-[#F5F5F0] backdrop-blur-sm transition-colors hover:border-[#D4AF37]/60 hover:bg-white/[0.12] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Info className="h-4 w-4 text-[#D4AF37]" />
              <span>{t(lang, 'viewDetails')}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleWatchlist(film)}
              aria-label={inWatchlist ? t(lang, 'inMyList') : t(lang, 'addToMyList')}
              className={`flex h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                inWatchlist
                  ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]'
                  : 'border-white/15 bg-white/[0.04] text-[#F5F5F0]/80 hover:border-white/30 hover:text-[#F5F5F0]'
              }`}
            >
              {inWatchlist ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              <span>{inWatchlist ? t(lang, 'inMyList') : t(lang, 'addToMyList')}</span>
            </button>
          </div>
        </div>

        {/* Spotlight Slider Controls & Preview Audio Toggle */}
        {(slides.length > 1 || (previewSrc && !previewFailed && previewReady)) && (
          <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-4">
            <div className="flex items-center gap-2">
              {slides.length > 1 &&
                slides.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    aria-label={lang === 'ar' ? s.titleAr : s.titleEn}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      idx === activeIndex ? 'w-8 bg-[#D4AF37]' : 'w-3 bg-white/25 hover:bg-white/45'
                    }`}
                  />
                ))}
            </div>
            <div className="flex items-center gap-2">
              {previewSrc && !previewFailed && previewReady && (
                <button
                  type="button"
                  onClick={() => setPreviewMuted((m) => !m)}
                  aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-[#F5F5F0]/80 hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
                >
                  {previewMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}
              {slides.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={lang === 'ar' ? goNext : goPrev}
                    aria-label="Previous"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-[#F5F5F0]/80 hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
                  >
                    {lang === 'ar' ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={lang === 'ar' ? goPrev : goNext}
                    aria-label="Next"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-[#F5F5F0]/80 hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
                  >
                    {lang === 'ar' ? (
                      <ChevronLeft className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
