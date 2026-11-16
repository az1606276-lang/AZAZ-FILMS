import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Clock,
  Film as FilmIcon,
  Heart,
  MessageSquare,
  Palette,
  Play,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
} from 'lucide-react';
import { GENRE_LABELS, STATUS_LABELS, t } from '../lib/i18n';
import { TheatreAmbianceSynth } from '../services/cinemaAudioEngine';
import {
  addSceneNote,
  deleteSceneNote,
  subscribeSceneNotes,
  type SceneTimecodeNote,
} from '../services/cinemaUniverseService';
import {
  deleteFilmComment,
  fetchFilmComments,
  submitFilmComment,
} from '../services/commentService';
import { fetchFilmReactionSummary, submitFilmLike } from '../services/reactionService';
import { getWatchProgress } from '../services/watchProgressService';
import type { AppLanguage, Film, FilmComment } from '../types/cinema';
import heroStageBackdrop from '../assets/images/cinema_hero_stage_1794735694699.jpg';
import { FilmColorBarcode } from './FilmColorBarcode';
import { FilmPosterCard } from './FilmPosterCard';
import { StoryTicketModal } from './StoryTicketModal';

interface FilmDetailsPageProps {
  film: Film;
  lang: AppLanguage;
  inWatchlist: boolean;
  isAdmin?: boolean;
  relatedFilms?: Film[];
  onBack: () => void;
  onWatchFilm: (film: Film, startTimeSec?: number) => void;
  onWatchInHall?: (film: Film) => void;
  onOpenFathersSinGala?: (film: Film) => void;
  onWatchTrailer: (film: Film) => void;
  onHostWatchParty?: (film: Film) => void;
  onBookSeat?: (film: Film) => void;
  onToggleWatchlist: (film: Film) => void;
  onSelectFilm?: (film: Film) => void;
}

export function FilmDetailsPage({
  film,
  lang,
  inWatchlist,
  isAdmin = false,
  relatedFilms = [],
  onBack,
  onWatchFilm,
  onWatchInHall,
  onOpenFathersSinGala,
  onWatchTrailer,
  onHostWatchParty,
  onBookSeat,
  onToggleWatchlist,
  onSelectFilm,
}: FilmDetailsPageProps) {
  const [posterErr, setPosterErr] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [comments, setComments] = useState<FilmComment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [sceneNotes, setSceneNotes] = useState<SceneTimecodeNote[]>([]);
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteTimeInput, setNoteTimeInput] = useState('00:30');
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [showStoryTicket, setShowStoryTicket] = useState(false);
  const [loupeEnabled, setLoupeEnabled] = useState(false);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number; active: boolean }>({
    x: 50,
    y: 50,
    active: false,
  });
  const [visualMood, setVisualMood] = useState<'original' | 'imax' | 'noir' | 'kodak' | 'nordic'>(
    'original'
  );
  const [ambianceOn, setAmbianceOn] = useState(false);
  const ambianceRef = useRef<TheatreAmbianceSynth | null>(null);

  useEffect(() => {
    return () => {
      ambianceRef.current?.stop();
      ambianceRef.current = null;
    };
  }, [film.id]);

  const MOOD_PRESETS: {
    id: 'original' | 'imax' | 'noir' | 'kodak' | 'nordic';
    labelAr: string;
    labelEn: string;
    css: string;
  }[] = [
    { id: 'original', labelAr: 'الأصلي HDR', labelEn: 'Master HDR', css: 'none' },
    {
      id: 'imax',
      labelAr: 'IMAX 70mm',
      labelEn: 'IMAX 70mm',
      css: 'contrast(1.12) saturate(1.15) sepia(0.08)',
    },
    {
      id: 'noir',
      labelAr: '1941 Noir',
      labelEn: '1941 Noir',
      css: 'grayscale(1) contrast(1.25) brightness(0.94)',
    },
    {
      id: 'kodak',
      labelAr: '35mm Kodak',
      labelEn: '35mm Kodak',
      css: 'sepia(0.18) contrast(1.09) saturate(0.92)',
    },
    {
      id: 'nordic',
      labelAr: 'تشويق بارد',
      labelEn: 'Nordic Cold',
      css: 'contrast(1.12) saturate(0.84) hue-rotate(8deg)',
    },
  ];
  const activeMoodCss = MOOD_PRESETS.find((m) => m.id === visualMood)?.css || 'none';

  const toggleAmbiance = () => {
    if (ambianceOn) {
      ambianceRef.current?.stop();
      setAmbianceOn(false);
      return;
    }
    if (!ambianceRef.current) {
      ambianceRef.current = new TheatreAmbianceSynth();
    }
    const started = ambianceRef.current.start(false, 0, 0.45);
    setAmbianceOn(started);
  };

  const savedProgress = getWatchProgress(film.id);
  const formatResume = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    let active = true;
    fetchFilmReactionSummary(film.id).then((res) => {
      if (!active) return;
      setLikeCount(res.count);
      setHasLiked(res.hasLiked);
    });
    fetchFilmComments(film.id).then((items) => {
      if (!active) return;
      setComments(items);
    });
    const unsubNotes = subscribeSceneNotes(film.id, (notes) => {
      if (active) setSceneNotes(notes);
    });
    return () => {
      active = false;
      unsubNotes();
    };
  }, [film.id]);

  const parseTimeInput = (raw: string): number => {
    const parts = raw.trim().split(':').map((n) => Number(n));
    if (parts.some((n) => Number.isNaN(n) || n < 0)) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parts[0] || 0;
  };

  const handleSubmitSceneNote = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingNote || !noteAuthor.trim() || !noteText.trim()) return;
    setSubmittingNote(true);
    try {
      await addSceneNote(
        film.id,
        noteAuthor,
        noteText,
        parseTimeInput(noteTimeInput),
        isAdmin
      );
      setNoteText('');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleLike = async () => {
    if (hasLiked) return;
    setHasLiked(true);
    setLikeCount((c) => c + 1);
    await submitFilmLike(film.id);
  };

  const handleSubmitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingComment) return;
    if (!commentAuthor.trim() || !commentText.trim()) {
      setCommentError(
        lang === 'ar' ? 'يرجى كتابة اسمك وتعليقك أولًا.' : 'Please enter your name and comment.'
      );
      return;
    }
    setCommentError(null);
    setSubmittingComment(true);
    try {
      const created = await submitFilmComment(film.id, commentAuthor, commentText);
      setComments((prev) => [created, ...prev]);
      setCommentText('');
    } catch {
      setCommentError(
        lang === 'ar'
          ? 'تعذر نشر التعليق حاليًا. حاول مرة أخرى.'
          : 'Could not post review right now.'
      );
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteFilmComment(commentId);
      setComments((prev) => prev.filter((c) => c.commentId !== commentId));
    } catch {
      // Ignore transient error
    }
  };

  const handleShareFilm = async () => {
    const shareUrl = `${window.location.origin}/?film=${encodeURIComponent(film.id)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${film.titleAr} — ${film.titleEn}`,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or native share unsupported; fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      setCopiedShare(false);
    }
  };

  const backdropSrc = film.backdropUrl && film.backdropUrl.trim() ? film.backdropUrl : heroStageBackdrop;
  const hasPoster = Boolean(film.posterUrl && film.posterUrl.trim() && !posterErr);
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
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Widescreen Film Backdrop Header */}
      <div className="relative w-full overflow-hidden border-b border-white/[0.08]">
        <img
          src={backdropSrc}
          alt={`${film.titleAr} — ${film.titleEn}`}
          referrerPolicy="no-referrer"
          style={{ filter: activeMoodCss }}
          className="absolute inset-0 h-full w-full object-cover opacity-40 transition-[filter] duration-300"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/75 to-[#050505]/45" />

        <div className="relative z-10 mx-auto max-w-[1440px] px-4 py-10 sm:px-8 lg:py-16">
          <button
            type="button"
            onClick={onBack}
            className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-[#F5F5F0]/75 hover:text-[#D4AF37] transition-colors cursor-pointer"
          >
            <BackIcon className="h-4 w-4" />
            <span>{t(lang, 'backToLibrary')}</span>
          </button>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
            {/* Official Poster Column */}
            <div className="lg:col-span-4 xl:col-span-3">
              <div className="aspect-[2/3] w-full max-w-[300px] overflow-hidden rounded-xl border border-white/15 bg-[#0B0B0E] shadow-2xl">
                {hasPoster ? (
                  <img
                    src={film.posterUrl}
                    alt={`${film.titleAr} — ${film.titleEn}`}
                    referrerPolicy="no-referrer"
                    onError={() => setPosterErr(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="relative flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_50%_25%,rgba(212,175,55,0.14),rgba(11,11,14,0.98)_70%)] p-6">
                    <div className="pointer-events-none absolute inset-3 rounded-lg border border-[#D4AF37]/25" />
                    <div className="relative z-10 flex items-center justify-between text-[11px] tracking-[0.2em] text-[#D4AF37]/80">
                      <span>{film.isOriginal ? 'AZ ORIGINALS' : 'AZ FILMS'}</span>
                      <FilmIcon className="h-4 w-4 text-[#D4AF37]/60" />
                    </div>
                    <div className="relative z-10 my-auto space-y-2 text-center">
                      <p className="text-2xl font-bold text-[#F5F5F0]">{film.titleAr}</p>
                      {film.titleEn !== film.titleAr && (
                        <p className="font-cinema-display text-sm tracking-[0.16em] text-[#D4AF37]">
                          {film.titleEn}
                        </p>
                      )}
                    </div>
                    <div className="relative z-10 text-center text-xs text-[#F5F5F0]/55 tabular-nums">
                      {film.year} · {genreLabel}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Metadata & Actions Column */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-6">
              <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium tracking-[0.16em] text-[#D4AF37]">
                <span>{film.isOriginal ? 'AZ ORIGINALS' : 'AZ FILMS'}</span>
                <span aria-hidden="true" className="text-[#F5F5F0]/35">·</span>
                <span className="text-[#F5F5F0]/80 tracking-normal">{statusLabel}</span>
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-bold leading-tight text-[#F5F5F0] sm:text-5xl text-balance">
                  {primaryTitle}
                </h1>
                {secondaryTitle && (
                  <p className="font-cinema-display text-xl tracking-[0.18em] text-[#D4AF37] sm:text-2xl">
                    {secondaryTitle}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-[#F5F5F0]/75">
                <span>
                  <strong className="font-normal text-[#F5F5F0]/45">{t(lang, 'releaseYear')}:</strong>{' '}
                  <span className="tabular-nums text-[#F5F5F0]">{film.year}</span>
                </span>
                <span aria-hidden="true" className="text-[#F5F5F0]/25">·</span>
                <span>
                  <strong className="font-normal text-[#F5F5F0]/45">{t(lang, 'genreLabel')}:</strong>{' '}
                  <span className="text-[#F5F5F0]">{genreLabel}</span>
                </span>
                {film.duration && film.duration !== '—' && (
                  <>
                    <span aria-hidden="true" className="text-[#F5F5F0]/25">·</span>
                    <span>
                      <strong className="font-normal text-[#F5F5F0]/45">{t(lang, 'durationLabel')}:</strong>{' '}
                      <span className="tabular-nums text-[#F5F5F0]">{film.duration}</span>
                    </span>
                  </>
                )}
                {film.releaseDate && (
                  <>
                    <span aria-hidden="true" className="text-[#F5F5F0]/25">·</span>
                    <span>
                      <strong className="font-normal text-[#F5F5F0]/45">{t(lang, 'releaseDateLabel')}:</strong>{' '}
                      <span className="tabular-nums text-[#F5F5F0]">{film.releaseDate}</span>
                    </span>
                  </>
                )}
                {!isComingSoon &&
                  (film.videoUrl || film.trailerUrl || (film.videoQualities?.length ?? 0) > 0) && (
                  <>
                    <span aria-hidden="true" className="text-[#F5F5F0]/25">·</span>
                    <span className="font-cinema-mono text-xs tracking-[0.12em] text-[#D4AF37]">
                      4K UHD · 2160p
                    </span>
                  </>
                )}
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {!isComingSoon ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onWatchFilm(film)}
                      className="flex h-12 items-center gap-2.5 rounded-lg bg-[#D4AF37] px-6 text-sm font-semibold text-[#050505] transition-colors hover:bg-[#E6C65B] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      <span>
                        {savedProgress
                          ? lang === 'ar'
                            ? `متابعة المشاهدة (${formatResume(savedProgress.currentTime)})`
                            : `Resume (${formatResume(savedProgress.currentTime)})`
                          : t(lang, 'watchFilm')}
                      </span>
                    </button>

                    {onWatchInHall && film.videoUrl && (
                      <button
                        type="button"
                        onClick={() => onWatchInHall(film)}
                        className="flex h-12 items-center gap-2.5 rounded-lg border border-[#D4AF37]/60 bg-[#D4AF37]/15 px-5 text-sm font-semibold text-[#D4AF37] transition-colors hover:bg-[#D4AF37] hover:text-[#050505] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Armchair className="h-4 w-4" />
                        <span>{lang === 'ar' ? 'مشاهدة داخل القاعة 3D' : 'Watch in 3D Hall'}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex h-12 items-center rounded-lg border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-5 text-xs font-semibold text-[#D4AF37]">
                    {t(lang, 'comingSoonNotice')}
                  </div>
                )}

                {film.id === 'fathers-sin' && onOpenFathersSinGala && (
                  <button
                    type="button"
                    onClick={() => onOpenFathersSinGala(film)}
                    className="flex h-12 items-center gap-2.5 rounded-lg border border-[#D4AF37] bg-[#D4AF37]/20 px-5 text-sm font-bold text-[#F5DE93] transition-colors hover:bg-[#D4AF37] hover:text-[#050505] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {lang === 'ar'
                        ? 'حضور حفل التقديم الحي — ذنب أبوي'
                        : "Enter Live Gala — Father's Sin"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onWatchTrailer(film)}
                  className="flex h-12 items-center gap-2.5 rounded-lg border border-white/20 bg-white/[0.06] px-6 text-sm font-semibold text-[#F5F5F0] transition-colors hover:border-[#D4AF37]/60 hover:bg-white/[0.12] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Video className="h-4 w-4 text-[#D4AF37]" />
                  <span>{t(lang, 'watchTrailer')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleWatchlist(film)}
                  className={`flex h-12 items-center gap-2 rounded-lg border px-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    inWatchlist
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]'
                      : 'border-white/15 bg-white/[0.04] text-[#F5F5F0]/85 hover:border-white/30'
                  }`}
                >
                  {inWatchlist ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  <span>{inWatchlist ? t(lang, 'inMyList') : t(lang, 'addToMyList')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleLike}
                  className={`flex h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    hasLiked
                      ? 'border-rose-500/50 bg-rose-500/15 text-rose-400'
                      : 'border-white/15 bg-white/[0.04] text-[#F5F5F0]/85 hover:border-rose-400/50 hover:text-rose-300'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${hasLiked ? 'fill-current' : ''}`} />
                  <span>{lang === 'ar' ? 'أعجبني' : 'Like'}</span>
                  {likeCount > 0 && (
                    <span className="tabular-nums text-xs opacity-85">({likeCount})</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShareFilm}
                  className={`flex h-12 items-center gap-2 rounded-lg border px-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    copiedShare
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]'
                      : 'border-white/15 bg-white/[0.04] text-[#F5F5F0]/85 hover:border-white/30'
                  }`}
                >
                  {copiedShare ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  <span>{copiedShare ? t(lang, 'linkCopied') : t(lang, 'shareFilm')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowStoryTicket(true)}
                  className="flex h-12 items-center gap-2 rounded-lg border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-5 text-sm font-medium text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/20 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{lang === 'ar' ? 'بطاقة ستوري' : 'Story Card'}</span>
                </button>

                {!isComingSoon && film.videoUrl && onHostWatchParty && (
                  <button
                    type="button"
                    onClick={() => onHostWatchParty(film)}
                    className="flex h-12 items-center gap-2 rounded-lg border border-white/20 bg-white/[0.06] px-5 text-sm font-medium text-[#F5F5F0] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Users className="h-4 w-4 text-[#D4AF37]" />
                    <span>{lang === 'ar' ? 'شاهدوا معاً' : 'Watch Party'}</span>
                  </button>
                )}

                {!isComingSoon && film.videoUrl && onBookSeat && (
                  <button
                    type="button"
                    onClick={() => onBookSeat(film)}
                    className="flex h-12 items-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-[#D4AF37]/15 px-5 text-sm font-semibold text-[#D4AF37] transition-colors hover:bg-[#D4AF37] hover:text-[#050505] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Armchair className="h-4 w-4" />
                    <span>{lang === 'ar' ? 'احجز مقعدك بالقاعة' : 'Book Cinema Seat'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Synopsis, Credits & Stills */}
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Synopsis & Stills */}
          <div className="lg:col-span-8 space-y-10">
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[#D4AF37]">{t(lang, 'officialSynopsis')}</h2>
              <p className="max-w-3xl text-base leading-relaxed text-[#F5F5F0]/85">
                {synopsis || (lang === 'ar' ? 'سيتم إضافة القصة الرسمية قريبًا.' : 'Official synopsis will be published soon.')}
              </p>
            </section>

            {/* Interactive Visual Grade Audition & 35mm Room Ambiance */}
            <section className="space-y-4 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#D4AF37]">
                  <Palette className="h-4 w-4" />
                  <span>
                    {lang === 'ar'
                      ? 'تجربة الإضاءة السينمائية وأجواء القاعة 35mm'
                      : 'Interactive Optical Grade & 35mm Room Ambiance'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleAmbiance}
                  className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    ambianceOn
                      ? 'border-[#D4AF37] bg-[#D4AF37] text-[#050505]'
                      : 'border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20'
                  }`}
                >
                  {ambianceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  <span>
                    {ambianceOn
                      ? lang === 'ar'
                        ? 'إيقاف صوت القاعة 35mm'
                        : 'Mute 35mm Reel'
                      : lang === 'ar'
                        ? 'تشغيل همس بكرة 35mm'
                        : 'Play 35mm Reel Ambiance'}
                  </span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {MOOD_PRESETS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setVisualMood(m.id)}
                    className={`h-8 rounded-lg border px-3 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      visualMood === m.id
                        ? 'border-[#D4AF37] bg-[#D4AF37]/20 font-semibold text-[#D4AF37]'
                        : 'border-white/10 bg-[#050505] text-[#F5F5F0]/75 hover:border-white/25'
                    }`}
                  >
                    {lang === 'ar' ? m.labelAr : m.labelEn}
                  </button>
                ))}
              </div>
            </section>

            {/* Real-Time Chromatic Film DNA Barcode */}
            <FilmColorBarcode
              filmId={film.id}
              imageUrl={film.backdropUrl || film.posterUrl || heroStageBackdrop}
              lang={lang}
            />

            {/* Film Stills */}
            {film.stillUrls && film.stillUrls.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-bold text-[#D4AF37]">{t(lang, 'stillsLabel')}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {film.stillUrls.map((url, idx) => (
                    <button
                      key={`${url}-${idx}`}
                      type="button"
                      onClick={() => setLightboxUrl(url)}
                      className="group relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0E] cursor-pointer"
                    >
                      <img
                        src={url}
                        alt={`${film.titleEn} still ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        style={{ filter: activeMoodCss }}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Director, Producers & Cast */}
          <aside className="lg:col-span-4 space-y-6 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-6 h-fit">
            <div className="space-y-4">
              {film.director && (
                <div className="border-b border-white/[0.06] pb-3">
                  <p className="text-xs text-[#F5F5F0]/45">{t(lang, 'directorLabel')}</p>
                  <p className="mt-1 text-sm font-semibold text-[#F5F5F0]">{film.director}</p>
                </div>
              )}

              {film.producers && (
                <div className="border-b border-white/[0.06] pb-3">
                  <p className="text-xs text-[#F5F5F0]/45">{t(lang, 'producersLabel')}</p>
                  <p className="mt-1 text-sm font-semibold text-[#F5F5F0]">{film.producers}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-[#F5F5F0]/45 mb-2.5">{t(lang, 'castLabel')}</p>
                {film.cast && film.cast.length > 0 ? (
                  <ul className="space-y-2.5">
                    {film.cast.map((member, idx) => (
                      <li key={`${member.name}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-[#F5F5F0]">{member.name}</span>
                        {member.role && <span className="text-xs text-[#F5F5F0]/55">{member.role}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#F5F5F0]/45">
                    {lang === 'ar' ? 'يُحدَّث فريق العمل من لوحة الإدارة.' : 'Cast & crew credits updated via Admin Studio.'}
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* Timecode-Synced Scene Notes & Director Marginalia */}
        <section className="mt-14 border-t border-white/[0.08] pt-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Clock className="h-5 w-5 text-[#D4AF37]" />
              <h2 className="text-xl font-bold text-[#F5F5F0]">
                {lang === 'ar' ? 'ملاحظات مرتبطة بتوقيت المشهد' : 'Timecode Scene Annotations'}
              </h2>
            </div>
            <span className="text-xs text-[#F5F5F0]/55">
              {lang === 'ar'
                ? 'اضغط على أي توقيت للانتقال مباشرة إلى تلك الثانية داخل الفيلم'
                : 'Click any timestamp to jump straight to that exact moment'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <form
              onSubmit={handleSubmitSceneNote}
              className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-5 space-y-4 h-fit"
            >
              <p className="text-xs font-semibold text-[#D4AF37]">
                {isAdmin
                  ? lang === 'ar'
                    ? 'إضافة ملاحظة مخرج رسمية على مشهد'
                    : 'Pin Official Director Scene Note'
                  : lang === 'ar'
                    ? 'ثبّت ملاحظة على ثانية محددة'
                    : 'Pin Note to a Scene Timestamp'}
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                <input
                  type="text"
                  maxLength={60}
                  value={noteAuthor}
                  onChange={(e) => setNoteAuthor(e.target.value)}
                  placeholder={lang === 'ar' ? 'الاسم' : 'Name'}
                  className="col-span-2 h-10 rounded-lg border border-white/15 bg-[#050505] px-3 text-sm text-[#F5F5F0] placeholder:text-[#F5F5F0]/40 focus:border-[#D4AF37] focus:outline-none"
                />
                <input
                  type="text"
                  maxLength={10}
                  value={noteTimeInput}
                  onChange={(e) => setNoteTimeInput(e.target.value)}
                  placeholder="01:25"
                  className="h-10 rounded-lg border border-white/15 bg-[#050505] px-3 text-center font-cinema-mono text-xs text-[#D4AF37] focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <textarea
                rows={2}
                maxLength={280}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'كواليس، تفاصيل بصرية، أو تعليق على هذه اللحظة...'
                    : 'Behind the scenes detail or insight at this moment...'
                }
                className="w-full rounded-lg border border-white/15 bg-[#050505] p-3 text-sm text-[#F5F5F0] placeholder:text-[#F5F5F0]/40 focus:border-[#D4AF37] focus:outline-none"
              />
              <button
                type="submit"
                disabled={submittingNote}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-[#D4AF37]/15 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#050505] disabled:opacity-40 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{lang === 'ar' ? 'تثبيت الملاحظة بالمشهد' : 'Pin Scene Note'}</span>
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {sceneNotes.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-[#0B0B0E]/60 p-8 text-center text-sm text-[#F5F5F0]/50">
                  {lang === 'ar'
                    ? 'لم تُثبَّت ملاحظات زمنية على هذا العمل بعد.'
                    : 'No timecode annotations pinned to this film yet.'}
                </div>
              ) : (
                sceneNotes.map((n) => (
                  <div
                    key={n.noteId}
                    className={`rounded-xl border p-4 space-y-2 ${
                      n.isDirectorNote
                        ? 'border-[#D4AF37]/45 bg-[#D4AF37]/[0.06]'
                        : 'border-white/[0.08] bg-[#0B0B0E]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => onWatchFilm(film, n.timeSec)}
                          disabled={isComingSoon}
                          className="font-cinema-mono rounded border border-[#D4AF37]/50 bg-black/50 px-2 py-0.5 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#050505] disabled:opacity-50 cursor-pointer"
                        >
                          {formatResume(n.timeSec)}
                        </button>
                        <span className="text-sm font-bold text-[#F5F5F0]">{n.authorName}</span>
                        {n.isDirectorNote && (
                          <span className="text-[11px] font-medium text-[#D4AF37]">
                            · {lang === 'ar' ? 'رؤية المخرج' : "Director's Note"}
                          </span>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => deleteSceneNote(n.noteId)}
                          aria-label="Delete scene note"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/25 text-red-400 hover:bg-red-500/15 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-[#F5F5F0]/85">{n.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Audience Reviews & Comments */}
        <section className="mt-14 border-t border-white/[0.08] pt-10 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <MessageSquare className="h-5 w-5 text-[#D4AF37]" />
              <h2 className="text-xl font-bold text-[#F5F5F0]">
                {lang === 'ar' ? 'آراء وتعليقات الجمهور' : 'Audience Reviews'}
              </h2>
              {comments.length > 0 && (
                <span className="tabular-nums text-xs text-[#D4AF37]">({comments.length})</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <form
              onSubmit={handleSubmitComment}
              className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-5 space-y-4 h-fit"
            >
              <p className="text-xs font-semibold text-[#D4AF37]">
                {lang === 'ar' ? 'شاركنا رأيك بعد المشاهدة' : 'Share your thoughts'}
              </p>
              <input
                type="text"
                maxLength={60}
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                placeholder={lang === 'ar' ? 'اسمك (مثال: عبدالله)' : 'Your name'}
                className="h-10 w-full rounded-lg border border-white/15 bg-[#050505] px-3 text-sm text-[#F5F5F0] placeholder:text-[#F5F5F0]/40 focus:border-[#D4AF37] focus:outline-none"
              />
              <textarea
                rows={3}
                maxLength={600}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'اكتب انطباعك عن الفيلم...'
                    : 'Write your review of the film...'
                }
                className="w-full rounded-lg border border-white/15 bg-[#050505] p-3 text-sm text-[#F5F5F0] placeholder:text-[#F5F5F0]/40 focus:border-[#D4AF37] focus:outline-none"
              />
              {commentError && <p className="text-xs text-red-400">{commentError}</p>}
              <button
                type="submit"
                disabled={submittingComment}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>
                  {submittingComment
                    ? '...'
                    : lang === 'ar'
                    ? 'نشر التعليق'
                    : 'Post Review'}
                </span>
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {comments.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-[#0B0B0E]/60 p-8 text-center text-sm text-[#F5F5F0]/50">
                  {lang === 'ar'
                    ? 'كن أول من يكتب رأيه حول هذا العمل.'
                    : 'Be the first to share a review for this work.'}
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.commentId}
                    className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-bold text-[#F5F5F0]">{c.authorName}</span>
                        <span className="text-[11px] tabular-nums text-[#F5F5F0]/40">
                          {c.createdAt.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                        </span>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(c.commentId)}
                          aria-label="Delete comment"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/25 text-red-400 hover:bg-red-500/15 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-[#F5F5F0]/85">{c.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* More from AZ FILMS */}
        {relatedFilms.length > 0 && onSelectFilm && (
          <section className="mt-14 border-t border-white/[0.08] pt-10 space-y-6">
            <h2 className="text-xl font-bold text-[#F5F5F0]">
              {lang === 'ar' ? 'أعمال أخرى من AZ FILMS' : 'More from AZ FILMS'}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:gap-6">
              {relatedFilms.map((rf) => (
                <FilmPosterCard key={rf.id} film={rf} lang={lang} onSelect={onSelectFilm} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Stills Lightbox with Interactive 2.5x Optical Cinema Loupe */}
      {lightboxUrl && (
        <div
          onClick={() => {
            setLightboxUrl(null);
            setLoupeEnabled(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-6 top-6 z-20 flex items-center gap-2.5"
          >
            <button
              type="button"
              onClick={() => setLoupeEnabled((v) => !v)}
              className={`flex h-10 items-center gap-2 rounded-lg border px-3.5 text-xs font-medium transition-colors cursor-pointer ${
                loupeEnabled
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#050505]'
                  : 'border-white/20 bg-black/75 text-[#F5F5F0] hover:border-[#D4AF37] hover:text-[#D4AF37]'
              }`}
            >
              <ZoomIn className="h-4 w-4" />
              <span>{lang === 'ar' ? 'عدسة التكبير 2.5×' : '2.5× Optical Loupe'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLightboxUrl(null);
                setLoupeEnabled(false);
              }}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-black/75 text-[#F5F5F0] hover:text-[#D4AF37] cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            onMouseMove={(e) => {
              if (!loupeEnabled) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              setLoupePos({
                x: Math.min(100, Math.max(0, x)),
                y: Math.min(100, Math.max(0, y)),
                active: true,
              });
            }}
            onMouseLeave={() => setLoupePos((p) => ({ ...p, active: false }))}
            className={`relative overflow-hidden rounded-lg ${loupeEnabled ? 'cursor-crosshair' : ''}`}
          >
            <img
              src={lightboxUrl}
              alt="Film still"
              referrerPolicy="no-referrer"
              className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain select-none"
            />
            {loupeEnabled && loupePos.active && (
              <div
                aria-hidden="true"
                style={{
                  left: `${loupePos.x}%`,
                  top: `${loupePos.y}%`,
                  backgroundImage: `url("${lightboxUrl}")`,
                  backgroundSize: '250%',
                  backgroundPosition: `${loupePos.x}% ${loupePos.y}%`,
                }}
                className="pointer-events-none absolute h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#D4AF37] shadow-[0_0_40px_rgba(0,0,0,0.9)]"
              />
            )}
          </div>
        </div>
      )}
      {showStoryTicket && (
        <StoryTicketModal
          film={film}
          lang={lang}
          onClose={() => setShowStoryTicket(false)}
        />
      )}
    </div>
  );
}
