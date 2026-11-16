import { useState } from 'react';
import { Award, Check, Download, Film as FilmIcon, Sparkles, X } from 'lucide-react';
import {
  getSavedViewerCreditName,
  getViewerSeatNumber,
  saveViewerCreditName,
} from '../services/cinemaPulseService';
import { getCinemaPassportData } from '../services/cinemaUniverseService';
import type { AppLanguage, Film } from '../types/cinema';

interface CinemaPassportModalProps {
  films: Film[];
  defaultName?: string;
  lang: AppLanguage;
  onClose: () => void;
  onSelectFilm?: (film: Film) => void;
}

export function CinemaPassportModal({
  films,
  defaultName,
  lang,
  onClose,
  onSelectFilm,
}: CinemaPassportModalProps) {
  const [memberName, setMemberName] = useState(
    () => getSavedViewerCreditName(defaultName) || (lang === 'ar' ? 'ضيف السينما' : 'Cinema Guest')
  );
  const [savedNotice, setSavedNotice] = useState(false);

  const passport = getCinemaPassportData();
  const seatCode = getViewerSeatNumber('az_passport');
  const totalReleased = films.filter((f) => f.isVisible && f.status === 'released').length;

  const milestones = [
    {
      id: 'first_watch',
      unlocked: passport.stamps.length >= 1,
      title: lang === 'ar' ? 'ختم العرض الأول' : 'First Screening Stamp',
    },
    {
      id: 'archivist',
      unlocked: passport.framesCaptured >= 1,
      title: lang === 'ar' ? 'أرشيفي الكادرات' : 'Frame Archivist',
    },
    {
      id: 'party_guest',
      unlocked: passport.partiesJoined >= 1,
      title: lang === 'ar' ? 'عضو العرض المشترك' : 'Watch Party Member',
    },
    {
      id: 'patron',
      unlocked: totalReleased > 0 && passport.stamps.length >= Math.min(3, totalReleased),
      title: lang === 'ar' ? 'راعي السينما الخاصة' : 'Private Cinema Patron',
    },
  ];

  const handleSaveName = () => {
    saveViewerCreditName(memberName);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleDownloadPassportPng = () => {
    saveViewerCreditName(memberName);
    const w = 1080;
    const h = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Deep velvet obsidian cover
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);

    // Subtle luxury radial gold glow
    const grad = ctx.createRadialGradient(w / 2, 220, 40, w / 2, 320, 650);
    grad.addColorStop(0, 'rgba(212, 175, 55, 0.14)');
    grad.addColorStop(1, 'rgba(5, 5, 5, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Double gold passport border
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, w - 96, h - 96);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(66, 66, w - 132, h - 132);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 32px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('A Z   F I L M S   ·   C I N E M A   P A S S P O R T', w / 2, 145);

    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 62px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(memberName.trim() || 'AZ Cinema Member', w / 2, 260);

    ctx.fillStyle = 'rgba(212, 175, 55, 0.85)';
    ctx.font = '600 28px "JetBrains Mono", monospace';
    ctx.fillText(`MEMBER PASS ${seatCode}`, w / 2, 318);

    // Divider
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.beginPath();
    ctx.moveTo(140, 380);
    ctx.lineTo(w - 140, 380);
    ctx.stroke();

    // Stats Row
    ctx.fillStyle = 'rgba(245, 245, 240, 0.6)';
    ctx.font = '500 24px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      `STAMPED FILMS: ${passport.stamps.length}    ·    FRAMES ARCHIVED: ${passport.framesCaptured}    ·    SCREENINGS: ${passport.partiesJoined}`,
      w / 2,
      440
    );

    // Stamped Films Grid
    ctx.textAlign = 'left';
    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 26px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('OFFICIAL SCREENING STAMPS', 120, 535);

    const stampsToShow = passport.stamps.slice(0, 6);
    if (stampsToShow.length === 0) {
      ctx.fillStyle = 'rgba(245, 245, 240, 0.45)';
      ctx.font = '500 28px "Cairo", "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Complete a full film screening to earn your first official stamp.', 120, 610);
    } else {
      stampsToShow.forEach((stamp, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const boxX = 120 + col * 430;
        const boxY = 580 + row * 175;
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, 400, 145);

        ctx.fillStyle = '#D4AF37';
        ctx.font = '600 20px "JetBrains Mono", monospace';
        ctx.fillText(`STAMPED · ${stamp.stampedAt}`, boxX + 24, boxY + 42);

        ctx.fillStyle = '#F5F5F0';
        ctx.font = '700 30px "Cairo", "Plus Jakarta Sans", sans-serif';
        ctx.fillText((stamp.titleAr || stamp.titleEn).slice(0, 22), boxX + 24, boxY + 88);

        ctx.fillStyle = 'rgba(245, 245, 240, 0.55)';
        ctx.font = '500 20px "Cormorant Garamond", Georgia, serif';
        ctx.fillText(`${stamp.titleEn.toUpperCase()} (${stamp.year})`, boxX + 24, boxY + 122);
      });
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245, 245, 240, 0.45)';
    ctx.font = '500 22px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('A PRIVATE WORLD OF CINEMA  ·  AZ FILMS', w / 2, h - 105);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `az-films-passport-${seatCode.replace('#', '')}.png`;
    a.click();
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#D4AF37]/40 bg-[#0B0B0E] p-6 sm:p-8 shadow-2xl space-y-6"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs tracking-[0.18em] text-[#D4AF37]">
              <Sparkles className="h-4 w-4" />
              <span>AZ FILMS CINEMA PASSPORT</span>
            </div>
            <h2 className="text-2xl font-bold text-[#F5F5F0]">
              {lang === 'ar' ? 'جواز السفر السينمائي' : 'Personal Cinema Passport'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-[#F5F5F0]/75 hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Member Identity Editor */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 rounded-xl border border-white/10 bg-[#050505] p-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-[#F5F5F0]/55">
              {lang === 'ar' ? 'اسم حامل الجواز' : 'Passport Holder Name'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={60}
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                onBlur={handleSaveName}
                className="h-10 flex-1 rounded-lg border border-white/15 bg-[#0B0B0E] px-3 text-sm text-[#F5F5F0] focus:border-[#D4AF37] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/20 cursor-pointer"
              >
                {savedNotice ? <Check className="h-3.5 w-3.5" /> : null}
                <span>{lang === 'ar' ? 'حفظ' : 'Save'}</span>
              </button>
            </div>
          </div>
          <div className="text-start sm:text-end">
            <p className="text-[11px] text-[#F5F5F0]/45">
              {lang === 'ar' ? 'رقم العضوية' : 'PASS CODE'}
            </p>
            <p className="font-cinema-mono text-lg font-bold text-[#D4AF37]">{seatCode}</p>
          </div>
        </div>

        {/* Real Verified Counters */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-4 text-center">
            <p className="font-cinema-mono text-2xl font-bold text-[#D4AF37]">
              {passport.stamps.length}
            </p>
            <p className="mt-1 text-xs text-[#F5F5F0]/60">
              {lang === 'ar' ? 'أفلام مختومة' : 'Stamped Films'}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-4 text-center">
            <p className="font-cinema-mono text-2xl font-bold text-[#F5F5F0]">
              {passport.framesCaptured}
            </p>
            <p className="mt-1 text-xs text-[#F5F5F0]/60">
              {lang === 'ar' ? 'كادرات محفوظة' : 'Frames Archived'}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-4 text-center">
            <p className="font-cinema-mono text-2xl font-bold text-[#F5F5F0]">
              {passport.partiesJoined}
            </p>
            <p className="mt-1 text-xs text-[#F5F5F0]/60">
              {lang === 'ar' ? 'عروض جماعية' : 'Watch Parties'}
            </p>
          </div>
        </div>

        {/* Collector Milestones */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#D4AF37]">
            {lang === 'ar' ? 'أوسمة الجمهور' : 'Collector Milestones'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {milestones.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-xs ${
                  m.unlocked
                    ? 'border-[#D4AF37]/45 bg-[#D4AF37]/10 text-[#F5F5F0]'
                    : 'border-white/[0.06] bg-[#050505] text-[#F5F5F0]/40'
                }`}
              >
                <Award
                  className={`h-4 w-4 shrink-0 ${
                    m.unlocked ? 'text-[#D4AF37]' : 'text-[#F5F5F0]/25'
                  }`}
                />
                <span className="font-medium">{m.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Film Stamps Archive */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#D4AF37]">
            {lang === 'ar' ? 'الأختام الرسمية للأفلام' : 'Official Screening Stamps'}
          </h3>
          {passport.stamps.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-6 text-center text-xs leading-relaxed text-[#F5F5F0]/55">
              {lang === 'ar'
                ? 'أكمل مشاهدة أي فيلم حتى نهايته ليُختم تلقائياً في جوازك السينمائي.'
                : 'Complete watching any film to receive its official stamp in your Cinema Passport.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {passport.stamps.map((stamp) => {
                const matched = films.find((f) => f.id === stamp.filmId);
                return (
                  <button
                    key={stamp.filmId}
                    type="button"
                    onClick={() => {
                      if (matched && onSelectFilm) {
                        onClose();
                        onSelectFilm(matched);
                      }
                    }}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/30 bg-[#050505] p-3.5 text-start transition-colors hover:border-[#D4AF37] cursor-pointer"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-cinema-mono text-[10px] text-[#D4AF37]">
                        {stamp.stampedAt}
                      </p>
                      <p className="truncate text-sm font-bold text-[#F5F5F0]">
                        {lang === 'ar' ? stamp.titleAr : stamp.titleEn}
                      </p>
                      <p className="text-[11px] text-[#F5F5F0]/50 tabular-nums">{stamp.year}</p>
                    </div>
                    <FilmIcon className="h-5 w-5 shrink-0 text-[#D4AF37]/70" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Download Passport Card */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-white/15 px-4 text-xs font-medium text-[#F5F5F0]/75 hover:border-white/30 cursor-pointer"
          >
            {lang === 'ar' ? 'إغلاق' : 'Close'}
          </button>
          <button
            type="button"
            onClick={handleDownloadPassportPng}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#D4AF37] px-5 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>
              {lang === 'ar' ? 'تحميل جواز السينما (PNG)' : 'Download Passport (PNG)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
