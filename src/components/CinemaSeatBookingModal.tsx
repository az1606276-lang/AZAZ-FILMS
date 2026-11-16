import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Armchair, Check, Download, Film as FilmIcon, Play, Sparkles, Ticket, X } from 'lucide-react';
import {
  AUDITORIUM_COLS,
  AUDITORIUM_ROWS,
  bookAuditoriumSeat,
  getSavedBookedSeat,
  getSeatPerspective,
  getSeatTier,
  subscribeFilmSeatBookings,
  type SeatBooking,
} from '../services/cinemaHallService';
import { getOrCreateVisitorId } from '../services/analyticsService';
import { getSavedViewerCreditName, saveViewerCreditName } from '../services/cinemaPulseService';
import type { AppLanguage, Film } from '../types/cinema';

interface CinemaSeatBookingModalProps {
  films: Film[];
  initialFilm: Film;
  lang: AppLanguage;
  defaultViewerName?: string;
  onClose: () => void;
  onEnterHall: (film: Film, seatCode: string) => void;
}

export function CinemaSeatBookingModal({
  films,
  initialFilm,
  lang,
  defaultViewerName,
  onClose,
  onEnterHall,
}: CinemaSeatBookingModalProps) {
  const playableFilms = useMemo(
    () =>
      films.filter(
        (f) => f.isVisible && f.status === 'released' && Boolean(f.videoUrl && f.videoUrl.trim())
      ),
    [films]
  );

  const [selectedFilmId, setSelectedFilmId] = useState(initialFilm.id);
  const activeFilm =
    playableFilms.find((f) => f.id === selectedFilmId) ||
    films.find((f) => f.id === selectedFilmId) ||
    initialFilm;

  const myVisitorId = getOrCreateVisitorId();
  const [bookings, setBookings] = useState<SeatBooking[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<string>(
    () => getSavedBookedSeat(activeFilm.id) || 'C5'
  );
  const [guestName, setGuestName] = useState(
    () => getSavedViewerCreditName(defaultViewerName) || ''
  );
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedTicket, setConfirmedTicket] = useState<SeatBooking | null>(null);

  useEffect(() => {
    setConfirmedTicket(null);
    setBookingError(null);
    const localSeat = getSavedBookedSeat(activeFilm.id);
    if (localSeat) {
      setSelectedSeat(localSeat);
    }
    const unsub = subscribeFilmSeatBookings(activeFilm.id, (list) => {
      setBookings(list);
      const mine = list.find((b) => b.visitorId === myVisitorId);
      if (mine) {
        setConfirmedTicket(mine);
        setSelectedSeat(mine.seatCode);
      }
    });
    return () => unsub();
  }, [activeFilm.id, myVisitorId]);

  const occupiedMap = useMemo(() => {
    const map = new Map<string, SeatBooking>();
    for (const b of bookings) {
      map.set(b.seatCode, b);
    }
    return map;
  }, [bookings]);

  const selectedOccupied = occupiedMap.get(selectedSeat);
  const isMySeat = selectedOccupied?.visitorId === myVisitorId;
  const seatPersp = getSeatPerspective(selectedSeat);

  const tierLabel = (tier: 'front' | 'sweet_spot' | 'vip') => {
    if (tier === 'vip') return lang === 'ar' ? 'شرفة كبار الشخصيات VIP' : 'Royal VIP Lounge';
    if (tier === 'sweet_spot') return lang === 'ar' ? 'المركز الذهبي IMAX' : 'IMAX Sweet Spot';
    return lang === 'ar' ? 'الصفوف الأمامية الغامرة' : 'Immersive Front Row';
  };

  const handleConfirmBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (bookingBusy) return;
    if (selectedOccupied && !isMySeat) {
      setBookingError(
        lang === 'ar'
          ? 'هذا المقعد محجوز بالفعل، اختر مقعداً متاحاً.'
          : 'This seat is already reserved. Please pick an open seat.'
      );
      return;
    }
    if (isMySeat && selectedOccupied) {
      setConfirmedTicket(selectedOccupied);
      return;
    }

    const cleanName = guestName.trim() || (lang === 'ar' ? 'ضيف العرض' : 'Cinema Guest');
    saveViewerCreditName(cleanName);
    setBookingBusy(true);
    setBookingError(null);
    try {
      const created = await bookAuditoriumSeat(activeFilm.id, selectedSeat, cleanName);
      setConfirmedTicket(created);
    } catch {
      setBookingError(
        lang === 'ar'
          ? 'تعذر تأكيد الحجز حالياً أو سبقك مشاهد آخر إلى هذا المقعد.'
          : 'Could not reserve this seat; another viewer may have just booked it.'
      );
    } finally {
      setBookingBusy(false);
    }
  };

  const handleDownloadTicketPng = () => {
    const ticket = confirmedTicket;
    if (!ticket) return;
    const W = 1080;
    const H = 1600;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    // Outer luxury gold ticket border
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, W - 96, H - 96);

    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 32px "Cormorant Garamond", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('A Z   F I L M S   ·   G R A N D   H A L L', W / 2, 148);

    ctx.fillStyle = 'rgba(245, 245, 240, 0.55)';
    ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('OFFICIAL RESERVED ADMISSION TICKET', W / 2, 198);

    // Film Title
    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 58px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(activeFilm.titleAr || activeFilm.titleEn, W / 2, 340);

    if (activeFilm.titleEn && activeFilm.titleEn !== activeFilm.titleAr) {
      ctx.fillStyle = '#D4AF37';
      ctx.font = '600 28px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(activeFilm.titleEn.toUpperCase(), W / 2, 400);
    }

    // Center Giant Seat Badge
    ctx.fillStyle = '#0B0B0E';
    ctx.fillRect(140, 490, W - 280, 420);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(140, 490, W - 280, 420);

    ctx.fillStyle = 'rgba(245,245,240,0.5)';
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('RESERVED SEAT', W / 2, 570);

    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 176px "JetBrains Mono", monospace';
    ctx.fillText(ticket.seatCode, W / 2, 760);

    ctx.fillStyle = '#F5F5F0';
    ctx.font = '600 28px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(tierLabel(ticket.tier), W / 2, 855);

    // Holder Info
    ctx.fillStyle = 'rgba(245,245,240,0.5)';
    ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('GUEST', W / 2, 1020);
    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 44px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(ticket.viewerName, W / 2, 1085);

    // Perforation Dots
    ctx.fillStyle = '#050505';
    for (let x = 90; x < W - 90; x += 36) {
      ctx.beginPath();
      ctx.arc(x, 1210, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(212,175,55,0.4)';
      ctx.fill();
    }

    // Ticket Code Barcode Motif
    ctx.fillStyle = '#D4AF37';
    for (let i = 0; i < 42; i++) {
      const bw = i % 3 === 0 ? 12 : i % 2 === 0 ? 6 : 4;
      ctx.fillRect(210 + i * 16, 1280, bw, 96);
    }

    ctx.fillStyle = 'rgba(245,245,240,0.55)';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText(`BOOKING ID · ${ticket.bookingId.slice(0, 26).toUpperCase()}`, W / 2, 1438);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `az-films-ticket-${activeFilm.id}-${ticket.seatCode}.png`;
    a.click();
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/92 p-4 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative my-auto w-full max-w-5xl rounded-2xl border border-[#D4AF37]/35 bg-[#0B0B0E] p-5 sm:p-8 shadow-2xl space-y-6"
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium tracking-[0.2em] text-[#D4AF37]">
              AZ GRAND AUDITORIUM · IMAX 70MM
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F0]">
              {lang === 'ar'
                ? 'حجز مقاعد القاعة الملكية'
                : 'Grand Auditorium Seat Reservation'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {playableFilms.length > 1 && (
              <select
                value={activeFilm.id}
                onChange={(e) => setSelectedFilmId(e.target.value)}
                className="h-10 rounded-lg border border-white/15 bg-[#050505] px-3 text-xs text-[#F5F5F0] focus:border-[#D4AF37] focus:outline-none"
              >
                {playableFilms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {lang === 'ar' ? f.titleAr : f.titleEn}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-[#F5F5F0]/75 hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* Auditorium Map */}
          <div className="lg:col-span-7 space-y-5 rounded-xl border border-white/[0.08] bg-[#050505] p-5">
            {/* Curved Cinema Screen */}
            <div className="space-y-2 text-center">
              <div className="mx-auto h-3 w-4/5 rounded-t-full border-t-4 border-[#D4AF37] bg-gradient-to-b from-[#D4AF37]/25 to-transparent shadow-[0_-12px_36px_rgba(212,175,55,0.28)]" />
              <p className="text-[10px] font-cinema-mono tracking-[0.22em] text-[#D4AF37]/80">
                {lang === 'ar'
                  ? `شاشة العرض — ${activeFilm.titleAr}`
                  : `PROJECTION SCREEN — ${activeFilm.titleEn.toUpperCase()}`}
              </p>
            </div>

            {/* 5 Rows x 10 Seats Grid with Center Aisle */}
            <div className="space-y-2.5 overflow-x-auto py-2">
              {AUDITORIUM_ROWS.map((row) => (
                <div key={row} className="flex items-center justify-center gap-2 min-w-[440px]">
                  <span className="w-5 text-center font-cinema-mono text-xs font-bold text-[#D4AF37]/75">
                    {row}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {AUDITORIUM_COLS.map((col) => {
                      const code = `${row}${col}`;
                      const occ = occupiedMap.get(code);
                      const isMine = occ?.visitorId === myVisitorId;
                      const isTaken = Boolean(occ && !isMine);
                      const isSelected = selectedSeat === code;
                      const tier = getSeatTier(code);

                      return (
                        <div key={code} className="flex items-center">
                          {col === 6 && <div className="w-5" aria-hidden="true" />}
                          <button
                            type="button"
                            disabled={isTaken}
                            onClick={() => {
                              setSelectedSeat(code);
                              setBookingError(null);
                            }}
                            title={
                              isTaken
                                ? `${code} · ${occ?.viewerName || (lang === 'ar' ? 'محجوز' : 'Reserved')}`
                                : `${code} · ${tierLabel(tier)}`
                            }
                            aria-label={`${code} ${isTaken ? 'Reserved' : 'Available'}`}
                            className={`group relative flex h-9 w-8 flex-col items-center justify-center rounded-t-lg rounded-b border text-[10px] font-cinema-mono transition-all ${
                              isSelected || isMine
                                ? 'border-[#D4AF37] bg-[#D4AF37] font-bold text-[#050505] shadow-[0_0_16px_rgba(212,175,55,0.45)] cursor-pointer'
                                : isTaken
                                  ? 'border-rose-900/40 bg-rose-950/35 text-rose-300/35 cursor-not-allowed'
                                  : tier === 'vip'
                                    ? 'border-[#D4AF37]/40 bg-[#181409] text-[#D4AF37]/90 hover:border-[#D4AF37] cursor-pointer'
                                    : tier === 'sweet_spot'
                                      ? 'border-white/25 bg-[#121218] text-[#F5F5F0]/85 hover:border-[#D4AF37] cursor-pointer'
                                      : 'border-white/15 bg-[#0B0B0E] text-[#F5F5F0]/60 hover:border-[#D4AF37] cursor-pointer'
                            }`}
                          >
                            <Armchair className="h-3.5 w-3.5" />
                            <span className="leading-none text-[9px] tabular-nums">{col}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <span className="w-5 text-center font-cinema-mono text-xs font-bold text-[#D4AF37]/75">
                    {row}
                  </span>
                </div>
              ))}
            </div>

            {/* Map Legend */}
            <div className="flex flex-wrap items-center justify-center gap-5 border-t border-white/[0.08] pt-3 text-[11px] text-[#F5F5F0]/65">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-white/25 bg-[#121218]" />
                {lang === 'ar' ? 'متاح' : 'Available'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-[#D4AF37]/50 bg-[#181409]" />
                {lang === 'ar' ? 'شرفة VIP (صف E)' : 'VIP (Row E)'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-[#D4AF37]" />
                {lang === 'ar' ? 'مقعدك' : 'Selected'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-rose-900/50 bg-rose-950/50" />
                {lang === 'ar' ? `محجوز (${bookings.length})` : `Reserved (${bookings.length})`}
              </span>
            </div>
          </div>

          {/* Right Panel: Live Acoustic & Perspective Preview + Reservation Form / Issued Ticket */}
          <div className="lg:col-span-5 space-y-5">
            {/* Live Seat Angle Preview */}
            <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#D4AF37]">
                  {lang === 'ar' ? `مقعد ${seatPersp.seatCode}` : `Seat ${seatPersp.seatCode}`}
                </span>
                <span className="text-[#F5F5F0]/65">{tierLabel(seatPersp.tier)}</span>
              </div>

              {/* Miniature Perspective Screen View from this Exact Seat */}
              <div
                className="relative flex h-28 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#07070A]"
                style={{ perspective: '420px' }}
              >
                <div
                  style={{
                    transform: `rotateY(${seatPersp.rotateYDeg * 1.4}deg) rotateX(${seatPersp.rotateXDeg}deg) scale(${seatPersp.screenScale})`,
                  }}
                  className="relative h-16 w-28 overflow-hidden rounded border border-[#D4AF37]/55 bg-[#121216] shadow-[0_0_24px_rgba(212,175,55,0.22)] transition-transform duration-300"
                >
                  {activeFilm.backdropUrl || activeFilm.posterUrl ? (
                    <img
                      src={activeFilm.backdropUrl || activeFilm.posterUrl}
                      alt={activeFilm.titleEn}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover opacity-80"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <FilmIcon className="h-5 w-5 text-[#D4AF37]/50" />
                    </div>
                  )}
                </div>
                <span className="pointer-events-none absolute bottom-1.5 start-2.5 text-[10px] font-cinema-mono text-[#F5F5F0]/45">
                  {lang === 'ar' ? 'معاينة زاوية الشاشة' : 'SEAT VIEW PREVIEW'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-cinema-mono text-[#F5F5F0]/65 tabular-nums">
                <div className="rounded-lg bg-[#0B0B0E] px-3 py-2">
                  {lang === 'ar' ? 'توازن الصوت: ' : 'Stereo Pan: '}
                  <span className="text-[#D4AF37]">
                    {seatPersp.pan === 0
                      ? 'CENTER'
                      : seatPersp.pan > 0
                        ? `R +${Math.round(seatPersp.pan * 100)}%`
                        : `L ${Math.round(seatPersp.pan * 100)}%`}
                  </span>
                </div>
                <div className="rounded-lg bg-[#0B0B0E] px-3 py-2">
                  {lang === 'ar' ? 'عمق القاعة: ' : 'Hall Depth: '}
                  <span className="text-[#D4AF37]">{Math.round(seatPersp.depth * 100)}%</span>
                </div>
              </div>
            </div>

            {confirmedTicket ? (
              <div className="space-y-4 rounded-xl border border-[#D4AF37]/50 bg-[#120F07] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#D4AF37]">
                    <Ticket className="h-5 w-5" />
                    <span className="text-sm font-bold">
                      {lang === 'ar' ? 'تم تأكيد تذكرتك!' : 'Seat Ticket Confirmed'}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    <span>{confirmedTicket.seatCode}</span>
                  </span>
                </div>

                <div className="space-y-1 text-xs text-[#F5F5F0]/80">
                  <p>
                    <strong className="text-[#F5F5F0]/50">
                      {lang === 'ar' ? 'باسم:' : 'Guest:'}
                    </strong>{' '}
                    {confirmedTicket.viewerName}
                  </p>
                  <p>
                    <strong className="text-[#F5F5F0]/50">
                      {lang === 'ar' ? 'الفئة:' : 'Tier:'}
                    </strong>{' '}
                    {tierLabel(confirmedTicket.tier)}
                  </p>
                </div>

                <div className="flex flex-col gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onEnterHall(activeFilm, confirmedTicket.seatCode)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-sm font-bold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>
                      {lang === 'ar'
                        ? `ادخل القاعة وابدأ العرض (${confirmedTicket.seatCode})`
                        : `Enter Cinema Hall (${confirmedTicket.seatCode})`}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadTicketPng}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/45 bg-[#0B0B0E] text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/10 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>
                      {lang === 'ar' ? 'حفظ التذكرة الذهبية (PNG)' : 'Download Gold Ticket (PNG)'}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleConfirmBooking}
                className="space-y-4 rounded-xl border border-white/[0.08] bg-[#050505] p-5"
              >
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#F5F5F0]/70">
                    {lang === 'ar' ? 'الاسم على التذكرة' : 'Name on Cinema Ticket'}
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={60}
                    placeholder={lang === 'ar' ? 'اكتب اسمك...' : 'Enter your name...'}
                    className="h-11 w-full rounded-lg border border-white/15 bg-[#0B0B0E] px-3.5 text-sm text-[#F5F5F0] placeholder-[#F5F5F0]/35 focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>

                {bookingError && (
                  <p className="text-xs text-rose-400">{bookingError}</p>
                )}

                <button
                  type="submit"
                  disabled={bookingBusy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-sm font-bold text-[#050505] transition-colors hover:bg-[#E6C65B] disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {bookingBusy
                      ? lang === 'ar'
                        ? 'جاري تأكيد المقعد...'
                        : 'Reserving Seat...'
                      : lang === 'ar'
                        ? `احجز مقعد ${selectedSeat} واصدر التذكرة`
                        : `Reserve Seat ${selectedSeat} & Issue Ticket`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onEnterHall(activeFilm, selectedSeat)}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/15 text-xs font-medium text-[#F5F5F0]/75 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>
                    {lang === 'ar'
                      ? 'تجربة الدخول السريع للقاعة دون حجز'
                      : 'Quick Preview Hall from this Seat'}
                  </span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
