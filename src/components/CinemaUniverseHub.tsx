import { useState, type FormEvent } from 'react';
import { Armchair, Award, Calendar, Play, Radio, Ticket, Users } from 'lucide-react';
import { GENRE_LABELS, STATUS_LABELS } from '../lib/i18n';
import { getSavedViewerCreditName } from '../services/cinemaPulseService';
import {
  createWatchPartyRoom,
  fetchWatchPartyRoom,
  getCinemaPassportData,
  recordWatchPartyJoined,
} from '../services/cinemaUniverseService';
import type { AppLanguage, Film } from '../types/cinema';

interface CinemaUniverseHubProps {
  films: Film[];
  lang: AppLanguage;
  defaultViewerName?: string;
  onStartWatchParty: (film: Film, partyId: string, isHost: boolean) => void;
  onSelectFilm: (film: Film) => void;
  onOpenPassport: () => void;
  onOpenSeatBooking?: (film: Film) => void;
}

export function CinemaUniverseHub({
  films,
  lang,
  defaultViewerName,
  onStartWatchParty,
  onSelectFilm,
  onOpenPassport,
  onOpenSeatBooking,
}: CinemaUniverseHubProps) {
  const playableFilms = films.filter(
    (f) => f.isVisible && f.status === 'released' && Boolean(f.videoUrl && f.videoUrl.trim())
  );
  const [selectedPartyFilmId, setSelectedPartyFilmId] = useState<string>(
    () => playableFilms[0]?.id || ''
  );
  const [joinCode, setJoinCode] = useState('');
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);

  const passport = getCinemaPassportData();
  const timelineFilms = [...films]
    .filter((f) => f.isVisible)
    .sort((a, b) => b.year - a.year || a.sortOrder - b.sortOrder)
    .slice(0, 6);

  const effectiveFilmId =
    playableFilms.some((f) => f.id === selectedPartyFilmId)
      ? selectedPartyFilmId
      : playableFilms[0]?.id || '';

  const handleHostParty = async () => {
    const film = playableFilms.find((f) => f.id === effectiveFilmId);
    if (!film || partyBusy) return;
    setPartyError(null);
    setPartyBusy(true);
    try {
      const hostName = getSavedViewerCreditName(defaultViewerName) || (lang === 'ar' ? 'المضيف' : 'Host');
      const room = await createWatchPartyRoom(film.id, hostName, 0);
      onStartWatchParty(film, room.partyId, true);
    } catch {
      setPartyError(
        lang === 'ar' ? 'تعذر إنشاء غرفة العرض المشترك.' : 'Unable to create watch party room.'
      );
    } finally {
      setPartyBusy(false);
    }
  };

  const handleJoinParty = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || partyBusy) return;
    setPartyError(null);
    setPartyBusy(true);
    try {
      const room = await fetchWatchPartyRoom(joinCode);
      if (!room || !room.isActive) {
        setPartyError(
          lang === 'ar'
            ? 'رمز الغرفة غير موجود أو انتهى العرض.'
            : 'Room code not found or screening has ended.'
        );
        return;
      }
      const film = films.find((f) => f.id === room.filmId);
      if (!film) {
        setPartyError(lang === 'ar' ? 'الفيلم غير متاح حالياً.' : 'Film unavailable.');
        return;
      }
      recordWatchPartyJoined();
      setJoinCode('');
      onStartWatchParty(film, room.partyId, false);
    } finally {
      setPartyBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8 space-y-12 border-t border-white/[0.08]">
      {/* Top 2-Column Ecosystem: Live Watch Party & Collector Cinema Passport */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Live Synchronized Watch Party Launcher */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0B0B0E] p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs tracking-[0.16em] text-[#D4AF37]">
              <Radio className="h-4 w-4" />
              <span>{lang === 'ar' ? 'العرض الجماعي المتزامن' : 'SYNCHRONIZED WATCH PARTY'}</span>
            </div>
            <h2 className="text-2xl font-bold text-[#F5F5F0]">
              {lang === 'ar'
                ? 'شاهد مع أصدقائك في قاعة عرض متزامنة'
                : 'Private Synchronized Screening Room'}
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-[#F5F5F0]/70">
              {lang === 'ar'
                ? 'أنشئ غرفة عرض خاصة بمزامنة لحظية للتشغيل والتوقيت والدردشة الصوتية النصية، أو انضم برمز دعوة من صديق.'
                : 'Host a synced screening hall with real-time playback lock and lounge notes, or join with an invitation code.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Host New Room */}
            <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-[#050505] p-4">
              <label className="block text-xs font-medium text-[#F5F5F0]/65">
                {lang === 'ar' ? 'اختر فيلماً لبث القاعة' : 'Select Film to Host'}
              </label>
              <select
                value={effectiveFilmId}
                onChange={(e) => setSelectedPartyFilmId(e.target.value)}
                disabled={playableFilms.length === 0}
                className="h-10 w-full rounded-lg border border-white/15 bg-[#0B0B0E] px-3 text-xs text-[#F5F5F0] focus:border-[#D4AF37] focus:outline-none"
              >
                {playableFilms.length === 0 ? (
                  <option value="">
                    {lang === 'ar' ? 'لا توجد أفلام جاهزة للبث' : 'No playable films yet'}
                  </option>
                ) : (
                  playableFilms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {lang === 'ar' ? f.titleAr : f.titleEn} ({f.year})
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                disabled={!effectiveFilmId || partyBusy}
                onClick={handleHostParty}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-xs font-semibold text-[#050505] transition-colors hover:bg-[#E6C65B] disabled:opacity-40 cursor-pointer"
              >
                <Users className="h-4 w-4" />
                <span>{lang === 'ar' ? 'إنشاء غرفة عرض الآن' : 'Host Watch Party'}</span>
              </button>
            </div>

            {/* Join Existing Room */}
            <form
              onSubmit={handleJoinParty}
              className="space-y-2.5 rounded-xl border border-white/[0.08] bg-[#050505] p-4"
            >
              <label className="block text-xs font-medium text-[#F5F5F0]/65">
                {lang === 'ar' ? 'لديك رمز دعوة؟' : 'Have an Invite Code?'}
              </label>
              <input
                type="text"
                maxLength={16}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder={lang === 'ar' ? 'أدخل الرمز (مثال: AZ74K2)' : 'Enter code (e.g. AZ74K2)'}
                className="h-10 w-full rounded-lg border border-white/15 bg-[#0B0B0E] px-3 font-cinema-mono text-xs text-[#F5F5F0] placeholder:text-[#F5F5F0]/35 focus:border-[#D4AF37] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!joinCode.trim() || partyBusy}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-[#D4AF37]/10 text-xs font-semibold text-[#D4AF37] transition-colors hover:bg-[#D4AF37] hover:text-[#050505] disabled:opacity-40 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{lang === 'ar' ? 'انضمام للعرض' : 'Join Screening'}</span>
              </button>
            </form>
          </div>

          {onOpenSeatBooking && playableFilms.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/30 bg-[#120F07] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Armchair className="h-4 w-4 text-[#D4AF37] shrink-0" />
                <span className="text-xs text-[#F5F5F0]/85">
                  {lang === 'ar'
                    ? 'اختر مقعدك الفعلي في قاعة AZ Grand Hall مع تذكرة ذهبية ومنظور 3D حقيقي'
                    : 'Reserve an actual seat in AZ Grand Hall with a gold ticket & 3D stage perspective'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const targetFilm =
                    playableFilms.find((f) => f.id === effectiveFilmId) || playableFilms[0];
                  if (targetFilm) onOpenSeatBooking(targetFilm);
                }}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Ticket className="h-3.5 w-3.5" />
                <span>{lang === 'ar' ? 'حجز مقاعد القاعة' : 'Book Seats'}</span>
              </button>
            </div>
          )}

          {partyError && <p className="text-xs text-red-400">{partyError}</p>}
        </div>

        {/* Personal Cinema Passport Entry Card */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-[#D4AF37]/30 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.12),#0B0B0E_68%)] p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs tracking-[0.16em] text-[#D4AF37]">
              <Ticket className="h-4 w-4" />
              <span>AZ COLLECTOR PASSPORT</span>
            </div>
            <h2 className="text-2xl font-bold text-[#F5F5F0]">
              {lang === 'ar' ? 'جواز السفر السينمائي الخاص بك' : 'Your Personal Cinema Passport'}
            </h2>
            <p className="text-sm leading-relaxed text-[#F5F5F0]/70">
              {lang === 'ar'
                ? 'اجمع الأختام الرسمية عند إتمام كل فيلم، وثّق كادراتك السينمائية، وحمّل بطاقة عضويتك بدقة عالية.'
                : 'Earn official stamps for completed films, build your frame archive, and export your collector pass as a PNG card.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-[#050505]/90 p-3.5">
              <p className="font-cinema-mono text-2xl font-bold text-[#D4AF37]">
                {passport.stamps.length}
              </p>
              <p className="text-xs text-[#F5F5F0]/60">
                {lang === 'ar' ? 'أفلام مختومة' : 'Stamped Films'}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#050505]/90 p-3.5">
              <p className="font-cinema-mono text-2xl font-bold text-[#F5F5F0]">
                {passport.framesCaptured}
              </p>
              <p className="text-xs text-[#F5F5F0]/60">
                {lang === 'ar' ? 'كادرات موثقة' : 'Archived Frames'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenPassport}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-xs font-semibold text-[#050505] transition-colors hover:bg-[#E6C65B] cursor-pointer"
          >
            <Award className="h-4 w-4" />
            <span>{lang === 'ar' ? 'عرض وتصدير جواز السينما' : 'Open Cinema Passport'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Studio Anthology Timeline */}
      {timelineFilms.length > 0 && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs tracking-[0.14em] text-[#D4AF37]">
                <Calendar className="h-4 w-4" />
                <span>{lang === 'ar' ? 'أرشيف الاستوديو الزمني' : 'STUDIO ANTHOLOGY'}</span>
              </div>
              <h2 className="text-xl font-bold text-[#F5F5F0] sm:text-2xl">
                {lang === 'ar' ? 'السجل الزمني لأعمال AZ FILMS' : 'AZ FILMS Production Chronicle'}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {timelineFilms.map((film) => {
              const title = lang === 'ar' ? film.titleAr : film.titleEn;
              const altTitle = lang === 'ar' ? film.titleEn : film.titleAr;
              const genreLabel = GENRE_LABELS[film.genre]?.[lang] || film.genre;
              const statusLabel = STATUS_LABELS[film.status]?.[lang] || film.status;
              return (
                <button
                  key={film.id}
                  type="button"
                  onClick={() => onSelectFilm(film)}
                  className="group flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-5 text-start transition-colors hover:border-[#D4AF37]/50 cursor-pointer"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-cinema-mono font-bold text-[#D4AF37] tabular-nums">
                        {film.year}
                      </span>
                      <span className="text-[#F5F5F0]/55">
                        {genreLabel} · {statusLabel}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#F5F5F0] group-hover:text-[#D4AF37] transition-colors">
                        {title}
                      </h3>
                      {altTitle && altTitle !== title && (
                        <p className="font-cinema-display text-xs tracking-[0.14em] text-[#D4AF37]/75">
                          {altTitle}
                        </p>
                      )}
                    </div>
                    {(film.synopsisAr || film.synopsisEn) && (
                      <p className="text-xs leading-relaxed text-[#F5F5F0]/65 line-clamp-2">
                        {lang === 'ar'
                          ? film.synopsisAr || film.synopsisEn
                          : film.synopsisEn || film.synopsisAr}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-[#F5F5F0]/50">
                    <span className="truncate">
                      {film.director
                        ? `${lang === 'ar' ? 'إخراج:' : 'Dir:'} ${film.director}`
                        : film.isOriginal
                          ? 'AZ ORIGINALS'
                          : 'AZ FILMS'}
                    </span>
                    <span className="text-[#D4AF37] shrink-0">
                      {lang === 'ar' ? 'استكشاف العمل ←' : 'Explore →'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
