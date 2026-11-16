import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Play, Sparkles } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AudiencePollSection } from './components/AudiencePollSection';
import { CatalogToastContainer, type CatalogToastItem } from './components/CatalogToastContainer';
import { CinemaFutureLabSection } from './components/CinemaFutureLabSection';
import { CinemaPassportModal } from './components/CinemaPassportModal';
import { CinemaPlayerModal } from './components/CinemaPlayerModal';
import { CinemaSeatBookingModal } from './components/CinemaSeatBookingModal';
import { CinemaUniverseHub } from './components/CinemaUniverseHub';
import { CountdownTimer } from './components/CountdownTimer';
import { FathersSinGalaModal } from './components/FathersSinGalaModal';
import { FilmDetailsPage } from './components/FilmDetailsPage';
import { FilmRowSection } from './components/FilmRowSection';
import { HeroSection } from './components/HeroSection';
import { LibraryPage, ComingSoonPage, MyListPage, OriginalsPage, SearchPage } from './components/LibraryViews';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SiteLockScreen } from './components/SiteLockScreen';
import {
  StudioTechnologyStrip,
  type PlayerLaunchPreset,
} from './components/StudioTechnologyStrip';
import { TopBar } from './components/TopBar';
import { CANONICAL_FILMS } from './data/canonicalFilms';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL } from './lib/firebase';
import { t } from './lib/i18n';
import { recordPlatformVisit, updateSessionHeartbeat } from './services/analyticsService';
import {
  addToWatchlist,
  removeFromWatchlist,
  signInWithGoogle,
  signOutAccount,
  subscribeWatchlist,
  syncUserProfile,
} from './services/authService';
import { getSavedViewerCreditName } from './services/cinemaPulseService';
import { getSavedBookedSeat } from './services/cinemaHallService';
import {
  createWatchPartyRoom,
  fetchWatchPartyRoom,
  recordWatchPartyJoined,
} from './services/cinemaUniverseService';
import { seedCanonicalFilmsIfNeeded, subscribeFilms } from './services/filmService';
import {
  DEFAULT_SITE_SETTINGS,
  saveSiteSettings,
  subscribeSiteSettings,
} from './services/siteSettingsService';
import { listContinueWatching } from './services/watchProgressService';
import type { AppLanguage, AppView, Film, SiteSettings, UserProfile } from './types/cinema';

export default function App() {
  const [lang, setLang] = useState<AppLanguage>('ar');
  const [activeView, setActiveView] = useState<AppView>('home');
  const [selectedFilmId, setSelectedFilmId] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<{
    film: Film;
    mode: 'film' | 'trailer';
    preset?: PlayerLaunchPreset;
    startTimeSec?: number;
    watchParty?: { partyId: string; isHost: boolean } | null;
    hallSeat?: string | null;
  } | null>(null);
  const [showPassport, setShowPassport] = useState(false);
  const [seatBookingFilm, setSeatBookingFilm] = useState<Film | null>(null);
  const [galaFilm, setGalaFilm] = useState<Film | null>(null);

  const [films, setFilms] = useState<Film[]>([]);
  const [filmsLoaded, setFilmsLoaded] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [siteSettingsLoaded, setSiteSettingsLoaded] = useState(false);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [progressTick, setProgressTick] = useState(0);
  const [catalogToasts, setCatalogToasts] = useState<CatalogToastItem[]>([]);

  const prevFilmsRef = useRef<Map<string, Film> | null>(null);
  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const onlyShowReadyFilmsRef = useRef(Boolean(siteSettings.onlyShowReadyFilms));

  useEffect(() => {
    onlyShowReadyFilmsRef.current = Boolean(siteSettings.onlyShowReadyFilms);
  }, [siteSettings.onlyShowReadyFilms]);

  const dismissCatalogToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setCatalogToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushCatalogToast = useCallback(
    (type: CatalogToastItem['type'], film: Film) => {
      const id = `${film.id}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setCatalogToasts((prev) => [{ id, type, film }, ...prev].slice(0, 3));
      const timer = window.setTimeout(() => {
        toastTimersRef.current.delete(id);
        setCatalogToasts((prev) => prev.filter((item) => item.id !== id));
      }, 6500);
      toastTimersRef.current.set(id, timer);
    },
    []
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const isAdmin = Boolean(
    userProfile &&
      userProfile.role === 'admin' &&
      userProfile.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  );

  // Sync document direction & language
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUserProfile(null);
        setWatchlistIds([]);
        setAuthReady(true);
        return;
      }
      try {
        const profile = await syncUserProfile(fbUser);
        setUserProfile(profile);
        if (profile.role === 'admin') {
          await seedCanonicalFilmsIfNeeded();
        }
      } catch (err) {
        console.error('Auth profile sync error:', err);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to global site access mode & announcements
  useEffect(() => {
    const unsub = subscribeSiteSettings((next) => {
      setSiteSettings(next);
      setSiteSettingsLoaded(true);
    });
    return () => unsub();
  }, []);

  // Subscribe to films catalog (skip when site is locked/maintenance for visitors)
  useEffect(() => {
    if (!authReady || !siteSettingsLoaded) return;
    prevFilmsRef.current = null;
    if (!isAdmin && siteSettings.accessMode !== 'open') {
      setFilms([]);
      setFilmsLoaded(true);
      return;
    }
    const unsub = subscribeFilms(isAdmin, (list) => {
      const prevMap = prevFilmsRef.current;
      if (prevMap !== null) {
        for (const film of list) {
          if (!isAdmin && onlyShowReadyFilmsRef.current && !(film.posterUrl && film.posterUrl.trim())) {
            continue;
          }
          const prevFilm = prevMap.get(film.id);
          if (!prevFilm) {
            pushCatalogToast('added', film);
          } else if (prevFilm.status !== 'released' && film.status === 'released') {
            pushCatalogToast('released', film);
          }
        }
      }
      prevFilmsRef.current = new Map(list.map((f) => [f.id, f]));
      setFilms(list);
      setFilmsLoaded(true);
    });
    return () => {
      prevFilmsRef.current = null;
      unsub();
    };
  }, [authReady, siteSettingsLoaded, isAdmin, siteSettings.accessMode, pushCatalogToast]);

  // Support direct film & Watch Party deep-link (?film=...&party=...)
  useEffect(() => {
    if (!filmsLoaded || deepLinkHandled) return;
    setDeepLinkHandled(true);
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('film');
    const partyCode = params.get('party');

    if (partyCode && partyCode.trim()) {
      const normalizedCode = partyCode.trim().toUpperCase();
      fetchWatchPartyRoom(normalizedCode)
        .then((room) => {
          if (!room || !room.isActive) return;
          const partyFilm = films.find(
            (f) => f.id === room.filmId && (isAdmin || f.isVisible)
          );
          if (!partyFilm) return;
          recordWatchPartyJoined();
          setSelectedFilmId(partyFilm.id);
          setActiveView('film_details');
          setPlayerState({
            film: partyFilm,
            mode: 'film',
            startTimeSec: room.playbackTime,
            watchParty: { partyId: room.partyId, isHost: false },
          });
        })
        .catch(() => {});
      return;
    }

    if (targetId && films.some((f) => f.id === targetId && (isAdmin || f.isVisible))) {
      setSelectedFilmId(targetId);
      setActiveView('film_details');
    }
  }, [filmsLoaded, deepLinkHandled, films, isAdmin]);

  // Subscribe to personal watchlist
  useEffect(() => {
    if (!userProfile) {
      setWatchlistIds([]);
      return;
    }
    const unsub = subscribeWatchlist(userProfile.uid, setWatchlistIds);
    return () => unsub();
  }, [userProfile]);

  // Platform analytics: record deduplicated visit once + active heartbeat
  useEffect(() => {
    recordPlatformVisit(activeView);
    const interval = window.setInterval(() => {
      updateSessionHeartbeat(activeView);
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    updateSessionHeartbeat(selectedFilmId ? `${activeView}/${selectedFilmId}` : activeView);
  }, [activeView, selectedFilmId]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!message.includes('popup-closed-by-user')) {
        showNotice(
          lang === 'ar' ? 'تعذر إتمام تسجيل الدخول. حاول مجددًا.' : 'Sign-in could not be completed.'
        );
      }
    }
  };

  const handleSignOut = async () => {
    await signOutAccount();
    if (activeView === 'admin') {
      setActiveView('home');
    }
  };

  const handleNavigate = (view: AppView) => {
    setActiveView(view);
    if (view !== 'film_details') {
      setSelectedFilmId(null);
      if (window.location.search.includes('film=')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectFilm = (film: Film) => {
    setSelectedFilmId(film.id);
    setActiveView('film_details');
    window.history.replaceState({}, '', `${window.location.pathname}?film=${encodeURIComponent(film.id)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleWatchlist = async (film: Film) => {
    if (!userProfile) {
      showNotice(t(lang, 'myListSignInPrompt'));
      await handleSignIn();
      return;
    }
    const exists = watchlistIds.includes(film.id);
    if (exists) {
      await removeFromWatchlist(userProfile.uid, film.id);
    } else {
      await addToWatchlist(userProfile.uid, film.id);
    }
  };

  const handleHostWatchParty = async (film: Film) => {
    try {
      const hostName =
        getSavedViewerCreditName(userProfile?.displayName) ||
        (lang === 'ar' ? 'المضيف' : 'Host');
      const room = await createWatchPartyRoom(film.id, hostName, 0);
      setPlayerState({
        film,
        mode: 'film',
        watchParty: { partyId: room.partyId, isHost: true },
      });
    } catch {
      showNotice(
        lang === 'ar' ? 'تعذر إنشاء غرفة العرض المشترك حالياً.' : 'Could not start Watch Party right now.'
      );
    }
  };

  const visibleFilms = useMemo(() => {
    const base = films.filter((f) => f.isVisible);
    if (!isAdmin && siteSettings.onlyShowReadyFilms) {
      return base.filter((f) => Boolean(f.posterUrl && f.posterUrl.trim()));
    }
    return base;
  }, [films, isAdmin, siteSettings.onlyShowReadyFilms]);

  const featuredFilm = useMemo(() => {
    return (
      visibleFilms.find((f) => f.isFeatured) ||
      visibleFilms.find((f) => f.status === 'released') ||
      visibleFilms[0] ||
      null
    );
  }, [visibleFilms]);

  const heroSlides = useMemo(() => {
    const playable = visibleFilms.filter(
      (f) => f.status === 'released' && Boolean(f.videoUrl && f.videoUrl.trim())
    );
    if (playable.length > 0) {
      const featuredPlayable = playable.filter((f) => f.isFeatured);
      const restPlayable = playable
        .filter((f) => !f.isFeatured)
        .sort((a, b) => (b.year - a.year) || (b.sortOrder - a.sortOrder));
      return [...featuredPlayable, ...restPlayable];
    }
    return featuredFilm ? [featuredFilm] : [];
  }, [visibleFilms, featuredFilm]);

  const continueWatchingList = useMemo(() => {
    const entries = listContinueWatching();
    return entries
      .map((entry) => {
        const film = visibleFilms.find(
          (f) => f.id === entry.filmId && f.status === 'released' && Boolean(f.videoUrl && f.videoUrl.trim())
        );
        if (!film) return null;
        const pct = Math.min(96, Math.max(4, Math.round((entry.currentTime / entry.duration) * 100)));
        const remainingSec = Math.max(0, Math.round(entry.duration - entry.currentTime));
        const remMin = Math.floor(remainingSec / 60);
        const remSec = remainingSec % 60;
        const remainingLabel =
          lang === 'ar'
            ? `متبقي ${remMin}:${String(remSec).padStart(2, '0')}`
            : `${remMin}:${String(remSec).padStart(2, '0')} left`;
        return { film, pct, remainingLabel };
      })
      .filter((x): x is { film: Film; pct: number; remainingLabel: string } => Boolean(x));
  }, [visibleFilms, progressTick, lang]);

  const nextPlayableFilm = useMemo(() => {
    if (!playerState || playerState.mode !== 'film') return null;
    const playable = visibleFilms.filter(
      (f) => f.status === 'released' && Boolean(f.videoUrl && f.videoUrl.trim())
    );
    if (playable.length <= 1) return null;
    const currentIdx = playable.findIndex((f) => f.id === playerState.film.id);
    if (currentIdx === -1) return playable[0];
    return playable[(currentIdx + 1) % playable.length];
  }, [playerState, visibleFilms]);

  const selectedFilm = useMemo(
    () => films.find((f) => f.id === selectedFilmId) || null,
    [films, selectedFilmId]
  );

  const relatedFilms = useMemo(() => {
    if (!selectedFilm) return [];
    return visibleFilms
      .filter((f) => f.id !== selectedFilm.id)
      .sort((a, b) => {
        const aReady = a.videoUrl && a.posterUrl ? 1 : 0;
        const bReady = b.videoUrl && b.posterUrl ? 1 : 0;
        if (aReady !== bReady) return bReady - aReady;
        return b.year - a.year || b.sortOrder - a.sortOrder;
      })
      .slice(0, 5);
  }, [visibleFilms, selectedFilm]);

  const releasedFilms = useMemo(
    () =>
      visibleFilms
        .filter((f) => f.status === 'released')
        .sort((a, b) => {
          const aReady = a.videoUrl && a.posterUrl ? 1 : 0;
          const bReady = b.videoUrl && b.posterUrl ? 1 : 0;
          if (aReady !== bReady) return bReady - aReady;
          return b.year - a.year || b.sortOrder - a.sortOrder;
        }),
    [visibleFilms]
  );
  const comingSoonFilms = useMemo(
    () => visibleFilms.filter((f) => f.status !== 'released'),
    [visibleFilms]
  );
  const originalsFilms = useMemo(
    () => visibleFilms.filter((f) => f.isOriginal),
    [visibleFilms]
  );

  const isLockedForVisitor = !isAdmin && siteSettings.accessMode !== 'open';
  const announcementText =
    lang === 'ar'
      ? siteSettings.announcementAr || siteSettings.announcementEn
      : siteSettings.announcementEn || siteSettings.announcementAr;
  const cleanInstagramHref = (() => {
    const raw = siteSettings.instagramUrl?.trim() || '';
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const handle = raw.replace(/^@/, '').replace(/\/+$/, '');
    return handle ? `https://instagram.com/${handle}` : '';
  })();

  if (authReady && siteSettingsLoaded && isLockedForVisitor) {
    return (
      <SiteLockScreen
        settings={siteSettings}
        lang={lang}
        onToggleLang={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
        user={userProfile}
        onOwnerSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-[#F5F5F0]">
      {isAdmin && siteSettings.accessMode !== 'open' && (
        <div className="border-b border-[#D4AF37]/40 bg-[#1A1506] px-4 py-2 text-center text-xs text-[#D4AF37] flex flex-wrap items-center justify-center gap-3">
          <span>
            {lang === 'ar'
              ? siteSettings.accessMode === 'maintenance'
                ? 'وضع الصيانة مفعّل حاليًا للزوار — أنت تتصفح بصلاحية المالك'
                : 'الموقع مغلق مؤقتًا للزوار — أنت تتصفح بصلاحية المالك'
              : `Public access is currently ${siteSettings.accessMode.toUpperCase()} — Owner bypass active`}
          </span>
          <button
            type="button"
            onClick={() =>
              saveSiteSettings({
                ...siteSettings,
                accessMode: 'open',
              })
            }
            className="rounded border border-[#D4AF37]/60 bg-[#D4AF37] px-2.5 py-0.5 text-[11px] font-semibold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
          >
            {lang === 'ar' ? 'فتح الموقع للجميع' : 'Reopen Site'}
          </button>
        </div>
      )}

      {siteSettings.announcementEnabled && announcementText.trim() && (
        <div className="border-b border-[#D4AF37]/25 bg-[#D4AF37]/10 px-4 py-2 text-center text-xs font-medium text-[#D4AF37]">
          {announcementText}
        </div>
      )}

      <TopBar
        lang={lang}
        onToggleLang={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
        activeView={activeView}
        onNavigate={handleNavigate}
        user={userProfile}
        isAdmin={isAdmin}
        onSignOut={handleSignOut}
      />

      {notice && (
        <div className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-lg border border-[#D4AF37]/40 bg-[#121216] px-5 py-3 text-xs font-medium text-[#F5F5F0] shadow-2xl">
          {notice}
        </div>
      )}

      <main className="flex-1">
        {!filmsLoaded || !authReady || !siteSettingsLoaded ? (
          <div className="mx-auto max-w-[1440px] px-4 py-24 sm:px-8">
            <div className="h-[60vh] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0B0B0E]" />
          </div>
        ) : activeView === 'home' ? (
          <div>
            <HeroSection
              slides={heroSlides}
              lang={lang}
              watchlistIds={watchlistIds}
              onWatchFilm={(film) => setPlayerState({ film, mode: 'film' })}
              onWatchInHall={(film) =>
                setPlayerState({
                  film,
                  mode: 'film',
                  hallSeat: getSavedBookedSeat(film.id) || 'C5',
                  preset: { audioPreset: 'spatial3d', theaterDim: true },
                })
              }
              onOpenFathersSinGala={(film) => setGalaFilm(film)}
              onViewDetails={handleSelectFilm}
              onToggleWatchlist={handleToggleWatchlist}
            />

            {/* Father's Sin World Gala Premiere Editorial Spotlight */}
            {(() => {
              const fathersSin =
                visibleFilms.find((f) => f.id === 'fathers-sin') ||
                films.find((f) => f.id === 'fathers-sin' && f.isVisible) ||
                CANONICAL_FILMS.find((f) => f.id === 'fathers-sin') ||
                null;
              if (!fathersSin) return null;
              return (
                <section className="mx-auto max-w-[1440px] px-4 pt-8 pb-2 sm:px-8">
                  <div className="flex flex-col gap-5 rounded-2xl border border-[#D4AF37]/30 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.14),rgba(11,11,14,0.98)_70%)] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                    <div className="max-w-2xl space-y-2">
                      <p className="font-cinema-mono text-[11px] tracking-[0.22em] text-[#D4AF37]">
                        AZ FILMS WORLD PREMIERE · LIVE AUDITORIUM
                      </p>
                      <h2 className="text-2xl font-bold text-[#F5F5F0] sm:text-3xl text-balance">
                        {lang === 'ar'
                          ? 'حفل التقديم العالمي — ذنب أبوي'
                          : "Father's Sin — Interactive Gala Premiere"}
                      </h2>
                      <p className="text-xs sm:text-sm leading-relaxed text-[#F5F5F0]/75">
                        {lang === 'ar'
                          ? 'عِش ليلة تقديم الفيلم مع المخرج عبدالعزيز الثنيان ونايف ومطلق والطاقم وسط تصفيق القاعة والصوت المكاني وتذكرتك الذهبية.'
                          : 'Step inside the premiere hall with director Abdulaziz Al-Thunayan, Naif, Mutlaq & cast with live applause, 9 synced chapters, and a VIP pass.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => setGalaFilm(fathersSin)}
                        className="flex h-12 items-center gap-2.5 rounded-xl bg-[#D4AF37] px-6 text-sm font-bold text-[#050505] shadow-[0_0_28px_rgba(212,175,55,0.35)] hover:bg-[#E6C65B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>
                          {lang === 'ar' ? 'ادخل حفل التقديم الحي' : 'Enter Live Gala Hall'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectFilm(fathersSin)}
                        className="flex h-12 items-center rounded-xl border border-white/15 bg-white/[0.04] px-5 text-sm font-medium text-[#F5F5F0]/85 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {lang === 'ar' ? 'صفحة العمل' : 'Film Page'}
                      </button>
                    </div>
                  </div>
                </section>
              );
            })()}

            {siteSettings.countdownEnabled && siteSettings.countdownTargetIso && (
              <CountdownTimer
                targetIso={siteSettings.countdownTargetIso}
                titleAr={siteSettings.countdownTitleAr}
                titleEn={siteSettings.countdownTitleEn}
                lang={lang}
                variant="banner"
              />
            )}

            {continueWatchingList.length > 0 && (
              <section className="mx-auto max-w-[1440px] px-4 pt-10 pb-4 sm:px-8">
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold tracking-tight text-[#F5F5F0] sm:text-2xl">
                      {lang === 'ar' ? 'أكمل المشاهدة' : 'Continue Watching'}
                    </h2>
                    <p className="text-xs text-[#F5F5F0]/55 sm:text-sm">
                      {lang === 'ar'
                        ? 'استأنف المشاهدة من آخر لحظة توقفت عندها'
                        : 'Resume playback right where you left off'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none sm:gap-5">
                  {continueWatchingList.map(({ film, pct, remainingLabel }) => {
                    const title = lang === 'ar' ? film.titleAr : film.titleEn;
                    const thumbSrc = film.backdropUrl || film.posterUrl;
                    return (
                      <button
                        key={film.id}
                        type="button"
                        onClick={() => setPlayerState({ film, mode: 'film' })}
                        className="group w-[240px] shrink-0 text-start cursor-pointer sm:w-[280px]"
                      >
                        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/[0.08] bg-[#101014] transition-all duration-300 group-hover:border-[#D4AF37]/60">
                          {thumbSrc ? (
                            <img
                              src={thumbSrc}
                              alt={title}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#121216]" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D4AF37]/60 bg-black/70 text-[#D4AF37] transition-transform duration-300 group-hover:scale-110 group-hover:bg-[#D4AF37] group-hover:text-[#050505]">
                              <Play className="h-4 w-4 fill-current" />
                            </span>
                          </div>
                          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                            <div
                              className="h-full bg-[#D4AF37]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <h3 className="truncate text-sm font-semibold text-[#F5F5F0] group-hover:text-[#D4AF37] transition-colors">
                            {title}
                          </h3>
                          <span className="shrink-0 tabular-nums text-[11px] text-[#F5F5F0]/55">
                            {remainingLabel}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <StudioTechnologyStrip
              featuredFilm={heroSlides[0] || featuredFilm}
              lang={lang}
              onLaunchWithPreset={(film, preset) =>
                setPlayerState({ film, mode: 'film', preset })
              }
              onInspectFilm={handleSelectFilm}
            />

            <FilmRowSection
              title={t(lang, 'latestReleases')}
              films={releasedFilms}
              lang={lang}
              onSelectFilm={handleSelectFilm}
              actionLabel={t(lang, 'navLibrary')}
              onAction={() => handleNavigate('library')}
            />

            <FilmRowSection
              title={t(lang, 'originalsSection')}
              subtitle={
                lang === 'ar'
                  ? 'أعمال أصلية من إنتاج استوديو AZ FILMS'
                  : 'Original productions crafted by AZ FILMS Studio'
              }
              films={originalsFilms}
              lang={lang}
              onSelectFilm={handleSelectFilm}
              actionLabel={t(lang, 'navOriginals')}
              onAction={() => handleNavigate('originals')}
            />

            <CinemaUniverseHub
              films={visibleFilms}
              lang={lang}
              defaultViewerName={userProfile?.displayName}
              onStartWatchParty={(film, partyId, isHost) =>
                setPlayerState({
                  film,
                  mode: 'film',
                  watchParty: { partyId, isHost },
                })
              }
              onSelectFilm={handleSelectFilm}
              onOpenPassport={() => setShowPassport(true)}
              onOpenSeatBooking={(film) => setSeatBookingFilm(film)}
            />

            <CinemaFutureLabSection
              films={visibleFilms}
              lang={lang}
              onSelectFilm={handleSelectFilm}
              onLaunchWithSpatialAudio={(film) =>
                setPlayerState({
                  film,
                  mode: 'film',
                  preset: { audioPreset: 'spatial3d', theaterDim: true },
                })
              }
            />

            <AudiencePollSection settings={siteSettings} lang={lang} />

            <FilmRowSection
              title={t(lang, 'comingSoonSection')}
              films={comingSoonFilms}
              lang={lang}
              onSelectFilm={handleSelectFilm}
              actionLabel={t(lang, 'navComingSoon')}
              onAction={() => handleNavigate('coming_soon')}
            />
          </div>
        ) : activeView === 'library' ? (
          <LibraryPage films={visibleFilms} lang={lang} onSelectFilm={handleSelectFilm} />
        ) : activeView === 'originals' ? (
          <OriginalsPage films={visibleFilms} lang={lang} onSelectFilm={handleSelectFilm} />
        ) : activeView === 'coming_soon' ? (
          <ComingSoonPage films={visibleFilms} lang={lang} onSelectFilm={handleSelectFilm} />
        ) : activeView === 'search' ? (
          <SearchPage films={visibleFilms} lang={lang} onSelectFilm={handleSelectFilm} />
        ) : activeView === 'my_list' ? (
          <MyListPage
            films={visibleFilms}
            watchlistIds={watchlistIds}
            user={userProfile}
            lang={lang}
            onSelectFilm={handleSelectFilm}
            onRemoveFromList={handleToggleWatchlist}
            onSignIn={handleSignIn}
          />
        ) : activeView === 'film_details' && selectedFilm ? (
          <FilmDetailsPage
            film={selectedFilm}
            lang={lang}
            inWatchlist={watchlistIds.includes(selectedFilm.id)}
            isAdmin={isAdmin}
            relatedFilms={relatedFilms}
            onBack={() => handleNavigate('library')}
            onWatchFilm={(film, startTimeSec) => {
              if (film.id === 'fathers-sin' && !film.videoUrl?.trim()) {
                setGalaFilm(film);
                return;
              }
              setPlayerState({ film, mode: 'film', startTimeSec });
            }}
            onWatchInHall={(film) =>
              setPlayerState({
                film,
                mode: 'film',
                hallSeat: getSavedBookedSeat(film.id) || 'C5',
                preset: { audioPreset: 'spatial3d', theaterDim: true },
              })
            }
            onOpenFathersSinGala={(film) => setGalaFilm(film)}
            onWatchTrailer={(film) => setPlayerState({ film, mode: 'trailer' })}
            onHostWatchParty={handleHostWatchParty}
            onBookSeat={(film) => setSeatBookingFilm(film)}
            onToggleWatchlist={handleToggleWatchlist}
            onSelectFilm={handleSelectFilm}
          />
        ) : activeView === 'admin' ? (
          <AdminDashboard
            films={films}
            siteSettings={siteSettings}
            currentUser={userProfile}
            isAdmin={isAdmin}
            lang={lang}
          />
        ) : (
          <LibraryPage films={visibleFilms} lang={lang} onSelectFilm={handleSelectFilm} />
        )}
      </main>

      {/* Quiet Luxury Cinema Footer */}
      <footer className="border-t border-white/[0.08] bg-[#050505]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="space-y-1">
            <p className="font-cinema-display text-lg font-semibold tracking-[0.2em] text-[#F5F5F0]">
              AZ FILMS
            </p>
            <p className="text-xs tracking-[0.18em] text-[#D4AF37]/80">
              A PRIVATE WORLD OF CINEMA
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-[#F5F5F0]/55">
            <button
              type="button"
              onClick={() => handleNavigate('library')}
              className="hover:text-[#D4AF37] cursor-pointer"
            >
              {t(lang, 'navLibrary')}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('originals')}
              className="hover:text-[#D4AF37] cursor-pointer"
            >
              {t(lang, 'navOriginals')}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('coming_soon')}
              className="hover:text-[#D4AF37] cursor-pointer"
            >
              {t(lang, 'navComingSoon')}
            </button>
            <button
              type="button"
              onClick={() => setShowPassport(true)}
              className="text-[#D4AF37]/85 hover:text-[#D4AF37] transition-colors cursor-pointer"
            >
              {lang === 'ar' ? 'جواز السينما' : 'Cinema Passport'}
            </button>
            {cleanInstagramHref && (
              <a
                href={cleanInstagramHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#D4AF37]/80 hover:text-[#D4AF37] transition-colors"
              >
                Instagram
              </a>
            )}
            {!userProfile && (
              <button
                type="button"
                onClick={handleSignIn}
                className="text-[#F5F5F0]/30 hover:text-[#D4AF37] transition-colors cursor-pointer"
              >
                {lang === 'ar' ? 'دخول المالك' : 'Owner Sign In'}
              </button>
            )}
            <span className="tabular-nums">© {new Date().getFullYear()} AZ FILMS</span>
          </div>
        </div>
      </footer>

      {/* Cinema Fullscreen / Embedded Video Player */}
      {playerState && (
        <CinemaPlayerModal
          film={playerState.film}
          nextFilm={nextPlayableFilm}
          mode={playerState.mode}
          lang={lang}
          viewerDefaultName={userProfile?.displayName}
          initialPreset={playerState.preset}
          initialTimeSec={playerState.startTimeSec}
          initialWatchParty={playerState.watchParty}
          initialHallSeat={playerState.hallSeat}
          isAdmin={isAdmin}
          onClose={() => setPlayerState(null)}
          onSwitchToTrailer={() =>
            setPlayerState((prev) => (prev ? { ...prev, mode: 'trailer' } : null))
          }
          onPlayNextFilm={(next) => setPlayerState({ film: next, mode: 'film' })}
          onProgressUpdated={() => setProgressTick((v) => v + 1)}
          onOpenSeatBooking={() => setSeatBookingFilm(playerState.film)}
        />
      )}

      {seatBookingFilm && (
        <CinemaSeatBookingModal
          films={visibleFilms}
          initialFilm={seatBookingFilm}
          lang={lang}
          defaultViewerName={userProfile?.displayName}
          onClose={() => setSeatBookingFilm(null)}
          onEnterHall={(film, seatCode) => {
            setSeatBookingFilm(null);
            setPlayerState({
              film,
              mode: 'film',
              hallSeat: seatCode,
              preset: { audioPreset: 'spatial3d', theaterDim: true },
            });
          }}
        />
      )}

      {showPassport && (
        <CinemaPassportModal
          films={visibleFilms}
          lang={lang}
          defaultName={userProfile?.displayName}
          onClose={() => setShowPassport(false)}
          onSelectFilm={(film) => {
            setShowPassport(false);
            handleSelectFilm(film);
          }}
        />
      )}

      {galaFilm && (
        <FathersSinGalaModal
          film={galaFilm}
          lang={lang}
          defaultViewerName={userProfile?.displayName}
          onClose={() => setGalaFilm(null)}
          onOpenFilmDetails={(f) => handleSelectFilm(f)}
        />
      )}

      <CatalogToastContainer
        toasts={catalogToasts}
        lang={lang}
        onDismiss={dismissCatalogToast}
        onSelectFilm={handleSelectFilm}
      />
      <OfflineIndicator lang={lang} />
    </div>
  );
}
