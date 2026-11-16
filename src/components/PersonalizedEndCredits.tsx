import { useState } from 'react';
import { Award, Download, Edit3, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  getSavedViewerCreditName,
  getViewerSeatNumber,
  saveViewerCreditName,
} from '../services/cinemaPulseService';
import type { AppLanguage, Film } from '../types/cinema';

interface PersonalizedEndCreditsProps {
  film: Film;
  nextFilm?: Film | null;
  defaultViewerName?: string;
  lang: AppLanguage;
  onReplay: () => void;
  onPlayNext?: (next: Film) => void;
  onClose: () => void;
}

export function PersonalizedEndCredits({
  film,
  nextFilm,
  defaultViewerName,
  lang,
  onReplay,
  onPlayNext,
  onClose,
}: PersonalizedEndCreditsProps) {
  const [viewerName, setViewerName] = useState(() =>
    getSavedViewerCreditName(
      defaultViewerName || (lang === 'ar' ? 'ضيف العرض الخاص' : 'Premiere Guest')
    )
  );
  const [editingName, setEditingName] = useState(false);
  const seatNumber = getViewerSeatNumber(film.id);

  const handleSaveName = (val: string) => {
    setViewerName(val);
    saveViewerCreditName(val);
  };

  const handleDownloadCreditCard = () => {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(540, 520, 60, 540, 520, 700);
    glow.addColorStop(0, 'rgba(212, 175, 55, 0.16)');
    glow.addColorStop(1, 'rgba(5, 5, 5, 1)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Borders
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(56, 56, W - 112, H - 112);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(76, 76, W - 152, H - 152);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 36px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('A Z   F I L M S   ·   O F F I C I A L   C R E D I T S', W / 2, 170);

    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 60px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(film.titleAr || film.titleEn, W / 2, 310);

    if (film.titleEn && film.titleEn !== film.titleAr) {
      ctx.fillStyle = '#D4AF37';
      ctx.font = '600 34px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(film.titleEn.toUpperCase(), W / 2, 368);
    }

    // Divider
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.beginPath();
    ctx.moveTo(280, 440);
    ctx.lineTo(W - 280, 440);
    ctx.stroke();

    if (film.director) {
      ctx.fillStyle = 'rgba(245, 245, 240, 0.5)';
      ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('DIRECTED BY', W / 2, 515);
      ctx.fillStyle = '#F5F5F0';
      ctx.font = '600 34px "Cairo", "Plus Jakarta Sans", sans-serif';
      ctx.fillText(film.director, W / 2, 562);
    }

    // Special Viewer Credit Box
    ctx.fillStyle = 'rgba(212, 175, 55, 0.08)';
    ctx.fillRect(130, 660, W - 260, 320);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(130, 660, W - 260, 320);

    ctx.fillStyle = '#D4AF37';
    ctx.font = '600 24px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      lang === 'ar'
        ? 'شكر خاص لحضور العرض الكامل'
        : 'SPECIAL PREMIERE SCREENING CREDIT',
      W / 2,
      735
    );

    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 54px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(viewerName.trim() || 'AZ GUEST', W / 2, 830);

    ctx.fillStyle = '#E6C65B';
    ctx.font = '600 30px "JetBrains Mono", monospace';
    ctx.fillText(`SEAT ${seatNumber}  ·  ${film.year}`, W / 2, 915);

    ctx.fillStyle = 'rgba(245, 245, 240, 0.45)';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText('A PRIVATE WORLD OF CINEMA', W / 2, 1185);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `az-films-${film.id}-credits-${seatNumber.replace('#', '')}.png`;
    a.click();
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#050505]/95 px-4 py-8 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative my-auto w-full max-w-xl rounded-2xl border border-[#D4AF37]/35 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),rgba(11,11,14,0.98)_70%)] p-6 sm:p-9 text-center shadow-2xl space-y-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute end-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#F5F5F0]/60 hover:text-[#D4AF37] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-1.5">
          <p className="font-cinema-display text-xs tracking-[0.26em] text-[#D4AF37]">
            AZ FILMS · END CREDITS
          </p>
          <h3 className="text-2xl font-bold text-[#F5F5F0] sm:text-3xl">
            {lang === 'ar' ? film.titleAr : film.titleEn}
          </h3>
          {film.director && (
            <p className="text-xs text-[#F5F5F0]/60">
              {lang === 'ar' ? 'إخراج:' : 'Directed by'}{' '}
              <span className="text-[#F5F5F0]/90 font-medium">{film.director}</span>
            </p>
          )}
        </div>

        {/* Personalized Viewer Attendance Credit */}
        <div className="rounded-xl border border-[#D4AF37]/40 bg-[#050505]/80 p-5 sm:p-6 space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#D4AF37]">
            <Award className="h-4 w-4" />
            <span>
              {lang === 'ar'
                ? 'شكر خاص لحضور العرض الكامل'
                : 'SPECIAL PREMIERE SCREENING CREDIT'}
            </span>
          </div>

          {editingName ? (
            <div className="mx-auto flex max-w-xs items-center gap-2">
              <input
                type="text"
                maxLength={40}
                autoFocus
                value={viewerName}
                onChange={(e) => handleSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingName(false);
                }}
                placeholder={lang === 'ar' ? 'اكتب اسمك هنا...' : 'Enter your name...'}
                className="h-10 flex-1 rounded-lg border border-[#D4AF37]/60 bg-[#0B0B0E] px-3 text-center text-sm font-bold text-[#F5F5F0] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="h-10 rounded-lg bg-[#D4AF37] px-3 text-xs font-semibold text-[#050505] cursor-pointer"
              >
                {lang === 'ar' ? 'حفظ' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl font-bold text-[#F5F5F0] sm:text-2xl">
                  {viewerName.trim() || (lang === 'ar' ? 'ضيف العرض الخاص' : 'Premiere Guest')}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  title={lang === 'ar' ? 'اكتب اسمك في التترات' : 'Put your name in credits'}
                  className="rounded-md border border-white/10 p-1.5 text-[#D4AF37] hover:border-[#D4AF37]/50 cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-[11px] text-[#D4AF37]/80 hover:underline cursor-pointer"
              >
                {lang === 'ar'
                  ? 'اضغط لتخصيص اسمك داخل التترات'
                  : 'Tap to customize your name in credits'}
              </button>
            </div>
          )}

          <div className="pt-1 font-cinema-mono text-xs tracking-[0.2em] text-[#D4AF37]/90">
            {lang === 'ar' ? `مقعد العرض الخاص ${seatNumber}` : `PREMIERE SEAT ${seatNumber}`}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleDownloadCreditCard}
            className="flex h-11 items-center gap-2 rounded-lg bg-[#D4AF37] px-5 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>{lang === 'ar' ? 'حفظ شهادة التترات (PNG)' : 'Save Credit Card'}</span>
          </button>

          {nextFilm && onPlayNext && (
            <button
              type="button"
              onClick={() => onPlayNext(nextFilm)}
              className="flex h-11 items-center gap-2 rounded-lg border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-4 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/20 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>
                {lang === 'ar'
                  ? `التالي: ${nextFilm.titleAr}`
                  : `Up Next: ${nextFilm.titleEn}`}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onReplay}
            className="flex h-11 items-center gap-2 rounded-lg border border-white/15 px-4 text-xs font-medium text-[#F5F5F0]/85 hover:border-white/30 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{lang === 'ar' ? 'إعادة الفيلم' : 'Replay'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-white/10 px-4 text-xs text-[#F5F5F0]/60 hover:text-[#F5F5F0] cursor-pointer"
          >
            {lang === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#F5F5F0]/40">
          <Sparkles className="h-3 w-3 text-[#D4AF37]/60" />
          <span>{lang === 'ar' ? 'شكراً لمشاهدتك على AZ FILMS' : 'Thank you for watching on AZ FILMS'}</span>
        </div>
      </div>
    </div>
  );
}
