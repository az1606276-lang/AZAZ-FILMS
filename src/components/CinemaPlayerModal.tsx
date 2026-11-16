import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import Hls from 'hls.js';
import {
  Activity,
  AlertCircle,
  Armchair,
  AudioWaveform,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Film as FilmIcon,
  Flame,
  Heart,
  Lightbulb,
  Maximize,
  Maximize2,
  MessageCircle,
  Minimize,
  Palette,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Send,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { t } from '../lib/i18n';
import { startFilmViewSession, updateFilmViewProgress } from '../services/analyticsService';
import { Cinema4kUpscaler } from '../services/cinema4kUpscaler';
import { CinemaAudioEngine, TheatreAmbianceSynth, type CinemaAudioPreset } from '../services/cinemaAudioEngine';
import {
  getSavedViewerCreditName,
  sendFilmPulse,
  sendPresenceHeartbeat,
  subscribeFilmPresenceCount,
  subscribeFilmPulses,
  type FilmPulsePoint,
  type PulseKind,
} from '../services/cinemaPulseService';
import {
  addSceneNote,
  createWatchPartyRoom,
  recordCapturedFrameCount,
  sendWatchPartyMessage,
  stampCompletedFilm,
  subscribeSceneNotes,
  subscribeWatchPartyMessages,
  subscribeWatchPartyRoom,
  updateWatchPartyPlayback,
  type SceneTimecodeNote,
  type WatchPartyChatMessage,
} from '../services/cinemaUniverseService';
import {
  AUDITORIUM_COLS,
  AUDITORIUM_ROWS,
  getSavedBookedSeat,
  getSeatPerspective,
  saveLocalBookedSeat,
  subscribeFilmSeatBookings,
  type SeatBooking,
} from '../services/cinemaHallService';
import {
  clearWatchProgress,
  getWatchProgress,
  saveWatchProgress,
} from '../services/watchProgressService';
import type { AppLanguage, Film, VideoQuality } from '../types/cinema';
import { PersonalizedEndCredits } from './PersonalizedEndCredits';
import type { PlayerLaunchPreset } from './StudioTechnologyStrip';

export type CinemaFilterMode =
  | 'original'
  | 'imax_70mm'
  | 'teal_orange'
  | 'noir_1941'
  | 'grain_35mm'
  | 'nordic_cold';

export type CinemaAspectMode = '16_9' | 'scope_239' | 'imax_full';

interface CinemaPlayerModalProps {
  film: Film;
  nextFilm?: Film | null;
  mode: 'film' | 'trailer';
  lang: AppLanguage;
  viewerDefaultName?: string;
  initialPreset?: PlayerLaunchPreset | null;
  initialTimeSec?: number;
  initialWatchParty?: { partyId: string; isHost: boolean } | null;
  initialHallSeat?: string | null;
  isAdmin?: boolean;
  onClose: () => void;
  onSwitchToTrailer?: () => void;
  onPlayNextFilm?: (next: Film) => void;
  onProgressUpdated?: () => void;
  onOpenSeatBooking?: () => void;
}

const COLOR_GRADES: {
  id: CinemaFilterMode;
  labelAr: string;
  labelEn: string;
  cssFilter: string;
  canvasFilter: string;
  grain: boolean;
}[] = [
  {
    id: 'original',
    labelAr: 'الأصلي (HDR)',
    labelEn: 'Master HDR',
    cssFilter: 'none',
    canvasFilter: 'none',
    grain: false,
  },
  {
    id: 'imax_70mm',
    labelAr: 'IMAX 70mm',
    labelEn: 'IMAX 70mm',
    cssFilter: 'contrast(1.1) saturate(1.12) sepia(0.08) brightness(1.02)',
    canvasFilter: 'contrast(1.1) saturate(1.12) sepia(0.08) brightness(1.02)',
    grain: false,
  },
  {
    id: 'teal_orange',
    labelAr: 'سينما هوليوود',
    labelEn: 'Teal & Gold',
    cssFilter: 'contrast(1.14) saturate(1.16) hue-rotate(-6deg)',
    canvasFilter: 'contrast(1.14) saturate(1.16) hue-rotate(-6deg)',
    grain: false,
  },
  {
    id: 'noir_1941',
    labelAr: '1941 Noir',
    labelEn: '1941 Noir',
    cssFilter: 'grayscale(1) contrast(1.24) brightness(0.95) sepia(0.1)',
    canvasFilter: 'grayscale(1) contrast(1.24) brightness(0.95) sepia(0.1)',
    grain: true,
  },
  {
    id: 'grain_35mm',
    labelAr: 'حبيبات 35mm',
    labelEn: '35mm Kodak',
    cssFilter: 'sepia(0.16) contrast(1.09) saturate(0.92)',
    canvasFilter: 'sepia(0.16) contrast(1.09) saturate(0.92)',
    grain: true,
  },
  {
    id: 'nordic_cold',
    labelAr: 'تشويق بارد',
    labelEn: 'Nordic Cold',
    cssFilter: 'contrast(1.12) saturate(0.84) brightness(0.97) hue-rotate(8deg)',
    canvasFilter: 'contrast(1.12) saturate(0.84) brightness(0.97) hue-rotate(8deg)',
    grain: false,
  },
];

const AUDIO_PRESETS: { id: CinemaAudioPreset; labelAr: string; labelEn: string }[] = [
  { id: 'studio', labelAr: 'الأصلي (Studio)', labelEn: 'Studio Flat' },
  { id: 'imax', labelAr: 'IMAX Sub-Bass', labelEn: 'IMAX Sub-Harmonic' },
  { id: 'dialogue', labelAr: 'وضوح الحوار', labelEn: 'Dialogue Focus' },
  { id: 'midnight', labelAr: 'المسرح الليلي', labelEn: 'Midnight Theatre' },
  { id: 'spatial3d', labelAr: 'قاعة عرض 3D', labelEn: '3D Spatial Hall' },
];

function playVelvetCurtainSound(opening: boolean): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const dur = 1.15;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.45;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(opening ? 220 : 520, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(opening ? 640 : 180, ctx.currentTime + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + dur);

    // Warm sub-bass theatrical curtain latch thump
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(opening ? 76 : 64, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(34, ctx.currentTime + 0.35);
    oscGain.gain.setValueAtTime(0.08, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + 0.35);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1400);
  } catch {
    // Ignore autoplay restriction
  }
}

function playCountdownPip(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    window.setTimeout(() => ctx.close().catch(() => {}), 200);
  } catch {
    // Ignore
  }
}

const HALL_CEILING_STARS = Array.from({ length: 38 }, (_, i) => ({
  id: i,
  left: ((i * 19.7 + 7) % 94) + 3,
  top: ((i * 11.3 + 4) % 24) + 2,
  size: i % 4 === 0 ? 2.5 : i % 2 === 0 ? 1.8 : 1.2,
  opacity: 0.25 + (i % 5) * 0.14,
}));

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getEmbedUrl(rawUrl: string): string | null {
  const url = rawUrl.trim();
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&playsinline=1`;
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  return null;
}

export function CinemaPlayerModal({
  film,
  nextFilm,
  mode,
  lang,
  viewerDefaultName,
  initialPreset,
  initialTimeSec,
  initialWatchParty,
  initialHallSeat,
  isAdmin = false,
  onClose,
  onSwitchToTrailer,
  onPlayNextFilm,
  onProgressUpdated,
  onOpenSeatBooking,
}: CinemaPlayerModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const grainCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioEngineRef = useRef<CinemaAudioEngine | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastPreviewSeekRef = useRef<number>(0);

  const viewSessionIdRef = useRef<string | null>(null);
  const viewStartedRef = useRef<boolean>(false);
  const completedMarkedRef = useRef<boolean>(false);
  const maxWatchedRef = useRef<number>(0);
  const lastSyncRef = useRef<number>(0);

  const baseStreamUrl = mode === 'film' ? film.videoUrl : film.trailerUrl;
  const extraQualities =
    mode === 'film'
      ? (film.videoQualities || []).filter((q) => q.url && q.url.trim())
      : [];
  const primaryUrlFor4k = baseStreamUrl || extraQualities[0]?.url || '';
  const qualities: VideoQuality[] = primaryUrlFor4k
    ? [
        { label: '4K UHD', url: primaryUrlFor4k },
        ...extraQualities.filter(
          (q) => q.url !== primaryUrlFor4k && !/4k|2160|uhd/i.test(q.label)
        ),
        {
          label: lang === 'ar' ? 'الأصلية (Source)' : 'Source Master',
          url: primaryUrlFor4k,
        },
      ]
    : [];

  const [selectedQuality, setSelectedQuality] = useState<VideoQuality | null>(
    qualities[0] || null
  );
  const [webgl4kUnsupported, setWebgl4kUnsupported] = useState(false);
  const [upscale4kStats, setUpscale4kStats] = useState<{ w: number; h: number } | null>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isIOSDevice =
    typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent);
  const [showControls, setShowControls] = useState(true);
  const [useNativeControls, setUseNativeControls] = useState(isIOSDevice);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const [ambilightEnabled, setAmbilightEnabled] = useState(true);
  const [capturedFrameUrl, setCapturedFrameUrl] = useState<string | null>(null);
  const [capturedFrameTime, setCapturedFrameTime] = useState<string>('00:00');
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Studio Mastering Controls
  const [cinemaFilter, setCinemaFilter] = useState<CinemaFilterMode>(
    initialPreset?.colorGrade || 'original'
  );
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [aspectMode, setAspectMode] = useState<CinemaAspectMode>(
    initialPreset?.aspectMode || '16_9'
  );
  const [audioPreset, setAudioPreset] = useState<CinemaAudioPreset>(
    initialPreset?.audioPreset || 'studio'
  );
  const [audioConnected, setAudioConnected] = useState(false);
  const [audioRestrictedMsg, setAudioRestrictedMsg] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [theaterDim, setTheaterDim] = useState(Boolean(initialPreset?.theaterDim));
  const [showDirectorDeck, setShowDirectorDeck] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [hoverScrub, setHoverScrub] = useState<{
    time: number;
    pct: number;
    hasFrame: boolean;
    pulseHits: number;
  } | null>(null);

  const [activeViewersCount, setActiveViewersCount] = useState<number>(1);
  const [pulses, setPulses] = useState<FilmPulsePoint[]>([]);
  const [floatingPulse, setFloatingPulse] = useState<{ kind: PulseKind; key: number } | null>(null);
  const [showEndCredits, setShowEndCredits] = useState(false);

  // Watch Party & Scene Notes States
  const [watchParty, setWatchParty] = useState<{ partyId: string; isHost: boolean } | null>(
    initialWatchParty || null
  );
  const [showPartyLounge, setShowPartyLounge] = useState(Boolean(initialWatchParty));
  const [partyMessages, setPartyMessages] = useState<WatchPartyChatMessage[]>([]);
  const [partyMsgInput, setPartyMsgInput] = useState('');
  const [copiedPartyLink, setCopiedPartyLink] = useState(false);
  const [sceneNotes, setSceneNotes] = useState<SceneTimecodeNote[]>([]);
  const [showSceneNotesOverlay, setShowSceneNotesOverlay] = useState(true);
  const [quickSceneNote, setQuickSceneNote] = useState('');

  // Next-Era Cinema Innovations: Split-Grade Curtain, 3D Seat Panning, 35mm Contact Sheet Studio
  const [splitCompare, setSplitCompare] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  const [seatPan, setSeatPan] = useState(0);
  const [seatDepth, setSeatDepth] = useState(0.35);
  const [stripFrames, setStripFrames] = useState<{ dataUrl: string; timecode: string }[]>([]);
  const [stripSheetUrl, setStripSheetUrl] = useState<string | null>(null);
  const lastRawFrameRef = useRef<{ dataUrl: string; timecode: string } | null>(null);
  const draggingSplitRef = useRef(false);

  // Real 3D Cinema Hall Mode (seat perspective + spatial acoustics + live interior theater)
  const [hallMode, setHallMode] = useState<boolean>(Boolean(initialHallSeat));
  const [hallSeat, setHallSeat] = useState<string>(
    () => initialHallSeat || getSavedBookedSeat(film.id) || 'C5'
  );
  const [hallParallax, setHallParallax] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [curtainOpen, setCurtainOpen] = useState<boolean>(false);
  const [hallBookings, setHallBookings] = useState<SeatBooking[]>([]);
  const [hallAmbianceOn, setHallAmbianceOn] = useState<boolean>(false);
  const [showHallSeatsDrawer, setShowHallSeatsDrawer] = useState<boolean>(false);
  const [hallCamera, setHallCamera] = useState<'seat' | 'vip_box' | 'imax_dome'>('seat');
  const [hallLights, setHallLights] = useState<'warm' | 'cinema' | 'blackout'>('cinema');
  const [hallGlowRgb, setHallGlowRgb] = useState<string>('212, 175, 55');
  const [leaderCount, setLeaderCount] = useState<number | null>(null);
  const [entrancePhase, setEntrancePhase] = useState<
    'black' | 'flicker' | 'curtains' | 'dissolve' | 'done'
  >('black');
  const [entranceTilt, setEntranceTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fourDxAtmos, setFourDxAtmos] = useState<'dust' | 'embers' | 'rain' | 'mist' | 'off'>('dust');
  const [fourDxMotion, setFourDxMotion] = useState<boolean>(Boolean(initialHallSeat));
  const [fourDxRecoil, setFourDxRecoil] = useState<{
    x: number;
    y: number;
    scale: number;
    shockKey: number;
  }>({ x: 0, y: 0, scale: 1, shockKey: 0 });
  const [showLivePrism, setShowLivePrism] = useState<boolean>(false);
  const [livePrismSwatches, setLivePrismSwatches] = useState<string[]>([
    '#D4AF37',
    '#8B5E1A',
    '#2A1F18',
    '#15151C',
    '#E6C65B',
  ]);
  const [liveWaveBars, setLiveWaveBars] = useState<number[]>(() =>
    Array.from({ length: 16 }, () => 0.28)
  );
  const [copiedSwatch, setCopiedSwatch] = useState<string | null>(null);
  const [seatSparks, setSeatSparks] = useState<
    { id: number; leftPct: number; color: string; delayMs: number }[]
  >([]);
  const seatPerspective = getSeatPerspective(hallSeat);

  const ambilightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const floorMirrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectorDustCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const upscale4kCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const upscaler4kRef = useRef<Cinema4kUpscaler | null>(null);
  const hallAmbianceRef = useRef<TheatreAmbianceSynth | null>(null);
  const hallGlowRgbRef = useRef<string>('212, 175, 55');
  const prevFrameLumaRef = useRef<number>(0);
  const lastShockTsRef = useRef<number>(0);
  const recoilResetTimerRef = useRef<number | null>(null);
  const curtainTimerRef = useRef<number | null>(null);
  const leaderTimerRef = useRef<number | null>(null);
  const entranceTimersRef = useRef<number[]>([]);
  const resumeAppliedRef = useRef<boolean>(false);
  const lastPartyPushRef = useRef<number>(0);

  hallGlowRgbRef.current = hallGlowRgb;

  const activeUrl = selectedQuality?.url?.trim() || '';
  const embedUrl = activeUrl ? getEmbedUrl(activeUrl) : null;
  const hasStream = activeUrl.length > 0;
  const is4kQualitySelected = selectedQuality ? /4k|2160|uhd/i.test(selectedQuality.label) : true;
  const is4kUpscaleActive =
    hasStream &&
    !embedUrl &&
    !videoError &&
    !useNativeControls &&
    !splitCompare &&
    !webgl4kUnsupported &&
    is4kQualitySelected;
  const primaryTitle = lang === 'ar' ? film.titleAr : film.titleEn;
  const activeGrade = COLOR_GRADES.find((g) => g.id === cinemaFilter) || COLOR_GRADES[0];

  const clearEntranceTimers = () => {
    entranceTimersRef.current.forEach((id) => window.clearTimeout(id));
    entranceTimersRef.current = [];
  };

  const runEntranceSequence = (autoPlayOnReveal = false) => {
    clearEntranceTimers();
    if (!hasStream || embedUrl || videoError) {
      setEntrancePhase('done');
      return;
    }
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setEntrancePhase('done');
      if (autoPlayOnReveal) {
        videoRef.current?.play().catch(() => {
          setUseNativeControls(true);
        });
      }
      return;
    }

    setEntrancePhase('black');
    const t1 = window.setTimeout(() => {
      setEntrancePhase('flicker');
    }, 280);
    const t2 = window.setTimeout(() => {
      setEntrancePhase('curtains');
      if (autoPlayOnReveal) {
        playVelvetCurtainSound(true);
      }
    }, 1250);
    const t3 = window.setTimeout(() => {
      setEntrancePhase('dissolve');
      if (autoPlayOnReveal) {
        videoRef.current?.play().catch(() => {
          setUseNativeControls(true);
        });
      }
    }, 2400);
    const t4 = window.setTimeout(() => {
      setEntrancePhase('done');
    }, 2920);
    entranceTimersRef.current = [t1, t2, t3, t4];
  };

  const openCurtainsAndPlayNow = () => {
    clearEntranceTimers();
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (audioPreset !== 'studio') {
      ensureAudioEngineConnected();
    }
    if (videoRef.current?.paused) {
      videoRef.current.play().catch(() => {
        setUseNativeControls(true);
      });
    }

    if (prefersReduced || entrancePhase === 'curtains' || entrancePhase === 'dissolve') {
      setEntrancePhase('done');
      return;
    }

    playVelvetCurtainSound(true);
    setEntrancePhase('curtains');
    const tDissolve = window.setTimeout(() => setEntrancePhase('dissolve'), 780);
    const tDone = window.setTimeout(() => setEntrancePhase('done'), 1280);
    entranceTimersRef.current = [tDissolve, tDone];
  };

  useEffect(() => {
    setSelectedQuality(qualities[0] || null);
    setWebgl4kUnsupported(false);
    setUpscale4kStats(null);
    setVideoError(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setUpNextCountdown(null);
    setShowEndCredits(false);
    setLoopA(null);
    setLoopB(null);
    setPlaybackRate(1);
    setWatchParty(initialWatchParty || null);
    setShowPartyLounge(Boolean(initialWatchParty));
    setHallMode(Boolean(initialHallSeat));
    setHallSeat(initialHallSeat || getSavedBookedSeat(film.id) || 'C5');
    setShowHallSeatsDrawer(false);
    setLeaderCount(null);
    resumeAppliedRef.current = false;
    viewStartedRef.current = false;
    completedMarkedRef.current = false;
    maxWatchedRef.current = 0;
    viewSessionIdRef.current = null;
  }, [film.id, mode, initialHallSeat]);

  // Real-time WebGL 4K UHD (3840x2160) Super-Resolution Renderer
  useEffect(() => {
    if (!is4kUpscaleActive) {
      upscaler4kRef.current?.dispose();
      upscaler4kRef.current = null;
      return;
    }
    const canvas = upscale4kCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const engine = new Cinema4kUpscaler(canvas, {
      sharpness: 0.7,
      onUnsupported: () => {
        setWebgl4kUnsupported(true);
      },
      onStats: (stats) => {
        setUpscale4kStats({ w: stats.targetWidth, h: stats.targetHeight });
      },
    });
    upscaler4kRef.current = engine;
    engine.startLoop(video);

    return () => {
      engine.dispose();
      if (upscaler4kRef.current === engine) {
        upscaler4kRef.current = null;
      }
    };
  }, [is4kUpscaleActive, activeUrl]);

  // Fade-to-Black + Ambient Gold Dimmer Flicker + Curved Velvet Curtain Opening Ceremony
  useEffect(() => {
    runEntranceSequence(false);
    return () => {
      clearEntranceTimers();
    };
  }, [film.id, mode, hasStream, embedUrl, videoError]);

  // Automatically align 3D Spatial Audio seat & theatre dimming when Real Cinema Hall Mode is active
  useEffect(() => {
    if (!hallMode) return;
    const persp = getSeatPerspective(hallSeat);
    setSeatPan(persp.pan);
    setSeatDepth(persp.depth);
    setAudioPreset('spatial3d');
    audioEngineRef.current?.setSpatialSeat(persp.pan, persp.depth);
  }, [hallMode, hallSeat]);

  const toggleHallCurtains = (nextOpen?: boolean) => {
    if (curtainTimerRef.current) {
      window.clearTimeout(curtainTimerRef.current);
      curtainTimerRef.current = null;
    }
    setCurtainOpen((prev) => {
      const target = typeof nextOpen === 'boolean' ? nextOpen : !prev;
      if (target !== prev) {
        playVelvetCurtainSound(target);
      }
      if (!target) {
        setHallLights('warm');
        videoRef.current?.pause();
      } else {
        setHallLights((cur) => (cur === 'warm' ? 'cinema' : cur));
      }
      return target;
    });
  };

  const launch35mmOpeningCeremony = () => {
    if (leaderTimerRef.current) {
      window.clearInterval(leaderTimerRef.current);
      leaderTimerRef.current = null;
    }
    setHallLights('cinema');
    if (audioPreset !== 'studio') {
      ensureAudioEngineConnected();
    }
    if (!curtainOpen) {
      playVelvetCurtainSound(true);
      setCurtainOpen(true);
    }
    let count = 3;
    setLeaderCount(count);
    playCountdownPip();
    leaderTimerRef.current = window.setInterval(() => {
      count -= 1;
      if (count >= 1) {
        setLeaderCount(count);
        playCountdownPip();
      } else {
        if (leaderTimerRef.current) window.clearInterval(leaderTimerRef.current);
        leaderTimerRef.current = null;
        setLeaderCount(null);
        videoRef.current?.play().catch(() => {
          setUseNativeControls(true);
        });
      }
    }, 900);
  };

  // Velvet Curtain Ceremony + Hall Seat Reservations subscription + Ambiance cleanup
  useEffect(() => {
    if (!hallMode || mode !== 'film') {
      setCurtainOpen(false);
      setHallParallax({ x: 0, y: 0 });
      setShowHallSeatsDrawer(false);
      setLeaderCount(null);
      if (curtainTimerRef.current) window.clearTimeout(curtainTimerRef.current);
      if (leaderTimerRef.current) window.clearInterval(leaderTimerRef.current);
      hallAmbianceRef.current?.stop();
      setHallAmbianceOn(false);
      return;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setCurtainOpen(true);
    } else {
      setCurtainOpen(false);
      // Pause cleanly so viewer clearly sees crimson curtains closed, then smoothly glide open!
      curtainTimerRef.current = window.setTimeout(() => {
        setCurtainOpen(true);
        playVelvetCurtainSound(true);
      }, 650);
    }

    const unsubBookings = subscribeFilmSeatBookings(film.id, setHallBookings);
    return () => {
      if (curtainTimerRef.current) {
        window.clearTimeout(curtainTimerRef.current);
        curtainTimerRef.current = null;
      }
      if (leaderTimerRef.current) {
        window.clearInterval(leaderTimerRef.current);
        leaderTimerRef.current = null;
      }
      unsubBookings();
    };
  }, [hallMode, mode, film.id]);

  // Volumetric Live-RGB Projector Beam + 4DX Atmosphere Physics Engine (Dust / Embers / Rain / Mist)
  const showVolumetricStage =
    (hallMode && fourDxAtmos !== 'off') ||
    (!hallMode && fourDxAtmos !== 'off' && fourDxAtmos !== 'dust');

  useEffect(() => {
    if (!showVolumetricStage || embedUrl || !hasStream || videoError) return;
    const canvas = projectorDustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const particles = Array.from({ length: 48 }, (_, i) => ({
      x: (i * 0.043 + 0.08) % 1,
      y: (i * 0.067 + 0.05) % 1,
      r: 0.9 + (i % 4) * 0.65,
      speed: 0.45 + (i % 5) * 0.22,
      phase: i * 0.7,
      alpha: 0.22 + (i % 4) * 0.12,
    }));

    let rafId = 0;
    let lastTick = 0;
    let tickCount = 0;

    const drawStageAtmosphere = (animate: boolean) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const rgb = hallGlowRgbRef.current || '212, 175, 55';
      const gateBreath = animate && isPlaying ? 0.92 + Math.sin(tickCount * 0.35) * 0.08 : 0.85;

      // Real-time RGB-reactive volumetric projector cone slicing down from rear port
      if (hallMode || fourDxAtmos === 'mist') {
        const beamGrad = ctx.createLinearGradient(w * 0.5, 0, w * 0.5, h * 0.86);
        beamGrad.addColorStop(0, `rgba(${rgb}, ${(0.22 * gateBreath).toFixed(3)})`);
        beamGrad.addColorStop(0.45, `rgba(${rgb}, ${(0.09 * gateBreath).toFixed(3)})`);
        beamGrad.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(w * 0.465, 0);
        ctx.lineTo(w * 0.535, 0);
        ctx.lineTo(w * 0.92, h * 0.84);
        ctx.lineTo(w * 0.08, h * 0.84);
        ctx.closePath();
        ctx.fill();
      }

      if (prefersReduced) return;

      for (const p of particles) {
        if (animate) {
          if (fourDxAtmos === 'embers') {
            p.y -= 0.0042 * p.speed;
            p.x += Math.sin(tickCount * 0.08 + p.phase) * 0.0022;
            if (p.y < -0.04) {
              p.y = 1.04;
              p.x = (p.x + 0.37) % 1;
            }
          } else if (fourDxAtmos === 'rain') {
            p.y += 0.026 * p.speed;
            p.x -= 0.0055 * p.speed;
            if (p.y > 1.05) {
              p.y = -0.05;
              p.x = (p.x + 1.29) % 1;
            }
          } else if (fourDxAtmos === 'mist') {
            p.x += 0.0014 * p.speed;
            if (p.x > 1.15) p.x = -0.15;
          } else {
            // classic golden dust drifting inside beam
            p.x += Math.cos(p.phase + tickCount * 0.03) * 0.0005;
            p.y += 0.00085 * p.speed;
            if (p.y > 0.85) p.y = 0.03;
          }
        }

        const px = p.x * w;
        const py = p.y * h;

        if (fourDxAtmos === 'embers') {
          const glow = ctx.createRadialGradient(px, py, 0, px, py, p.r * 3.6);
          glow.addColorStop(0, `rgba(255, 224, 130, ${Math.min(0.95, p.alpha + 0.25)})`);
          glow.addColorStop(0.45, `rgba(245, 130, 42, ${p.alpha})`);
          glow.addColorStop(1, 'rgba(245, 90, 20, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(px, py, p.r * 3.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (fourDxAtmos === 'rain') {
          ctx.strokeStyle = `rgba(${rgb}, ${Math.min(0.65, p.alpha + 0.18)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - 4.5, py + 15 * p.speed);
          ctx.stroke();
        } else if (fourDxAtmos === 'mist') {
          const radius = 34 + p.r * 24;
          const mistGrad = ctx.createRadialGradient(px, py, 0, px, py, radius);
          mistGrad.addColorStop(0, `rgba(${rgb}, 0.055)`);
          mistGrad.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = mistGrad;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const halfSpread = 0.035 + p.y * 0.44;
          if (Math.abs(p.x - 0.5) <= halfSpread) {
            ctx.fillStyle = `rgba(${rgb}, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(px, py, p.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      tickCount += 1;
    };

    drawStageAtmosphere(false);
    if (prefersReduced) return;

    const tick = (now: number) => {
      if (now - lastTick >= 38) {
        lastTick = now;
        drawStageAtmosphere(isPlaying || fourDxAtmos !== 'dust');
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [showVolumetricStage, hallMode, fourDxAtmos, isPlaying, embedUrl, hasStream, videoError]);

  // Subscribe to Scene Notes for margin annotations
  useEffect(() => {
    const unsub = subscribeSceneNotes(film.id, setSceneNotes);
    return () => unsub();
  }, [film.id]);

  // Watch Party Sync Subscription (Guest follows Host + Live Lounge Chat)
  useEffect(() => {
    if (!watchParty?.partyId) {
      setPartyMessages([]);
      return;
    }
    const unsubRoom = subscribeWatchPartyRoom(watchParty.partyId, (room) => {
      if (!room || !room.isActive || watchParty.isHost) return;
      const video = videoRef.current;
      if (!video) return;
      if (Math.abs((video.currentTime || 0) - room.playbackTime) > 2.5) {
        video.currentTime = room.playbackTime;
      }
      if (room.isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!room.isPlaying && !video.paused) {
        video.pause();
      }
    });
    const unsubMsgs = subscribeWatchPartyMessages(watchParty.partyId, setPartyMessages);
    return () => {
      unsubRoom();
      unsubMsgs();
    };
  }, [watchParty?.partyId, watchParty?.isHost]);

  // Apply initial preset if launched from Signature Projection Suite
  useEffect(() => {
    if (!initialPreset) return;
    if (initialPreset.colorGrade) setCinemaFilter(initialPreset.colorGrade);
    if (initialPreset.aspectMode) setAspectMode(initialPreset.aspectMode);
    if (initialPreset.audioPreset) setAudioPreset(initialPreset.audioPreset);
    if (typeof initialPreset.theaterDim === 'boolean') setTheaterDim(initialPreset.theaterDim);
  }, [initialPreset]);

  // Dispose Web Audio engine & hall ambiance on modal unmount
  useEffect(() => {
    return () => {
      audioEngineRef.current?.dispose();
      audioEngineRef.current = null;
      hallAmbianceRef.current?.stop();
      hallAmbianceRef.current = null;
    };
  }, []);

  // Sync audio preset whenever changed
  useEffect(() => {
    audioEngineRef.current?.applyPreset(audioPreset);
  }, [audioPreset]);

  // Sync playback rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Live Shared Presence Pulse & Emotional Film Heartbeat Graph subscriptions
  useEffect(() => {
    sendPresenceHeartbeat(film.id, true);
    const heartbeat = window.setInterval(() => {
      sendPresenceHeartbeat(film.id, true);
    }, 20000);
    const unsubPresence = subscribeFilmPresenceCount(film.id, setActiveViewersCount);
    const unsubPulses = subscribeFilmPulses(film.id, setPulses);

    return () => {
      window.clearInterval(heartbeat);
      unsubPresence();
      unsubPulses();
      sendPresenceHeartbeat(film.id, false);
    };
  }, [film.id]);

  useEffect(() => {
    if (upNextCountdown === null || !nextFilm || !onPlayNextFilm) return;
    if (upNextCountdown <= 0) {
      onPlayNextFilm(nextFilm);
      return;
    }
    const timer = window.setTimeout(() => {
      setUpNextCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [upNextCountdown, nextFilm, onPlayNextFilm]);

  useEffect(() => {
    if (embedUrl) {
      if (mode === 'film' && !viewStartedRef.current) {
        viewStartedRef.current = true;
        startFilmViewSession(film.id, film.durationSeconds || 0).then((id) => {
          viewSessionIdRef.current = id;
        });
      }
      return;
    }

    const video = videoRef.current;
    if (!video || !activeUrl) return;

    setVideoError(null);
    setAudioRestrictedMsg(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const resumeAt = currentTime > 1 ? currentTime : 0;

    if (activeUrl.toLowerCase().includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(activeUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resumeAt > 0) video.currentTime = resumeAt;
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setVideoError(
            lang === 'ar'
              ? 'تعذر تحميل بث الفيديو. تحقق من مصدر الملف.'
              : 'Unable to load video stream. Please verify the media source.'
          );
        }
      });
    } else {
      video.src = activeUrl;
      video.load();
      if (resumeAt > 0) {
        const onLoaded = () => {
          video.currentTime = resumeAt;
          video.removeEventListener('loadedmetadata', onLoaded);
        };
        video.addEventListener('loadedmetadata', onLoaded);
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeUrl, embedUrl]);

  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (mode === 'film' && video && video.duration > 10) {
        saveWatchProgress(film.id, video.currentTime || 0, video.duration);
        onProgressUpdated?.();
      }
      if (viewSessionIdRef.current && mode === 'film') {
        updateFilmViewProgress(
          viewSessionIdRef.current,
          maxWatchedRef.current,
          video?.duration || film.durationSeconds || 0,
          completedMarkedRef.current,
          completedMarkedRef.current
        );
      }
    };
  }, [film.id, film.durationSeconds, mode]);

  useEffect(() => {
    const handleFs = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        if (capturedFrameUrl) {
          setCapturedFrameUrl(null);
          return;
        }
        onClose();
      } else if (e.key === ' ' && hasStream && !embedUrl && !capturedFrameUrl) {
        e.preventDefault();
        togglePlay();
      } else if ((e.key === 'f' || e.key === 'F') && hasStream && !embedUrl) {
        toggleFullscreen();
      } else if ((e.key === 'm' || e.key === 'M') && hasStream && !embedUrl) {
        toggleMute();
      } else if (e.key === 'ArrowRight' && hasStream && !embedUrl) {
        if (!isPlaying) {
          stepFrame(1);
        } else {
          seekBy(10);
        }
      } else if (e.key === 'ArrowLeft' && hasStream && !embedUrl) {
        if (!isPlaying) {
          stepFrame(-1);
        } else {
          seekBy(-10);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasStream, embedUrl, isPlaying, isMuted, capturedFrameUrl]);

  // Real-time Cinema Ambilight, Mirror Floor Reflection, 4DX Bass Recoil & Live Chromatic Prism Sampler
  useEffect(() => {
    const needsSampler =
      ambilightEnabled || hallMode || fourDxMotion || showLivePrism || fourDxAtmos !== 'off';
    if (!needsSampler || embedUrl || !hasStream || videoError) return;
    let rafId = 0;
    let lastDraw = 0;
    let lastTelemetrySample = 0;

    const toHex = (v: number) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const tick = (now: number) => {
      const video = videoRef.current;
      const canvas = ambilightCanvasRef.current;
      if (video && canvas && video.readyState >= 2 && now - lastDraw >= 90) {
        lastDraw = now;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Real-time obsidian floor mirror canvas update in Hall Mode
            if (hallMode && floorMirrorCanvasRef.current) {
              const mirrorCtx = floorMirrorCanvasRef.current.getContext('2d');
              if (mirrorCtx) {
                mirrorCtx.drawImage(
                  video,
                  0,
                  0,
                  floorMirrorCanvasRef.current.width,
                  floorMirrorCanvasRef.current.height
                );
              }
            }

            if (now - lastTelemetrySample >= 160) {
              lastTelemetrySample = now;
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              const cw = canvas.width;
              const ch = canvas.height;

              // Center bounce color for sconces, projector beam & seat rim highlights
              const midIdx = (Math.floor(ch / 2) * cw + Math.floor(cw / 2)) * 4;
              const mr = Math.min(255, Math.max(70, imgData[midIdx]));
              const mg = Math.min(255, Math.max(60, imgData[midIdx + 1]));
              const mb = Math.min(255, Math.max(50, imgData[midIdx + 2]));
              setHallGlowRgb(`${mr}, ${mg}, ${mb}`);

              // 4DX Kinetic Motion Detector (frame luminance flux + sub-bass energy)
              let lumaSum = 0;
              let lumaSamples = 0;
              for (let i = 0; i < imgData.length; i += 24) {
                lumaSum += (imgData[i] * 0.299 + imgData[i + 1] * 0.587 + imgData[i + 2] * 0.114) / 255;
                lumaSamples += 1;
              }
              const avgLuma = lumaSamples > 0 ? lumaSum / lumaSamples : 0;
              const deltaLuma = Math.abs(avgLuma - prevFrameLumaRef.current);
              prevFrameLumaRef.current = avgLuma;

              const bassLevels = audioEngineRef.current?.getSpectrumLevels(6);
              const subBass = bassLevels ? (bassLevels[0] + bassLevels[1]) * 0.5 : 0;
              const kineticEnergy = deltaLuma * 2.4 + subBass * 0.65;

              if (
                fourDxMotion &&
                !prefersReduced &&
                isPlaying &&
                kineticEnergy > 0.24 &&
                now - lastShockTsRef.current > 280
              ) {
                lastShockTsRef.current = now;
                const mag = Math.min(1, kineticEnergy);
                const rx = Number((((Math.random() - 0.5) * 2) * 2.8 * mag).toFixed(2));
                const ry = Number((((Math.random() - 0.5) * 2) * 2.4 * mag).toFixed(2));
                setFourDxRecoil({
                  x: rx,
                  y: ry,
                  scale: Number((1 + 0.006 * mag).toFixed(4)),
                  shockKey: Date.now(),
                });
                if (mag > 0.55 && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                  navigator.vibrate(14);
                }
                if (recoilResetTimerRef.current) window.clearTimeout(recoilResetTimerRef.current);
                recoilResetTimerRef.current = window.setTimeout(() => {
                  setFourDxRecoil((prev) => ({ ...prev, x: 0, y: 0, scale: 1 }));
                }, 150);
              }

              // Live Director's 5-Color Chromatic Frame DNA & 16-Bar Waveform
              if (showLivePrism) {
                const pts = [
                  [Math.floor(cw * 0.18), Math.floor(ch * 0.28)],
                  [Math.floor(cw * 0.82), Math.floor(ch * 0.28)],
                  [Math.floor(cw * 0.5), Math.floor(ch * 0.5)],
                  [Math.floor(cw * 0.22), Math.floor(ch * 0.74)],
                  [Math.floor(cw * 0.78), Math.floor(ch * 0.74)],
                ];
                const nextSwatches = pts.map(([sx, sy]) => {
                  const pIdx = (sy * cw + sx) * 4;
                  return `#${toHex(imgData[pIdx])}${toHex(imgData[pIdx + 1])}${toHex(imgData[pIdx + 2])}`;
                });
                setLivePrismSwatches(nextSwatches);

                const bars: number[] = [];
                for (let b = 0; b < 16; b++) {
                  const colX = Math.floor(((b + 0.5) / 16) * cw);
                  const rowY = Math.floor(ch * 0.5);
                  const bIdx = (rowY * cw + colX) * 4;
                  const lum =
                    (imgData[bIdx] * 0.299 + imgData[bIdx + 1] * 0.587 + imgData[bIdx + 2] * 0.114) / 255;
                  bars.push(Math.max(0.14, Math.min(1, lum * 1.15)));
                }
                setLiveWaveBars(bars);
              }
            }
          } catch {
            // Cross-origin video without CORS headers keeps warm gold bounce
          }
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      if (recoilResetTimerRef.current) window.clearTimeout(recoilResetTimerRef.current);
    };
  }, [
    ambilightEnabled,
    hallMode,
    fourDxMotion,
    showLivePrism,
    fourDxAtmos,
    isPlaying,
    embedUrl,
    hasStream,
    videoError,
    activeUrl,
  ]);

  // Animated 35mm Optical Celluloid Grain Canvas (only runs when celluloid grade active)
  useEffect(() => {
    if (!activeGrade.grain || embedUrl || videoError) return;
    const canvas = grainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastFrame = 0;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.createImageData(w, h);
    const buf = new Uint32Array(imgData.data.buffer);

    const renderGrain = (now: number) => {
      if (now - lastFrame >= 65) {
        lastFrame = now;
        for (let i = 0; i < buf.length; i++) {
          const v = (Math.random() * 255) | 0;
          buf[i] = (38 << 24) | (v << 16) | (v << 8) | v;
        }
        ctx.putImageData(imgData, 0, 0);
      }
      rafId = window.requestAnimationFrame(renderGrain);
    };

    rafId = window.requestAnimationFrame(renderGrain);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeGrade.grain, embedUrl, videoError]);

  // Real-time Web Audio Spectrum Visualizer loop
  useEffect(() => {
    if (!audioConnected || !isPlaying || embedUrl || useNativeControls) return;
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const drawSpectrum = () => {
      const levels = audioEngineRef.current?.getSpectrumLevels(14);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (levels) {
        const barW = Math.max(2, Math.floor(canvas.width / levels.length) - 1);
        levels.forEach((lvl, idx) => {
          const barH = Math.max(2, Math.round(lvl * canvas.height));
          ctx.fillStyle = audioPreset === 'studio' ? 'rgba(212, 175, 55, 0.55)' : '#D4AF37';
          ctx.fillRect(idx * (barW + 1), canvas.height - barH, barW, barH);
        });
      }
      rafId = window.requestAnimationFrame(drawSpectrum);
    };
    rafId = window.requestAnimationFrame(drawSpectrum);
    return () => window.cancelAnimationFrame(rafId);
  }, [audioConnected, isPlaying, audioPreset, embedUrl, useNativeControls]);

  const ensureAudioEngineConnected = (force = false) => {
    const video = videoRef.current;
    if (!video || embedUrl) return;
    if (!force && audioPreset === 'studio' && !audioConnected) return;
    if (!audioEngineRef.current) {
      audioEngineRef.current = new CinemaAudioEngine();
    }
    const status = audioEngineRef.current.attach(video);
    setAudioConnected(status.connected);
    if (!status.connected && status.reason === 'cross_origin_restricted') {
      setAudioRestrictedMsg(true);
    } else {
      audioEngineRef.current.resumeIfNeeded();
      audioEngineRef.current.applyPreset(audioPreset);
    }
  };

  const revealControls = () => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowColorMenu(false);
        setShowAudioMenu(false);
        setShowDirectorDeck(false);
        setShowQualityMenu(false);
      }
    }, 3500);
  };

  const diagnoseMediaFailure = async () => {
    const isInAppSocial =
      typeof navigator !== 'undefined' && /WhatsApp|Instagram|FBAN|FBAV/i.test(navigator.userAgent);
    const errCode = videoRef.current?.error?.code;
    try {
      if (activeUrl.startsWith('/')) {
        const resp = await fetch(activeUrl, { method: 'HEAD' });
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (resp.status === 404 || (resp.ok && ct.includes('text/html'))) {
          setVideoError(
            activeUrl.startsWith('/uploads/')
              ? lang === 'ar'
                ? 'ملف الفيديو مرفوع على رابط التطوير فقط ولا يوجد على هذا الرابط المشترك. أضف رابط فيديو سحابي (مثل Google Drive أو MP4 مباشر) في لوحة الإدارة.'
                : 'This uploaded video is stored on the dev server only and is missing on this host.'
              : lang === 'ar'
              ? 'هذا التحديث لم يُنشر بعد على رابط المشاركة. حدّث النشر (Share / Publish) أو افتح من رابط التطوير.'
              : 'This media update has not been published to the Shared link yet. Please republish or use the Dev link.'
          );
          return;
        }
        if (resp.status === 401 || resp.status === 403 || resp.redirected) {
          setVideoError(
            lang === 'ar'
              ? 'المتصفح الحالي (مثل متصفح إنستغرام أو واتساب الداخلي) لا يملك صلاحية الوصول للملف. افتح الرابط في Safari أو Chrome.'
              : 'This browser cannot access protected media. Open in Safari or Chrome.'
          );
          return;
        }
      }
    } catch {
      if (activeUrl.startsWith('/')) {
        setVideoError(
          lang === 'ar'
            ? isInAppSocial
              ? 'متصفح التطبيق الداخلي قد يمنع تشغيل الفيديو. افتح الرابط في Safari أو Chrome.'
              : 'تعذر الوصول إلى ملف الفيديو من هذا المتصفح. جرّب الفتح في Safari أو Chrome.'
            : 'Unable to access video from this browser. Try Safari or Chrome.'
        );
        return;
      }
    }
    setVideoError(
      lang === 'ar'
        ? isInAppSocial
          ? 'متصفح التطبيق الداخلي قد يمنع تشغيل الفيديو. افتح الرابط في Safari أو Chrome.'
          : `تعذر تشغيل ملف الفيديو على هذا الجهاز${errCode ? ` (رمز ${errCode})` : ''}. يمكنك تجربة المشغل الأصلي أو تنزيل ملف MP4.`
        : `Unable to play video on this device${errCode ? ` (code ${errCode})` : ''}. Try Native Player or download MP4.`
    );
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (entrancePhase !== 'done') {
      openCurtainsAndPlayNow();
      revealControls();
      return;
    }
    if (video.paused) {
      if (audioPreset !== 'studio') {
        ensureAudioEngineConnected();
      }
      video.play().catch((err) => {
        console.warn('Playback rejected:', err);
        setUseNativeControls(true);
      });
    } else {
      video.pause();
    }
    revealControls();
  };

  const seekBy = (delta: number) => {
    const video = videoRef.current;
    if (!video || !isFinite(video.duration)) return;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta));
    revealControls();
  };

  const stepFrame = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video || !isFinite(video.duration)) return;
    if (!video.paused) video.pause();
    const frameDuration = 1 / 24;
    const target = Math.min(video.duration, Math.max(0, video.currentTime + direction * frameDuration));
    video.currentTime = target;
    setCurrentTime(target);
    revealControls();
  };

  const handleSeek = (val: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = val;
    setCurrentTime(val);
    if (watchParty?.isHost) {
      void updateWatchPartyPlayback(watchParty.partyId, !video.paused, val, true);
    }
    revealControls();
  };

  const handleVolumeChange = (val: number) => {
    const video = videoRef.current;
    setVolume(val);
    setIsMuted(val === 0);
    if (video) {
      video.volume = val;
      video.muted = val === 0;
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !isMuted;
    setIsMuted(next);
    video.muted = next;
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    try {
      if (!document.fullscreenElement) {
        if (el?.requestFullscreen) {
          await el.requestFullscreen();
        } else if (video?.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    }
  };

  const handleTimelineHover = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const hoverTime = ratio * duration;

    const pulseHits = pulses.filter((p) => {
      const refDur = p.durationSec > 0 ? p.durationSec : duration;
      const pTime = (p.timeSec / refDur) * duration;
      return Math.abs(pTime - hoverTime) <= Math.max(4, duration / 36);
    }).length;

    const pv = previewVideoRef.current;
    const pc = previewCanvasRef.current;
    let hasFrame = false;
    if (pv && pc && pv.readyState >= 1 && !activeUrl.toLowerCase().includes('.m3u8')) {
      const now = Date.now();
      if (now - lastPreviewSeekRef.current > 110) {
        lastPreviewSeekRef.current = now;
        try {
          pv.currentTime = hoverTime;
        } catch {
          // Ignore invalid seek
        }
      }
      if (pv.readyState >= 2) {
        try {
          const ctx = pc.getContext('2d');
          if (ctx) {
            ctx.filter = activeGrade.canvasFilter;
            ctx.drawImage(pv, 0, 0, pc.width, pc.height);
            ctx.filter = 'none';
            hasFrame = true;
          }
        } catch {
          hasFrame = false;
        }
      }
    }

    setHoverScrub({
      time: hoverTime,
      pct: ratio * 100,
      hasFrame,
      pulseHits,
    });
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setCaptureError(
        lang === 'ar'
          ? 'انتظر لحظة حتى يبدأ تحميل إطار الفيديو أولاً.'
          : 'Wait a moment for a video frame to load first.'
      );
      window.setTimeout(() => setCaptureError(null), 3000);
      return;
    }

    if (!video.paused) {
      video.pause();
    }

    const outW = 3840;
    const outH = 2560;
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Gallery mat background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, outW, outH);

    // Subtle gold frame border
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(72, 72, outW - 144, outH - 144);

    // Frame viewport (16:9 centered at top in 4K)
    const frameX = 136;
    const frameY = 136;
    const frameW = outW - 272;
    const frameH = 2008;

    const vidRatio = video.videoWidth / video.videoHeight;
    const boxRatio = frameW / frameH;
    let drawW = frameW;
    let drawH = frameH;
    let dx = frameX;
    let dy = frameY;
    if (vidRatio > boxRatio) {
      drawH = frameW / vidRatio;
      dy = frameY + (frameH - drawH) / 2;
    } else {
      drawW = frameH * vidRatio;
      dx = frameX + (frameW - drawW) / 2;
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(frameX, frameY, frameW, frameH);

    const drawSource: CanvasImageSource =
      is4kUpscaleActive && upscale4kCanvasRef.current && upscale4kCanvasRef.current.width >= 1920
        ? upscale4kCanvasRef.current
        : video;

    try {
      ctx.filter = activeGrade.canvasFilter;
      ctx.drawImage(drawSource, dx, dy, drawW, drawH);
      ctx.filter = 'none';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 3;
      ctx.strokeRect(frameX, frameY, frameW, frameH);

      const tc = formatTime(video.currentTime || 0);
      setCapturedFrameTime(tc);

      // Gallery bottom plaque
      ctx.fillStyle = '#D4AF37';
      ctx.font = '700 52px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `A Z   F I L M S   ·   4 K   U H D   ·   ${activeGrade.labelEn.toUpperCase()}`,
        frameX,
        2276
      );

      ctx.fillStyle = '#F5F5F0';
      ctx.font = '700 80px "Cairo", "Plus Jakarta Sans", sans-serif';
      ctx.fillText(film.titleAr || film.titleEn, frameX, 2384);

      if (film.titleEn && film.titleEn !== film.titleAr) {
        ctx.fillStyle = 'rgba(245, 245, 240, 0.55)';
        ctx.font = '500 48px "Cormorant Garamond", Georgia, serif';
        ctx.fillText(film.titleEn.toUpperCase(), frameX, 2452);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = '#D4AF37';
      ctx.font = '600 68px "JetBrains Mono", monospace';
      ctx.fillText(tc, frameX + frameW, 2332);

      ctx.fillStyle = 'rgba(245, 245, 240, 0.5)';
      ctx.font = '500 44px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`${film.year} · 2160p`, frameX + frameW, 2412);

      const url = canvas.toDataURL('image/png');
      // Capture clean raw frame snapshot for 35mm Contact Sheet Studio
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = 1280;
      rawCanvas.height = 720;
      const rawCtx = rawCanvas.getContext('2d');
      if (rawCtx) {
        rawCtx.imageSmoothingEnabled = true;
        rawCtx.imageSmoothingQuality = 'high';
        rawCtx.fillStyle = '#050505';
        rawCtx.fillRect(0, 0, 1280, 720);
        rawCtx.filter = activeGrade.canvasFilter;
        rawCtx.drawImage(drawSource, 0, 0, 1280, 720);
        rawCtx.filter = 'none';
        lastRawFrameRef.current = {
          dataUrl: rawCanvas.toDataURL('image/jpeg', 0.94),
          timecode: tc,
        };
      }
      setCapturedFrameUrl(url);
      recordCapturedFrameCount();
    } catch {
      setCaptureError(
        lang === 'ar'
          ? 'تعذر حفظ الكادر لهذا المصدر الخارجي بسبب قيود الخادم.'
          : 'Frame capture is blocked for this external stream due to CORS.'
      );
      window.setTimeout(() => setCaptureError(null), 3500);
    }
  };

  const handleAddFrameToStrip = () => {
    const raw = lastRawFrameRef.current;
    if (!raw) return;
    setStripFrames((prev) => {
      if (prev.length >= 3) return [...prev.slice(1), raw];
      if (prev.some((f) => f.timecode === raw.timecode)) return prev;
      return [...prev, raw];
    });
  };

  const handleBuildCelluloidStrip = async () => {
    if (stripFrames.length === 0) return;
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 35mm Black Celluloid Strip Base
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, W, H);

    // Subtle film edge lines
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(86, 48, W - 172, H - 96);

    // Perforated Kodak-style 35mm sprocket holes along left & right rails
    ctx.fillStyle = '#18181D';
    for (let y = 76; y < H - 80; y += 74) {
      ctx.beginPath();
      ctx.roundRect(24, y, 40, 46, 8);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(W - 64, y, 40, 46, 8);
      ctx.fill();
    }

    // Header Rebate Stamp
    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('AZ FILMS  ·  35MM KODAK SAFETY CONTACT SHEET', 112, 118);

    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 44px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(film.titleAr || film.titleEn, 112, 178);

    // Draw up to 3 film frames inside celluloid windows
    const frameW = W - 224;
    const frameH = 448;
    const startY = 236;
    const gapY = 504;

    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = src;
      });

    for (let i = 0; i < Math.min(3, stripFrames.length); i++) {
      const fy = startY + i * gapY;
      ctx.fillStyle = '#000000';
      ctx.fillRect(112, fy, frameW, frameH);
      const img = await loadImg(stripFrames[i].dataUrl);
      ctx.drawImage(img, 112, fy, frameW, frameH);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 2;
      ctx.strokeRect(112, fy, frameW, frameH);

      // Frame Rebate Markings
      ctx.fillStyle = '#D4AF37';
      ctx.font = '600 20px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`FRAME 0${i + 1}A`, 112, fy + frameH + 34);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(245,245,240,0.65)';
      ctx.fillText(`TC ${stripFrames[i].timecode}`, 112 + frameW, fy + frameH + 34);
    }

    // Footer Signature
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(245,245,240,0.55)';
    ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      `${film.titleEn} (${film.year})${film.director ? ` · Dir. ${film.director}` : ''}`,
      112,
      H - 94
    );

    setStripSheetUrl(canvas.toDataURL('image/png'));
  };

  const handleDownloadCapturedFrame = () => {
    if (!capturedFrameUrl) return;
    const a = document.createElement('a');
    a.href = capturedFrameUrl;
    a.download = `az-films-${film.id}-frame-${capturedFrameTime.replace(/:/g, '-')}.png`;
    a.click();
  };

  const handleShareCapturedFrame = async () => {
    if (!capturedFrameUrl) return;
    try {
      const resp = await fetch(capturedFrameUrl);
      const blob = await resp.blob();
      const file = new File([blob], `az-films-${film.id}-frame.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          files: [file],
          title: `${primaryTitle} (${capturedFrameTime}) — AZ FILMS`,
        });
        return;
      }
    } catch {
      // Fallback to download
    }
    handleDownloadCapturedFrame();
  };

  const handleVideoPlay = async () => {
    setIsPlaying(true);
    ensureAudioEngineConnected();
    revealControls();
    if (watchParty?.isHost) {
      void updateWatchPartyPlayback(
        watchParty.partyId,
        true,
        videoRef.current?.currentTime || 0,
        true
      );
    }
    if (mode === 'film' && !viewStartedRef.current) {
      viewStartedRef.current = true;
      const dur = videoRef.current?.duration || film.durationSeconds || 0;
      viewSessionIdRef.current = await startFilmViewSession(film.id, dur);
    }
  };

  const handleVideoPause = () => {
    setIsPlaying(false);
    setShowControls(true);
    const video = videoRef.current;
    if (watchParty?.isHost) {
      void updateWatchPartyPlayback(watchParty.partyId, false, video?.currentTime || 0, true);
    }
    if (mode === 'film' && video && video.duration > 10) {
      saveWatchProgress(film.id, video.currentTime || 0, video.duration);
      onProgressUpdated?.();
    }
    if (mode === 'film' && viewSessionIdRef.current) {
      updateFilmViewProgress(
        viewSessionIdRef.current,
        maxWatchedRef.current,
        video?.duration || film.durationSeconds || 0,
        completedMarkedRef.current,
        completedMarkedRef.current
      );
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const cur = video.currentTime || 0;
    const dur = video.duration || 0;

    // Host Watch Party periodic heartbeat sync (every 5s)
    if (watchParty?.isHost && !video.paused && Date.now() - lastPartyPushRef.current >= 5000) {
      lastPartyPushRef.current = Date.now();
      void updateWatchPartyPlayback(watchParty.partyId, true, cur, true);
    }

    // A–B Scene Loop enforcement
    if (loopA !== null && loopB !== null && loopB > loopA + 0.4 && cur >= loopB) {
      video.currentTime = loopA;
      setCurrentTime(loopA);
      return;
    }

    setCurrentTime(cur);
    if (cur > maxWatchedRef.current) maxWatchedRef.current = cur;

    if (mode === 'film') {
      if (dur > 10 && Math.floor(cur) % 5 === 0) {
        saveWatchProgress(film.id, cur, dur);
      }
    }

    if (mode === 'film' && viewSessionIdRef.current) {
      const reachedEnd = dur > 0 && cur / dur >= 0.95;
      const now = Date.now();
      if (reachedEnd && !completedMarkedRef.current) {
        completedMarkedRef.current = true;
        updateFilmViewProgress(viewSessionIdRef.current, maxWatchedRef.current, dur, true, false);
        lastSyncRef.current = now;
      } else if (now - lastSyncRef.current >= 12000) {
        updateFilmViewProgress(
          viewSessionIdRef.current,
          maxWatchedRef.current,
          dur,
          completedMarkedRef.current,
          completedMarkedRef.current
        );
        lastSyncRef.current = now;
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setShowControls(true);
    if (watchParty?.isHost) {
      void updateWatchPartyPlayback(watchParty.partyId, false, duration || 0, true);
    }
    if (mode === 'film') {
      clearWatchProgress(film.id);
      stampCompletedFilm({
        filmId: film.id,
        titleAr: film.titleAr,
        titleEn: film.titleEn,
        year: film.year,
        genre: film.genre,
      });
      onProgressUpdated?.();
      setShowEndCredits(true);
    }
    if (mode === 'film' && viewSessionIdRef.current) {
      const dur = videoRef.current?.duration || film.durationSeconds || maxWatchedRef.current;
      maxWatchedRef.current = Math.max(maxWatchedRef.current, dur);
      const already = completedMarkedRef.current;
      completedMarkedRef.current = true;
      updateFilmViewProgress(viewSessionIdRef.current, maxWatchedRef.current, dur, true, already);
    }
  };

  const handleLaunchWatchParty = async () => {
    if (watchParty) {
      setShowPartyLounge((v) => !v);
      return;
    }
    const hostName = getSavedViewerCreditName(viewerDefaultName) || (lang === 'ar' ? 'المضيف' : 'Host');
    const room = await createWatchPartyRoom(
      film.id,
      hostName,
      videoRef.current?.currentTime || 0
    );
    setWatchParty({ partyId: room.partyId, isHost: true });
    setShowPartyLounge(true);
  };

  const handleCopyPartyInvite = async () => {
    if (!watchParty) return;
    const url = `${window.location.origin}/?film=${encodeURIComponent(film.id)}&party=${encodeURIComponent(watchParty.partyId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPartyLink(true);
      window.setTimeout(() => setCopiedPartyLink(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleSendPartyChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!watchParty || !partyMsgInput.trim()) return;
    const name = getSavedViewerCreditName(viewerDefaultName) || (lang === 'ar' ? 'ضيف' : 'Guest');
    const txt = partyMsgInput;
    setPartyMsgInput('');
    await sendWatchPartyMessage(watchParty.partyId, name, txt, currentTime);
  };

  const handlePinCurrentNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!quickSceneNote.trim()) return;
    const name = getSavedViewerCreditName(viewerDefaultName) || (lang === 'ar' ? 'مشاهد' : 'Viewer');
    const txt = quickSceneNote;
    setQuickSceneNote('');
    await addSceneNote(film.id, name, txt, currentTime, isAdmin);
  };

  const activeMarginNote = showSceneNotesOverlay
    ? sceneNotes.find((n) => Math.abs(n.timeSec - currentTime) <= 4.5) || null
    : null;

  const handleSendPulse = async (kind: PulseKind) => {
    const cur = videoRef.current?.currentTime || currentTime || 0;
    const dur = videoRef.current?.duration || duration || film.durationSeconds || 0;
    const now = Date.now();
    setFloatingPulse({ kind, key: now });
    setPulses((prev) => [...prev, { timeSec: cur, durationSec: dur, kind }]);

    // Launch live audience seat reaction sparks rising into the theater
    const sparkColor =
      kind === 'fire' ? '#F59E0B' : kind === 'shock' ? '#38BDF8' : '#FB7185';
    const spawned = Array.from({ length: 7 }, (_, i) => ({
      id: now + i,
      leftPct: 16 + Math.round(Math.random() * 68),
      color: sparkColor,
      delayMs: i * 85,
    }));
    setSeatSparks((prev) => [...prev.slice(-18), ...spawned]);
    window.setTimeout(() => {
      const ids = new Set(spawned.map((s) => s.id));
      setSeatSparks((prev) => prev.filter((s) => !ids.has(s.id)));
    }, 2400);

    window.setTimeout(() => {
      setFloatingPulse((prev) => (prev && Date.now() - prev.key >= 1300 ? null : prev));
    }, 1400);
    await sendFilmPulse(film.id, kind, cur, dur);
  };

  const cycleAspectMode = () => {
    setAspectMode((prev) =>
      prev === '16_9' ? 'scope_239' : prev === 'scope_239' ? 'imax_full' : '16_9'
    );
  };

  const effectiveDuration = duration > 0 ? duration : film.durationSeconds || 0;
  const heartbeatBuckets = (() => {
    const bucketCount = 36;
    const counts = new Array<number>(bucketCount).fill(0);
    if (effectiveDuration > 0 && pulses.length > 0) {
      for (const p of pulses) {
        const refDur = p.durationSec > 0 ? p.durationSec : effectiveDuration;
        const ratio = Math.min(0.999, Math.max(0, p.timeSec / refDur));
        const idx = Math.floor(ratio * bucketCount);
        counts[idx] += 1;
      }
    }
    const maxCount = Math.max(1, ...counts);
    return counts.map((c) => (c > 0 ? Math.max(0.22, c / maxCount) : 0.08));
  })();

  const remainingTime = Math.max(0, duration - currentTime);
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      dir="ltr"
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      className="fixed inset-0 z-50 flex flex-col bg-[#000000] text-[#F5F5F0]"
    >
      {/* Top Cinema Overlay Bar */}
      <div
        className={`absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/55 to-transparent px-4 py-4 sm:px-8 transition-opacity duration-300 ${
          showControls || !hasStream || useNativeControls
            ? theaterDim && isPlaying
              ? 'opacity-45 hover:opacity-100'
              : 'opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-cinema-display text-sm tracking-[0.2em] text-[#D4AF37] shrink-0">
            AZ FILMS
          </span>
          <span aria-hidden="true" className="text-white/25">
            /
          </span>
          <h2 className="truncate text-sm sm:text-base font-semibold text-[#F5F5F0]">
            {primaryTitle}
            {mode === 'trailer' ? (lang === 'ar' ? ' — التريلر الرسمي' : ' — Official Trailer') : ''}
          </h2>
          <div className="hidden md:flex items-center gap-1.5 rounded-md border border-[#D4AF37]/30 bg-black/60 px-2.5 py-1 text-[11px] text-[#D4AF37]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="tabular-nums">
              {activeViewersCount}{' '}
              {lang === 'ar'
                ? activeViewersCount === 1
                  ? 'يشاهد الآن'
                  : 'يشاهدون معك'
                : 'watching'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {hasStream && !embedUrl && !videoError && (
            <>
              {/* 6-Grade Cinema Colorist */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColorMenu((v) => !v);
                    setShowAudioMenu(false);
                    setShowDirectorDeck(false);
                  }}
                  title={lang === 'ar' ? 'غرفة الألوان السينمائية' : 'Cinema Colorist'}
                  className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cinemaFilter !== 'original'
                      ? 'border-[#D4AF37]/70 bg-[#D4AF37]/20 text-[#D4AF37]'
                      : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-white/30'
                  }`}
                >
                  <Palette className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {lang === 'ar' ? activeGrade.labelAr : activeGrade.labelEn}
                  </span>
                </button>
                {showColorMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-12 z-40 w-48 rounded-xl border border-white/15 bg-[#0B0B0E]/95 p-1.5 shadow-2xl backdrop-blur-md"
                  >
                    <p className="px-2.5 py-1.5 text-[10px] tracking-[0.14em] text-[#D4AF37]/80">
                      {lang === 'ar' ? 'تدرجات الألوان الحية' : 'LIVE COLOR GRADES'}
                    </p>
                    {COLOR_GRADES.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setCinemaFilter(g.id);
                          setShowColorMenu(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer ${
                          cinemaFilter === g.id
                            ? 'bg-[#D4AF37]/20 text-[#D4AF37]'
                            : 'text-[#F5F5F0]/80 hover:bg-white/[0.06]'
                        }`}
                      >
                        <span>{lang === 'ar' ? g.labelAr : g.labelEn}</span>
                        {g.grain && <span className="text-[10px] text-[#D4AF37]/70">35mm</span>}
                      </button>
                    ))}
                    <div className="mt-1 border-t border-white/10 pt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSplitCompare((prev) => {
                            const next = !prev;
                            if (next && cinemaFilter === 'original') {
                              setCinemaFilter('imax_70mm');
                            }
                            return next;
                          });
                          setShowColorMenu(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                          splitCompare
                            ? 'bg-[#D4AF37] text-[#050505]'
                            : 'text-[#D4AF37] hover:bg-[#D4AF37]/10'
                        }`}
                      >
                        <span>
                          {lang === 'ar' ? 'مقارنة حية (الأصل | المعالجة)' : 'Live Split Compare'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* IMAX / Dolby Web Audio Soundstage */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    ensureAudioEngineConnected(true);
                    setShowAudioMenu((v) => !v);
                    setShowColorMenu(false);
                    setShowDirectorDeck(false);
                  }}
                  title={lang === 'ar' ? 'مسرح الصوت IMAX & 3D' : 'IMAX & 3D Spatial Audio'}
                  className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    audioPreset !== 'studio'
                      ? 'border-[#D4AF37]/70 bg-[#D4AF37]/20 text-[#D4AF37]'
                      : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-white/30'
                  }`}
                >
                  <AudioWaveform className="h-4 w-4" />
                  <span className="hidden md:inline">
                    {AUDIO_PRESETS.find((p) => p.id === audioPreset)?.[
                      lang === 'ar' ? 'labelAr' : 'labelEn'
                    ] || 'Audio'}
                  </span>
                </button>
                {showAudioMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-12 z-40 w-60 rounded-xl border border-white/15 bg-[#0B0B0E]/95 p-2 shadow-2xl backdrop-blur-md"
                  >
                    <p className="px-2.5 py-1.5 text-[10px] tracking-[0.14em] text-[#D4AF37]/80">
                      {lang === 'ar' ? 'معالج الصوت السينمائي' : 'CINEMA AUDIO DSP'}
                    </p>
                    {AUDIO_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          ensureAudioEngineConnected(true);
                          setAudioPreset(p.id);
                          if (p.id !== 'spatial3d') setShowAudioMenu(false);
                        }}
                        className={`block w-full rounded-lg px-2.5 py-2 text-start text-xs transition-colors cursor-pointer ${
                          audioPreset === p.id
                            ? 'bg-[#D4AF37]/20 text-[#D4AF37]'
                            : 'text-[#F5F5F0]/80 hover:bg-white/[0.06]'
                        }`}
                      >
                        {lang === 'ar' ? p.labelAr : p.labelEn}
                      </button>
                    ))}
                    {audioConnected && (
                      <div className="mt-1.5 space-y-2 border-t border-white/10 px-2.5 pt-2.5 pb-1">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-[#F5F5F0]/60">
                            <span>{lang === 'ar' ? 'موضع المقعد (يسار/يمين)' : 'Seat Pan (L/R)'}</span>
                            <span className="font-cinema-mono text-[#D4AF37]">
                              {Math.round(seatPan * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-0.85}
                            max={0.85}
                            step={0.05}
                            value={seatPan}
                            onChange={(e) => {
                              const nextPan = Number(e.target.value);
                              setSeatPan(nextPan);
                              audioEngineRef.current?.setSpatialSeat(nextPan, seatDepth);
                            }}
                            className="w-full accent-[#D4AF37] cursor-pointer"
                          />
                        </div>
                        {audioPreset === 'spatial3d' && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[#F5F5F0]/60">
                              <span>{lang === 'ar' ? 'عمق القاعة 3D' : '3D Hall Depth'}</span>
                              <span className="font-cinema-mono text-[#D4AF37]">
                                {Math.round(seatDepth * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.05}
                              max={0.85}
                              step={0.05}
                              value={seatDepth}
                              onChange={(e) => {
                                const nextDepth = Number(e.target.value);
                                setSeatDepth(nextDepth);
                                audioEngineRef.current?.setSpatialSeat(seatPan, nextDepth);
                              }}
                              className="w-full accent-[#D4AF37] cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {audioRestrictedMsg && (
                      <p className="mt-1 border-t border-white/10 px-2.5 pt-2 pb-1 text-[10px] leading-relaxed text-[#F5F5F0]/50">
                        {lang === 'ar'
                          ? 'المعالج الرقمي متاح للبث المباشر من خادم الاستوديو؛ هذا الرابط الخارجي يعمل بالصوت القياسي.'
                          : 'DSP EQ requires same-origin or CORS streams; playing standard master audio.'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Anamorphic Aspect Switcher (16:9 -> 2.39:1 -> IMAX Full) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cycleAspectMode();
                }}
                title={lang === 'ar' ? 'نسبة العرض: 16:9 / 2.39:1 Panavision / IMAX' : 'Aspect Ratio'}
                className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  aspectMode !== '16_9'
                    ? 'border-[#D4AF37]/70 bg-[#D4AF37]/20 text-[#D4AF37]'
                    : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-white/30'
                }`}
              >
                <Maximize2 className="h-4 w-4" />
                <span className="hidden lg:inline font-cinema-mono">
                  {aspectMode === 'scope_239'
                    ? '2.39:1'
                    : aspectMode === 'imax_full'
                      ? 'IMAX'
                      : '16:9'}
                </span>
              </button>

              {/* Lights-Off Theatre Dimmer */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTheaterDim((v) => !v);
                }}
                title={lang === 'ar' ? 'إطفاء أنوار القاعة' : 'Theater Lights Off'}
                className={`hidden sm:flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  theaterDim
                    ? 'border-[#D4AF37]/70 bg-[#D4AF37]/20 text-[#D4AF37]'
                    : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-white/30'
                }`}
              >
                <Lightbulb className="h-4 w-4" />
              </button>

              {/* Ambilight Toggle */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAmbilightEnabled((v) => !v);
                }}
                title={lang === 'ar' ? 'توهج الشاشة الحي مع ألوان المشهد' : 'Toggle Cinema Ambilight Glow'}
                className={`hidden md:flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  ambilightEnabled
                    ? 'border-[#D4AF37]/70 bg-[#D4AF37]/20 text-[#D4AF37]'
                    : 'border-white/15 bg-black/60 text-[#F5F5F0]/75 hover:border-white/30'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden xl:inline">
                  {lang === 'ar' ? 'توهج حي' : 'Ambilight'}
                </span>
              </button>

              {/* Capture Frame */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCaptureFrame();
                }}
                title={lang === 'ar' ? 'التقاط هذا الكادر بدقة 4K UHD (3840px)' : 'Capture 4K UHD Frame (3840px)'}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-2.5 text-xs text-[#F5F5F0]/85 transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="h-4 w-4" />
                <span className="hidden xl:inline">
                  {lang === 'ar' ? 'التقاط 4K' : '4K Still'}
                </span>
              </button>

              {/* Real 3D Cinema Hall Mode & Seat Switcher */}
              {mode === 'film' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      ensureAudioEngineConnected();
                      setHallMode((v) => {
                        const next = !v;
                        if (next) setFourDxMotion(true);
                        return next;
                      });
                    }}
                    title={lang === 'ar' ? 'مشاهدة داخل قاعة السينما الحقيقية 3D' : 'Real 3D Cinema Hall Mode'}
                    className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      hallMode
                        ? 'border-[#D4AF37] bg-[#D4AF37] font-semibold text-[#050505]'
                        : 'border-white/15 bg-black/60 text-[#F5F5F0]/85 hover:border-[#D4AF37] hover:text-[#D4AF37]'
                    }`}
                  >
                    <Armchair className="h-4 w-4" />
                    <span className="hidden lg:inline">
                      {hallMode
                        ? `${lang === 'ar' ? 'القاعة' : 'Hall'} · ${hallSeat}`
                        : lang === 'ar'
                          ? 'داخل القاعة'
                          : 'Cinema Hall'}
                    </span>
                  </button>
                  {onOpenSeatBooking && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSeatBooking();
                      }}
                      title={lang === 'ar' ? 'حجز أو تغيير المقعد' : 'Book or Change Seat'}
                      className="hidden sm:flex h-10 items-center rounded-lg border border-white/15 bg-black/60 px-2 text-[11px] font-cinema-mono text-[#D4AF37] hover:border-[#D4AF37] cursor-pointer"
                    >
                      {hallSeat}
                    </button>
                  )}
                </div>
              )}

              {/* 4DX Weather Atmosphere Cycle & Live Chromatic Frame Prism */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFourDxAtmos((prev) =>
                    prev === 'dust'
                      ? 'embers'
                      : prev === 'embers'
                        ? 'rain'
                        : prev === 'rain'
                          ? 'mist'
                          : prev === 'mist'
                            ? 'off'
                            : 'dust'
                  );
                }}
                title={
                  lang === 'ar'
                    ? 'طقس القاعة التفاعلي 4DX (غبار / جمر / مطر / ضباب)'
                    : '4DX Atmosphere (Dust / Embers / Rain / Mist)'
                }
                className={`hidden md:flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  fourDxAtmos !== 'off' && fourDxAtmos !== 'dust'
                    ? 'border-[#D4AF37]/70 bg-[#D4AF37]/20 text-[#D4AF37]'
                    : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-[#D4AF37] hover:text-[#D4AF37]'
                }`}
              >
                <Wind className="h-4 w-4" />
                <span className="hidden xl:inline">
                  {fourDxAtmos === 'embers'
                    ? lang === 'ar'
                      ? '4DX جمر'
                      : 'Embers'
                    : fourDxAtmos === 'rain'
                      ? lang === 'ar'
                        ? '4DX مطر'
                        : 'Rain'
                      : fourDxAtmos === 'mist'
                        ? lang === 'ar'
                          ? '4DX ضباب'
                          : 'Mist'
                        : fourDxAtmos === 'off'
                          ? lang === 'ar'
                            ? 'جو معطل'
                            : 'FX Off'
                          : lang === 'ar'
                            ? '4DX جو'
                            : '4DX FX'}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLivePrism((v) => !v);
                }}
                title={
                  lang === 'ar'
                    ? 'الطيف اللوني اللحظي للقطة (Director Live DNA)'
                    : 'Live Chromatic Frame DNA Prism'
                }
                className={`hidden lg:flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showLivePrism
                    ? 'border-[#D4AF37]/70 bg-[#D4AF37]/20 text-[#D4AF37]'
                    : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-[#D4AF37] hover:text-[#D4AF37]'
                }`}
              >
                <Activity className="h-4 w-4" />
              </button>

              {/* Watch Party Room / Lounge Toggle */}
              {mode === 'film' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleLaunchWatchParty();
                  }}
                  title={lang === 'ar' ? 'غرفة العرض الجماعي المتزامن' : 'Synchronized Watch Party'}
                  className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    watchParty
                      ? 'border-[#D4AF37]/70 bg-[#D4AF37]/20 text-[#D4AF37]'
                      : 'border-white/15 bg-black/60 text-[#F5F5F0]/85 hover:border-[#D4AF37] hover:text-[#D4AF37]'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  <span className="hidden xl:inline font-cinema-mono">
                    {watchParty ? watchParty.partyId : lang === 'ar' ? 'معاً' : 'Party'}
                  </span>
                </button>
              )}
            </>
          )}

          {hasStream && !embedUrl && !videoError && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                videoRef.current?.pause();
                runEntranceSequence(true);
              }}
              title={
                lang === 'ar'
                  ? 'إعادة تأثير انحناء الستائر وأضواء القاعة'
                  : 'Replay Curtain Bend & Ambient Gold Intro'
              }
              className="hidden sm:flex h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-2.5 text-xs text-[#F5F5F0]/80 transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="h-4 w-4 text-[#D4AF37]" />
              <span className="hidden xl:inline">
                {lang === 'ar' ? 'افتتاحية القاعة' : 'Curtain Intro'}
              </span>
            </button>
          )}

          {hasStream && !embedUrl && activeUrl.toLowerCase().includes('.mp4') && (
            <a
              href={activeUrl}
              download={`${film.id}.mp4`}
              title={lang === 'ar' ? 'تحميل ملف MP4' : 'Download MP4'}
              className="hidden sm:flex h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-2.5 text-xs text-[#F5F5F0]/80 transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37]"
            >
              <Download className="h-4 w-4" />
              <span className="hidden xl:inline">MP4</span>
            </a>
          )}

          {hasStream && !embedUrl && !videoError && (
            <button
              type="button"
              onClick={() => setUseNativeControls((v) => !v)}
              title={lang === 'ar' ? 'تبديل مشغل الجوال الأصلي' : 'Toggle Native Mobile Controls'}
              className={`flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                useNativeControls
                  ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]'
                  : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-white/30'
              }`}
            >
              <Smartphone className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label={t(lang, 'closePlayer')}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-[#F5F5F0] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Cinema Viewport */}
      {!hasStream ? (
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          className="flex flex-1 flex-col items-center justify-center px-6 text-center"
        >
          <div className="max-w-lg space-y-5 rounded-2xl border border-white/10 bg-[#0B0B0E] p-8 sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]">
              <FilmIcon className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-[#F5F5F0]">
              {mode === 'trailer' ? t(lang, 'trailerUnavailable') : t(lang, 'unavailableTitle')}
            </h3>
            <p className="text-sm leading-relaxed text-[#F5F5F0]/65">
              {t(lang, 'unavailableDesc')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {mode === 'film' && film.trailerUrl && onSwitchToTrailer && (
                <button
                  type="button"
                  onClick={onSwitchToTrailer}
                  className="flex h-11 items-center gap-2 rounded-lg bg-[#D4AF37] px-5 text-sm font-semibold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>{t(lang, 'watchTrailer')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 items-center rounded-lg border border-white/15 bg-white/[0.04] px-5 text-sm font-medium text-[#F5F5F0] hover:border-white/30 cursor-pointer"
              >
                {t(lang, 'closePlayer')}
              </button>
            </div>
          </div>
        </div>
      ) : embedUrl ? (
        <div className="flex flex-1 items-center justify-center bg-black pt-16 pb-6 px-2 sm:px-8">
          <iframe
            src={embedUrl}
            title={primaryTitle}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="h-full w-full max-w-6xl rounded-xl border border-white/10"
          />
        </div>
      ) : (
        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden bg-black px-2 sm:px-6 py-12"
          style={hallMode ? { perspective: '1320px' } : undefined}
          onMouseMove={(e) => {
            if (!hallMode || videoError) return;
            const prefersReduced =
              typeof window !== 'undefined' &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (prefersReduced) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
            const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
            setHallParallax({
              x: Number((nx * 1.5).toFixed(2)),
              y: Number((-ny * 1.1).toFixed(2)),
            });
          }}
          onMouseLeave={() => {
            if (hallMode) setHallParallax({ x: 0, y: 0 });
          }}
          onClick={() => {
            setShowHallSeatsDrawer(false);
            if (!useNativeControls) togglePlay();
          }}
        >
          {/* Photorealistic 3D Luxury Cinema Auditorium Interior */}
          {hallMode && !videoError && (
            <>
              {/* Celestial Optical Starlight Night Dome + Coffered Ceiling & Projection Booth Port */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-0 z-0 h-44 bg-gradient-to-b transition-opacity duration-700 ${
                  hallLights === 'blackout'
                    ? 'from-[#020204] via-[#040407]/90 to-transparent opacity-95'
                    : hallLights === 'warm'
                      ? 'from-[#181108] via-[#0C0907]/85 to-transparent opacity-100'
                      : 'from-[#0C0907] via-[#060608]/85 to-transparent opacity-95'
                }`}
              >
                {/* Pinpoint Optical Fiber Ceiling Stars */}
                {HALL_CEILING_STARS.map((star) => (
                  <span
                    key={star.id}
                    style={{
                      left: `${star.left}%`,
                      top: `${star.top}%`,
                      width: `${star.size}px`,
                      height: `${star.size}px`,
                      opacity: hallLights === 'warm' ? star.opacity * 0.45 : star.opacity,
                    }}
                    className="absolute rounded-full bg-[#F5E6B8] shadow-[0_0_6px_rgba(245,230,184,0.8)]"
                  />
                ))}

                <div className="mx-auto flex h-14 w-[78%] justify-around opacity-45">
                  {[0, 1, 2, 3, 4, 5].map((rib) => (
                    <div
                      key={rib}
                      className="h-full w-px bg-gradient-to-b from-[#D4AF37]/65 via-[#D4AF37]/20 to-transparent"
                    />
                  ))}
                </div>
                {/* Projection Booth Port Lens Window */}
                <div className="mx-auto -mt-12 flex h-5 w-16 items-center justify-center rounded-b-md border-x border-b border-[#D4AF37]/45 bg-[#09080A] shadow-[0_0_32px_rgba(245,220,150,0.55)]">
                  <div className="h-2.5 w-7 rounded-full bg-[radial-gradient(circle,rgba(255,244,210,0.95),rgba(212,175,55,0.25))]" />
                </div>
              </div>

              {/* Left 3D Acoustic Auditorium Wall, Pleated Velvet Drapes & Live Scene Color Sconces */}
              <div
                aria-hidden="true"
                style={{
                  transform: `translate3d(${-hallParallax.x * 2.5}px, ${hallParallax.y * 1.5}px, 0) skewY(2.5deg)`,
                  opacity: hallLights === 'blackout' ? 0.32 : hallLights === 'warm' ? 1 : 0.78,
                }}
                className="pointer-events-none absolute -left-4 inset-y-6 z-0 w-20 sm:w-44 lg:w-64 overflow-hidden bg-gradient-to-r from-[#1D070A]/95 via-[#0B0608]/80 to-transparent transition-all duration-500"
              >
                <div className="h-full w-full opacity-35 bg-[repeating-linear-gradient(90deg,rgba(212,175,55,0.12)_0px,rgba(212,175,55,0.12)_2px,transparent_2px,transparent_18px)]" />
                <div className="absolute top-[22%] left-4 sm:left-8 flex flex-col items-center gap-24">
                  <div
                    style={{
                      boxShadow:
                        hallLights === 'warm'
                          ? '0 0 42px rgba(245,200,90,0.9)'
                          : `0 0 34px rgba(${hallGlowRgb}, 0.65)`,
                    }}
                    className="h-16 w-1.5 rounded-full bg-[#D4AF37]/80 transition-shadow duration-300"
                  />
                  <div
                    style={{
                      boxShadow:
                        hallLights === 'warm'
                          ? '0 0 34px rgba(245,200,90,0.75)'
                          : `0 0 28px rgba(${hallGlowRgb}, 0.45)`,
                    }}
                    className="h-16 w-1.5 rounded-full bg-[#D4AF37]/60 transition-shadow duration-300"
                  />
                </div>
                <div className="absolute bottom-14 left-2 right-6 h-px bg-gradient-to-r from-[#D4AF37]/55 to-transparent" />
              </div>

              {/* Right 3D Acoustic Auditorium Wall, Pleated Velvet Drapes & Live Scene Color Sconces */}
              <div
                aria-hidden="true"
                style={{
                  transform: `translate3d(${-hallParallax.x * 2.5}px, ${hallParallax.y * 1.5}px, 0) skewY(-2.5deg)`,
                  opacity: hallLights === 'blackout' ? 0.32 : hallLights === 'warm' ? 1 : 0.78,
                }}
                className="pointer-events-none absolute -right-4 inset-y-6 z-0 w-20 sm:w-44 lg:w-64 overflow-hidden bg-gradient-to-l from-[#1D070A]/95 via-[#0B0608]/80 to-transparent transition-all duration-500"
              >
                <div className="h-full w-full opacity-35 bg-[repeating-linear-gradient(90deg,transparent_0px,transparent_16px,rgba(212,175,55,0.12)_16px,rgba(212,175,55,0.12)_18px)]" />
                <div className="absolute top-[22%] right-4 sm:right-8 flex flex-col items-center gap-24">
                  <div
                    style={{
                      boxShadow:
                        hallLights === 'warm'
                          ? '0 0 42px rgba(245,200,90,0.9)'
                          : `0 0 34px rgba(${hallGlowRgb}, 0.65)`,
                    }}
                    className="h-16 w-1.5 rounded-full bg-[#D4AF37]/80 transition-shadow duration-300"
                  />
                  <div
                    style={{
                      boxShadow:
                        hallLights === 'warm'
                          ? '0 0 34px rgba(245,200,90,0.75)'
                          : `0 0 28px rgba(${hallGlowRgb}, 0.45)`,
                    }}
                    className="h-16 w-1.5 rounded-full bg-[#D4AF37]/60 transition-shadow duration-300"
                  />
                </div>
                <div className="absolute bottom-14 left-6 right-2 h-px bg-gradient-to-l from-[#D4AF37]/55 to-transparent" />
              </div>
            </>
          )}

          {/* Volumetric Overhead Live-RGB Projector Beam + 4DX Weather Atmosphere Canvas */}
          {showVolumetricStage && !videoError && (
            <canvas
              ref={projectorDustCanvasRef}
              width={640}
              height={360}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[5] h-full w-full opacity-90 mix-blend-screen"
            />
          )}

          {/* Volumetric Projector Beam in Lights-Off Theater Mode */}
          {(theaterDim || hallMode) && !videoError && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.14),transparent_70%)] transition-opacity duration-500"
            />
          )}

          {/* 4DX Acoustic Shockwave Ring radiating on Bass & Kinetic Peaks */}
          {fourDxMotion && fourDxRecoil.shockKey > 0 && !videoError && (
            <div
              key={fourDxRecoil.shockKey}
              aria-hidden="true"
              style={{
                borderColor: `rgba(${hallGlowRgb}, 0.35)`,
                boxShadow: `0 0 80px rgba(${hallGlowRgb}, 0.2)`,
              }}
              className="az-shockwave-ring pointer-events-none absolute inset-8 sm:inset-16 z-0 rounded-3xl border"
            />
          )}

          {/* Real-time Cinema Ambilight Glow Layer (kept mounted for live RGB/Prism/4DX sampling) */}
          {!embedUrl && hasStream && !videoError && (
            <canvas
              ref={ambilightCanvasRef}
              width={48}
              height={27}
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 m-auto h-[84%] w-[94%] rounded-3xl object-contain blur-[76px] saturate-150 transition-opacity duration-500 ${
                ambilightEnabled && (!theaterDim || hallMode)
                  ? hallMode
                    ? 'opacity-85'
                    : 'opacity-75'
                  : 'opacity-0'
              }`}
            />
          )}

          {/* Projection Stage Container + Curved Proscenium Housing, 4DX Recoil, VIP Perspective & Floor Mirror */}
          <div
            style={{
              transform: hallMode
                ? `${
                    hallCamera === 'vip_box'
                      ? `rotateY(${seatPerspective.rotateYDeg * 0.4 + hallParallax.x}deg) rotateX(${-4.5 + hallParallax.y}deg) scale(${(0.83 * fourDxRecoil.scale).toFixed(4)}) translate3d(${fourDxRecoil.x}px, ${-10 + fourDxRecoil.y}px, 0)`
                      : hallCamera === 'imax_dome'
                        ? `rotateY(${hallParallax.x * 0.8}deg) rotateX(${2.5 + hallParallax.y * 0.6}deg) scale(${(1.06 * fourDxRecoil.scale).toFixed(4)}) translate3d(${fourDxRecoil.x}px, ${fourDxRecoil.y}px, 0)`
                        : `rotateY(${seatPerspective.rotateYDeg + hallParallax.x}deg) rotateX(${seatPerspective.rotateXDeg + hallParallax.y}deg) scale(${(seatPerspective.screenScale * fourDxRecoil.scale).toFixed(4)}) translate3d(${fourDxRecoil.x}px, ${fourDxRecoil.y}px, 0)`
                  }`
                : fourDxMotion && (fourDxRecoil.x !== 0 || fourDxRecoil.y !== 0)
                  ? `translate3d(${fourDxRecoil.x}px, ${fourDxRecoil.y}px, 0) scale(${fourDxRecoil.scale})`
                  : undefined,
            }}
            className={`relative z-10 flex flex-col items-center justify-center transition-transform duration-500 ease-out ${
              hallMode
                ? 'w-[90vw] sm:w-[76vw] max-w-[1180px]'
                : aspectMode === 'scope_239'
                  ? 'w-[94vw] sm:w-[88vw] max-h-[82vh] aspect-[2.39/1]'
                  : aspectMode === 'imax_full'
                    ? 'h-[86vh] w-[96vw]'
                    : ambilightEnabled && !isFullscreen
                      ? 'h-[82vh] w-[92vw] sm:w-[86vw]'
                      : 'h-full w-full max-h-screen'
            }`}
          >
            {/* Velvet Side Curtain Wings & Top Valance flanking the Proscenium Screen inside Hall Mode */}
            {hallMode && !videoError && (
              <>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-x-5 -inset-y-3 hidden sm:block rounded-xl border border-[#D4AF37]/25 bg-[radial-gradient(circle_at_center,transparent_62%,rgba(28,7,11,0.9)_100%)] shadow-[0_35px_110px_rgba(0,0,0,0.98)]"
                />
                {/* Top Crimson & Gold Scalloped Theatre Valance */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-3 inset-x-0 z-30 h-5 rounded-t-lg border-t border-b border-[#D4AF37]/45 bg-[repeating-linear-gradient(90deg,#2D070C_0px,#4B0D16_16px,#1F0407_32px)] shadow-[0_10px_24px_rgba(0,0,0,0.85)]"
                />
                {/* Clickable Hanging Gold Curtain Pull Cord & Tassel on Proscenium Side */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleHallCurtains();
                  }}
                  title={
                    curtainOpen
                      ? lang === 'ar'
                        ? 'اسحب الحبل لإغلاق الستارة'
                        : 'Pull cord to close curtains'
                      : lang === 'ar'
                        ? 'اسحب الحبل لفتح الستارة'
                        : 'Pull cord to draw curtains'
                  }
                  className="group absolute -right-3 sm:-right-6 top-2 z-40 flex flex-col items-center cursor-pointer transition-transform active:translate-y-2"
                >
                  <span className="h-20 sm:h-28 w-0.5 bg-gradient-to-b from-[#D4AF37] via-[#F0D372] to-[#9B7A1C] shadow-[0_0_10px_rgba(212,175,55,0.75)]" />
                  <span className="flex h-6 w-3.5 items-center justify-center rounded-b-full border border-[#F5DE93] bg-gradient-to-b from-[#E6C65B] to-[#8C6A12] shadow-[0_0_14px_rgba(212,175,55,0.85)] group-hover:scale-110 transition-transform" />
                </button>
              </>
            )}

            <div
              className={`relative w-full flex items-center justify-center overflow-hidden ${
                hallMode
                  ? 'aspect-video max-h-[68vh] rounded-md border-[3px] border-[#0C0A0C] ring-1 ring-[#D4AF37]/30 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.98)]'
                  : aspectMode === 'scope_239'
                    ? 'h-full w-full rounded-md bg-black shadow-[0_0_90px_rgba(0,0,0,0.95)]'
                    : aspectMode === 'imax_full'
                      ? 'h-full w-full rounded-xl bg-black'
                      : ambilightEnabled && !isFullscreen
                        ? 'h-full w-full rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.85)]'
                        : 'h-full w-full'
              }`}
            >
              <video
                ref={videoRef}
                playsInline
                controls={useNativeControls}
                preload="metadata"
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  const video = videoRef.current;
                  const dur = video?.duration || 0;
                  setDuration(dur);
                  if (video) {
                    video.playbackRate = playbackRate;
                  }
                  if (mode === 'film' && video && !resumeAppliedRef.current) {
                    resumeAppliedRef.current = true;
                    if (typeof initialTimeSec === 'number' && initialTimeSec >= 0) {
                      video.currentTime = initialTimeSec;
                      setCurrentTime(initialTimeSec);
                    } else {
                      const saved = getWatchProgress(film.id);
                      if (saved && saved.currentTime > 4 && (dur <= 0 || saved.currentTime < dur - 8)) {
                        video.currentTime = saved.currentTime;
                        setCurrentTime(saved.currentTime);
                      }
                    }
                  }
                }}
                onEnded={handleEnded}
                onError={diagnoseMediaFailure}
                style={{ filter: splitCompare ? 'none' : activeGrade.cssFilter }}
                className={`h-full w-full transition-[filter] duration-300 ${
                  aspectMode === 'scope_239' || aspectMode === 'imax_full'
                    ? 'object-cover'
                    : 'object-contain'
                }`}
              />

              {/* Real-Time WebGL2 4K UHD (3840px) Super-Resolution Canvas */}
              {is4kUpscaleActive && (
                <canvas
                  ref={upscale4kCanvasRef}
                  aria-hidden="true"
                  style={{ filter: activeGrade.cssFilter }}
                  className={`pointer-events-none absolute inset-0 h-full w-full transition-[filter] duration-300 ${
                    aspectMode === 'scope_239' || aspectMode === 'imax_full'
                      ? 'object-cover'
                      : 'object-contain'
                  }`}
                />
              )}

              {/* Physical Left & Right Curved Velvet Stage Curtains (dir="ltr" locks exact symmetric outward drape curve) */}
              {hallMode && !videoError && (
                <div
                  dir="ltr"
                  style={{ perspective: '1100px' }}
                  className={`absolute inset-0 z-20 overflow-hidden ${
                    curtainOpen ? 'pointer-events-none' : 'pointer-events-auto'
                  }`}
                >
                  {/* Left Crimson Velvet Curtain with 3D Drape Curvature */}
                  <div
                    aria-hidden="true"
                    style={{
                      transformOrigin: 'left top',
                      transform: curtainOpen
                        ? 'translateX(-91%) rotateY(24deg) skewY(-2.2deg) scaleX(0.84)'
                        : 'translateX(0%) rotateY(4deg) skewY(0deg) scaleX(1)',
                      transition: 'transform 1650ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/2 border-r-[3px] border-[#D4AF37]/75 bg-[repeating-linear-gradient(90deg,#2D060B_0px,#5C0F19_15px,#1C0407_29px,#4A0B14_43px)] shadow-[inset_-28px_0_52px_rgba(0,0,0,0.75),10px_0_28px_rgba(0,0,0,0.88)]"
                  >
                    <div className="absolute inset-y-0 right-1.5 w-px bg-[#F5DE93]/40" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/55" />
                  </div>

                  {/* Right Crimson Velvet Curtain with 3D Drape Curvature */}
                  <div
                    aria-hidden="true"
                    style={{
                      transformOrigin: 'right top',
                      transform: curtainOpen
                        ? 'translateX(91%) rotateY(-24deg) skewY(2.2deg) scaleX(0.84)'
                        : 'translateX(0%) rotateY(-4deg) skewY(0deg) scaleX(1)',
                      transition: 'transform 1650ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    className="pointer-events-none absolute inset-y-0 right-0 w-1/2 border-l-[3px] border-[#D4AF37]/75 bg-[repeating-linear-gradient(90deg,#4A0B14_0px,#1C0407_14px,#5C0F19_28px,#2D060B_43px)] shadow-[inset_28px_0_52px_rgba(0,0,0,0.75),-10px_0_28px_rgba(0,0,0,0.88)]"
                  >
                    <div className="absolute inset-y-0 left-1.5 w-px bg-[#F5DE93]/40" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/55" />
                  </div>

                  {/* Closed-Curtain Premiere Crest & Interactive Draw Curtain CTA */}
                  {!curtainOpen && (
                    <div
                      dir={lang === 'ar' ? 'rtl' : 'ltr'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleHallCurtains(true);
                      }}
                      className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.16),transparent_62%)] px-6 text-center cursor-pointer"
                    >
                      <p className="font-cinema-mono text-[11px] tracking-[0.28em] text-[#D4AF37]">
                        AZ GRAND PREMIERE · SEAT {hallSeat}
                      </p>
                      <h3 className="font-cinema-display text-2xl sm:text-4xl font-bold text-[#F5F5F0] drop-shadow-lg">
                        {primaryTitle}
                      </h3>
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleHallCurtains(true);
                            ensureAudioEngineConnected();
                            videoRef.current?.play().catch(() => {});
                          }}
                          className="flex h-11 items-center gap-2 rounded-lg bg-[#D4AF37] px-5 text-xs font-bold text-[#050505] shadow-[0_0_28px_rgba(212,175,55,0.5)] hover:bg-[#E6C65B] cursor-pointer"
                        >
                          <Sparkles className="h-4 w-4" />
                          <span>
                            {lang === 'ar' ? 'اسحب الستار وابدأ الفيلم' : 'Draw Curtains & Start'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            launch35mmOpeningCeremony();
                          }}
                          className="flex h-11 items-center gap-2 rounded-lg border border-[#D4AF37]/60 bg-black/75 px-4 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/20 cursor-pointer"
                        >
                          <Clapperboard className="h-4 w-4" />
                          <span>
                            {lang === 'ar' ? 'افتتاحية 35mm (3·2·1)' : '35mm Leader (3·2·1)'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Classic 35mm Vintage Optical Countdown Leader (3 -> 2 -> 1) */}
              {hallMode && leaderCount !== null && !videoError && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#090807]/85 backdrop-blur-xs"
                >
                  <div className="relative flex h-40 w-40 sm:h-52 sm:w-52 items-center justify-center rounded-full border-2 border-[#D4AF37]/75 bg-[radial-gradient(circle,rgba(212,175,55,0.14),rgba(5,5,5,0.92))] shadow-[0_0_60px_rgba(212,175,55,0.28)]">
                    <div className="absolute inset-4 rounded-full border border-dashed border-[#D4AF37]/50 animate-spin" />
                    <div className="absolute inset-x-0 h-px bg-[#D4AF37]/35" />
                    <div className="absolute inset-y-0 w-px bg-[#D4AF37]/35" />
                    <span className="font-cinema-mono text-6xl sm:text-7xl font-bold text-[#F5F5F0] drop-shadow-[0_0_24px_rgba(212,175,55,0.75)]">
                      {leaderCount}
                    </span>
                  </div>
                  <p className="mt-4 font-cinema-mono text-[11px] tracking-[0.28em] text-[#D4AF37]/85">
                    AZ 35MM REEL · PROJECTION CALIBRATED
                  </p>
                </div>
              )}

              {/* Live 60fps Split-Screen Optical Color Grade Curtain */}
              {splitCompare && activeGrade.cssFilter !== 'none' && (
                <div
                  onMouseMove={(e) => {
                    if (!draggingSplitRef.current) return;
                    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                    if (!rect) return;
                    const next = ((e.clientX - rect.left) / rect.width) * 100;
                    setSplitPct(Math.max(10, Math.min(90, next)));
                  }}
                  onMouseUp={() => {
                    draggingSplitRef.current = false;
                  }}
                  onMouseLeave={() => {
                    draggingSplitRef.current = false;
                  }}
                  className="absolute inset-0 z-20 select-none"
                >
                  <div
                    aria-hidden="true"
                    style={{
                      backdropFilter: activeGrade.cssFilter,
                      WebkitBackdropFilter: activeGrade.cssFilter,
                      clipPath: `inset(0 0 0 ${splitPct}%)`,
                    }}
                    className="pointer-events-none absolute inset-0"
                  />
                  <div
                    style={{ left: `${splitPct}%` }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      draggingSplitRef.current = true;
                    }}
                    className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-[#D4AF37] shadow-[0_0_16px_rgba(212,175,55,0.85)] cursor-ew-resize"
                  >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-[#D4AF37] bg-[#050505]/90 text-[10px] font-bold text-[#D4AF37]">
                      ⇄
                    </div>
                  </div>
                  <span className="pointer-events-none absolute top-4 start-4 rounded bg-black/75 px-2.5 py-1 text-[10px] font-cinema-mono text-[#F5F5F0]/80">
                    RAW MASTER
                  </span>
                  <span className="pointer-events-none absolute top-4 end-4 rounded bg-black/75 px-2.5 py-1 text-[10px] font-cinema-mono text-[#D4AF37]">
                    {activeGrade.labelEn.toUpperCase()}
                  </span>
                </div>
              )}

              {/* Motorized 2.39:1 Subtle Cinema Matte Top/Bottom Hairlines */}
              {aspectMode === 'scope_239' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 border-y border-[#D4AF37]/20"
                />
              )}

              {/* Animated 35mm Celluloid Optical Grain Canvas */}
              {activeGrade.grain && (
                <canvas
                  ref={grainCanvasRef}
                  width={160}
                  height={90}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-35 mix-blend-overlay"
                />
              )}

              {/* Vintage Vignette Overlay */}
              {cinemaFilter !== 'original' && !splitCompare && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_58%,rgba(0,0,0,0.62)_100%)] mix-blend-multiply"
                />
              )}
            </div>

            {/* Real-Time Mirror-Polished Obsidian Stage Floor Reflection Canvas */}
            {hallMode && !videoError && (
              <div
                aria-hidden="true"
                className="pointer-events-none relative mt-1 h-12 w-[92%] overflow-hidden"
                style={{
                  maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent 95%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent 95%)',
                }}
              >
                <canvas
                  ref={floorMirrorCanvasRef}
                  width={96}
                  height={42}
                  style={{
                    transform: 'perspective(540px) rotateX(68deg) scaleY(-1)',
                    transformOrigin: 'top center',
                  }}
                  className="h-24 w-full opacity-55 blur-[7px] saturate-150"
                />
                <div
                  style={{
                    background: `radial-gradient(ellipse at top, rgba(${hallGlowRgb}, 0.24) 0%, transparent 72%)`,
                  }}
                  className="absolute inset-0"
                />
              </div>
            )}
          </div>

          {/* Interactive Floating Hall HUD (Seat, Camera Angle, House Lights, Ambiance, Curtain Pull, 35mm Countdown) */}
          {hallMode && !videoError && !useNativeControls && (
            <div
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              onClick={(e) => e.stopPropagation()}
              className={`absolute start-4 sm:start-8 top-16 z-30 flex flex-col gap-2 transition-opacity duration-300 ${
                showControls || !curtainOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#D4AF37]/30 bg-black/80 p-1.5 backdrop-blur-md">
                {/* Seat Teleport Button */}
                <button
                  type="button"
                  onClick={() => setShowHallSeatsDrawer((v) => !v)}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-[#D4AF37]/15 px-2.5 text-[11px] font-medium text-[#D4AF37] hover:bg-[#D4AF37]/25 cursor-pointer"
                >
                  <Armchair className="h-3.5 w-3.5" />
                  <span className="font-cinema-mono">
                    {lang === 'ar' ? `المقعد ${hallSeat}` : `Seat ${hallSeat}`}
                  </span>
                </button>

                {/* Open / Close Crimson Curtains Toggle */}
                <button
                  type="button"
                  onClick={() => toggleHallCurtains()}
                  title={
                    curtainOpen
                      ? lang === 'ar'
                        ? 'إغلاق الستار (استراحة)'
                        : 'Close Velvet Curtains (Intermission)'
                      : lang === 'ar'
                        ? 'سحب الستار لبدء العرض'
                        : 'Draw Velvet Curtains Open'
                  }
                  className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    !curtainOpen
                      ? 'bg-[#D4AF37] font-semibold text-[#050505]'
                      : 'text-[#F5F5F0]/85 hover:bg-white/[0.08] hover:text-[#D4AF37]'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    {curtainOpen
                      ? lang === 'ar'
                        ? 'إغلاق الستار'
                        : 'Close Curtain'
                      : lang === 'ar'
                        ? 'اسحب الستار'
                        : 'Open Curtain'}
                  </span>
                </button>

                {/* Auditorium Camera Viewpoints: Seat / VIP Box / IMAX Dome */}
                <button
                  type="button"
                  onClick={() =>
                    setHallCamera((c) =>
                      c === 'seat' ? 'vip_box' : c === 'vip_box' ? 'imax_dome' : 'seat'
                    )
                  }
                  title={lang === 'ar' ? 'تبديل زاوية القاعة: مقعدي / المقصورة الملكية / قبة IMAX' : 'Switch Hall Camera'}
                  className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] transition-colors cursor-pointer ${
                    hallCamera !== 'seat'
                      ? 'bg-[#D4AF37]/25 text-[#D4AF37]'
                      : 'text-[#F5F5F0]/80 hover:bg-white/[0.08]'
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {hallCamera === 'vip_box'
                      ? lang === 'ar'
                        ? 'المقصورة الملكية'
                        : 'VIP Box'
                      : hallCamera === 'imax_dome'
                        ? lang === 'ar'
                          ? 'اندماج IMAX'
                          : 'IMAX Dome'
                        : lang === 'ar'
                          ? 'زاوية المقعد'
                          : 'Seat Cam'}
                  </span>
                </button>

                {/* 3-Stage House Lights Dimmer */}
                <button
                  type="button"
                  onClick={() =>
                    setHallLights((l) =>
                      l === 'warm' ? 'cinema' : l === 'cinema' ? 'blackout' : 'warm'
                    )
                  }
                  title={lang === 'ar' ? 'إضاءة القاعة: دافئة / عرض / ظلام تام' : 'House Lights Dimmer'}
                  className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] transition-colors cursor-pointer ${
                    hallLights === 'warm'
                      ? 'bg-amber-400/20 text-amber-300'
                      : hallLights === 'blackout'
                        ? 'bg-white/10 text-[#F5F5F0]'
                        : 'text-[#F5F5F0]/80 hover:bg-white/[0.08]'
                  }`}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">
                    {hallLights === 'warm'
                      ? lang === 'ar'
                        ? 'أنوار الدخول'
                        : 'Warm Lights'
                      : hallLights === 'blackout'
                        ? lang === 'ar'
                          ? 'ظلام IMAX'
                          : 'Blackout'
                        : lang === 'ar'
                          ? 'إضاءة سينما'
                          : 'Cinema Lights'}
                  </span>
                </button>

                {/* 35mm Hall Ambiance */}
                <button
                  type="button"
                  onClick={() => {
                    if (hallAmbianceOn) {
                      hallAmbianceRef.current?.stop();
                      setHallAmbianceOn(false);
                    } else {
                      if (!hallAmbianceRef.current) {
                        hallAmbianceRef.current = new TheatreAmbianceSynth();
                      }
                      const started = hallAmbianceRef.current.start(false, 0, 0.28);
                      setHallAmbianceOn(started);
                    }
                  }}
                  title={lang === 'ar' ? 'صوت القاعة السينمائية 35mm' : '35mm Cinema Room Ambiance'}
                  className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] transition-colors cursor-pointer ${
                    hallAmbianceOn
                      ? 'bg-[#D4AF37] font-semibold text-[#050505]'
                      : 'text-[#F5F5F0]/75 hover:bg-white/[0.08]'
                  }`}
                >
                  {hallAmbianceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  <span className="hidden lg:inline">
                    {lang === 'ar' ? 'جو القاعة 35mm' : 'Hall Tone'}
                  </span>
                </button>

                {/* 35mm Countdown Leader Trigger */}
                <button
                  type="button"
                  onClick={launch35mmOpeningCeremony}
                  title={lang === 'ar' ? 'تشغيل العد التنازلي 35mm الكلاسيكي' : 'Run 35mm Film Countdown'}
                  className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-[#F5F5F0]/80 hover:bg-white/[0.08] hover:text-[#D4AF37] cursor-pointer"
                >
                  <Clapperboard className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline font-cinema-mono">3·2·1</span>
                </button>

                {/* 4DX Kinetic Motion Recoil Toggle */}
                <button
                  type="button"
                  onClick={() => setFourDxMotion((v) => !v)}
                  title={
                    lang === 'ar'
                      ? 'تفعيل اهتزاز المقعد وموجات 4DX الحسية'
                      : 'Toggle 4DX Kinetic Motion & Bass Halo'
                  }
                  className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors cursor-pointer ${
                    fourDxMotion
                      ? 'bg-[#D4AF37] text-[#050505]'
                      : 'text-[#F5F5F0]/75 hover:bg-white/[0.08]'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span className="font-cinema-mono">4DX</span>
                </button>

                {/* 4DX Weather Atmosphere Switcher */}
                <button
                  type="button"
                  onClick={() =>
                    setFourDxAtmos((prev) =>
                      prev === 'dust'
                        ? 'embers'
                        : prev === 'embers'
                          ? 'rain'
                          : prev === 'rain'
                            ? 'mist'
                            : prev === 'mist'
                              ? 'off'
                              : 'dust'
                    )
                  }
                  title={
                    lang === 'ar'
                      ? 'تبديل طقس القاعة التفاعلي: غبار / جمر / مطر / ضباب'
                      : 'Switch 4DX Atmosphere'
                  }
                  className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] transition-colors cursor-pointer ${
                    fourDxAtmos !== 'off'
                      ? 'bg-white/10 text-[#D4AF37]'
                      : 'text-[#F5F5F0]/55 hover:bg-white/[0.08]'
                  }`}
                >
                  <Wind className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {fourDxAtmos === 'embers'
                      ? lang === 'ar'
                        ? 'جمر'
                        : 'Embers'
                      : fourDxAtmos === 'rain'
                        ? lang === 'ar'
                          ? 'مطر'
                          : 'Rain'
                        : fourDxAtmos === 'mist'
                          ? lang === 'ar'
                            ? 'ضباب'
                            : 'Mist'
                          : fourDxAtmos === 'off'
                            ? lang === 'ar'
                              ? 'صافي'
                              : 'Off'
                            : lang === 'ar'
                              ? 'غبار'
                              : 'Dust'}
                  </span>
                </button>
              </div>

              {showHallSeatsDrawer && (
                <div className="w-64 sm:w-72 space-y-2.5 rounded-xl border border-[#D4AF37]/35 bg-[#0B0B0E]/95 p-3 shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#D4AF37]">
                      {lang === 'ar' ? 'تغيير المقعد مباشرة' : 'Switch Auditorium Seat'}
                    </span>
                    <span className="font-cinema-mono text-[#F5F5F0]/55">
                      {hallBookings.length} {lang === 'ar' ? 'حجز بالقاعة' : 'booked'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {AUDITORIUM_ROWS.map((row) => (
                      <div key={row} className="flex items-center gap-1">
                        <span className="w-4 font-cinema-mono text-[10px] text-[#D4AF37]/75">
                          {row}
                        </span>
                        <div className="grid flex-1 grid-cols-10 gap-1">
                          {AUDITORIUM_COLS.map((col) => {
                            const code = `${row}${col}`;
                            const active = hallSeat === code;
                            const occupied = hallBookings.some((b) => b.seatCode === code);
                            return (
                              <button
                                key={code}
                                type="button"
                                onClick={() => {
                                  setHallSeat(code);
                                  setHallCamera('seat');
                                  saveLocalBookedSeat(film.id, code);
                                  setShowHallSeatsDrawer(false);
                                }}
                                title={code}
                                className={`h-5 rounded text-[9px] font-cinema-mono transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-[#D4AF37] font-bold text-[#050505]'
                                    : occupied
                                      ? 'border border-white/15 bg-white/10 text-[#F5F5F0]/45 hover:border-[#D4AF37]/60'
                                      : 'border border-white/10 bg-[#141216] text-[#F5F5F0]/75 hover:border-[#D4AF37]'
                                }`}
                              >
                                {col}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dual-Row Tiered Sculpted Luxury Cinema Seats Ahead + Royal VIP Balcony Rail */}
          {hallMode && !videoError && (
            <div
              aria-hidden="true"
              style={{
                transform: `translate3d(${hallParallax.x * 4}px, ${-hallParallax.y * 2}px, 0)`,
              }}
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-end overflow-hidden transition-transform duration-300"
            >
              {hallCamera === 'vip_box' ? (
                /* Sleek Brushed Brass Royal Balcony Rail when viewing from VIP Balcony */
                <div className="w-full max-w-6xl px-6 pb-2">
                  <div className="h-2.5 w-full rounded-full border-t border-[#F5DE93]/55 bg-gradient-to-b from-[#6B5014] to-[#1A1205] shadow-[0_-6px_28px_rgba(212,175,55,0.22)]" />
                  <div className="mx-auto flex w-[92%] justify-between px-4">
                    {[0, 1, 2, 3, 4, 5, 6].map((post) => (
                      <div key={post} className="h-7 w-1.5 bg-gradient-to-b from-[#6B5014] to-[#080604]" />
                    ))}
                  </div>
                </div>
              ) : (
                /* Sculpted Cinema Seats Ahead with Real-Time Scene Rim Highlight */
                <div className="flex w-full max-w-5xl items-end justify-center gap-2 sm:gap-3.5 px-4 opacity-75">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((colIdx) => {
                    const frontRowIdx = Math.max(0, seatPerspective.rowIndex - 1);
                    const frontRowCode = `${AUDITORIUM_ROWS[frontRowIdx]}${colIdx}`;
                    const isGuestSeated =
                      seatPerspective.rowIndex > 0 &&
                      hallBookings.some((b) => b.seatCode === frontRowCode);
                    return (
                      <div
                        key={colIdx}
                        className={`relative flex-1 flex flex-col items-center ${
                          colIdx === 5 ? 'me-6 sm:me-14' : ''
                        }`}
                      >
                        {isGuestSeated && (
                          <div className="mb-0.5 h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-[#191418] ring-1 ring-[#D4AF37]/30" />
                        )}
                        <div
                          style={{
                            boxShadow: `0 -4px 18px rgba(${hallGlowRgb}, 0.16)`,
                            borderColor: `rgba(${hallGlowRgb}, 0.28)`,
                          }}
                          className="h-8 sm:h-11 w-full rounded-t-2xl border-t border-x bg-gradient-to-b from-[#1F1216] via-[#100B0D] to-[#050505] transition-shadow duration-300"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex h-4 w-full items-center justify-center gap-3 border-t border-[#D4AF37]/15 bg-gradient-to-t from-black to-[#080608]">
                <span className="font-cinema-mono text-[9px] tracking-[0.24em] text-[#D4AF37]/70">
                  {hallCamera === 'vip_box'
                    ? 'AZ ROYAL BALCONY BOX · VIP'
                    : hallCamera === 'imax_dome'
                      ? 'AZ IMAX DOME IMMERSION'
                      : `AZ GRAND AUDITORIUM · SEAT ${hallSeat}`}
                </span>
                {hallBookings.length > 0 && (
                  <span className="font-cinema-mono text-[9px] tracking-[0.14em] text-[#F5F5F0]/45">
                    · {hallBookings.length} {lang === 'ar' ? 'ضيوف بالقاعة' : 'GUESTS'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Live Rising Audience Reaction Sparks Constellation */}
          {seatSparks.length > 0 && !videoError && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-8 top-16 z-20 overflow-hidden"
            >
              {seatSparks.map((spark) => (
                <div
                  key={spark.id}
                  style={{
                    left: `${spark.leftPct}%`,
                    bottom: '6%',
                    backgroundColor: spark.color,
                    boxShadow: `0 0 14px ${spark.color}`,
                    animationDelay: `${spark.delayMs}ms`,
                  }}
                  className="az-seat-spark-rise absolute h-2 w-2 rounded-full"
                />
              ))}
            </div>
          )}

          {/* Live Director's Chromatic Frame DNA Prism & Waveform HUD */}
          {showLivePrism && !videoError && (
            <div
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              onClick={(e) => e.stopPropagation()}
              className="absolute end-4 sm:end-8 top-16 z-30 w-64 rounded-xl border border-[#D4AF37]/35 bg-[#08080C]/90 p-3 backdrop-blur-md shadow-2xl"
            >
              <div className="mb-2 flex items-center justify-between text-[10px] tracking-[0.14em] text-[#D4AF37]">
                <span>{lang === 'ar' ? 'طيف اللقطة الحية' : 'LIVE FRAME DNA'}</span>
                <button
                  type="button"
                  onClick={() => setShowLivePrism(false)}
                  className="text-[#F5F5F0]/55 hover:text-[#D4AF37] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mb-2.5 grid grid-cols-5 gap-1.5">
                {livePrismSwatches.map((hex, i) => (
                  <button
                    key={`${hex}-${i}`}
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(hex);
                      setCopiedSwatch(hex);
                      window.setTimeout(() => setCopiedSwatch(null), 1200);
                    }}
                    title={hex}
                    className="group flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <span
                      style={{ backgroundColor: hex }}
                      className="h-6 w-full rounded-md border border-white/15 transition-transform group-hover:scale-105"
                    />
                    <span className="font-cinema-mono text-[9px] text-[#F5F5F0]/65">
                      {copiedSwatch === hex ? 'OK' : hex.slice(1)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex h-7 items-end gap-1 rounded-md border border-white/[0.06] bg-black/55 px-1.5 py-1">
                {liveWaveBars.map((val, idx) => (
                  <div
                    key={idx}
                    style={{
                      height: `${Math.round(val * 100)}%`,
                      backgroundColor: livePrismSwatches[idx % livePrismSwatches.length],
                    }}
                    className="flex-1 rounded-t-xs transition-all duration-150"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hidden Offscreen Video Sampler for Timeline Hover Frame Thumbnails */}
          {!activeUrl.toLowerCase().includes('.m3u8') && (
            <video
              ref={previewVideoRef}
              src={activeUrl}
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
              className="hidden"
            />
          )}

          {/* Timecode-Synced Scene Margin Annotation */}
          {activeMarginNote && !showEndCredits && (
            <div
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              onClick={(e) => e.stopPropagation()}
              className="absolute start-4 sm:start-8 bottom-28 z-20 max-w-sm rounded-xl border border-[#D4AF37]/45 bg-black/80 px-4 py-3 backdrop-blur-md shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 text-[11px] text-[#D4AF37]">
                <span className="font-semibold">
                  {activeMarginNote.isDirectorNote
                    ? lang === 'ar'
                      ? 'رؤية المخرج'
                      : "Director's Note"
                    : activeMarginNote.authorName}
                </span>
                <span className="font-cinema-mono">{formatTime(activeMarginNote.timeSec)}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#F5F5F0]/90">
                {activeMarginNote.text}
              </p>
            </div>
          )}

          {/* Watch Party Synchronized Lounge Side Drawer */}
          {watchParty && showPartyLounge && (
            <div
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              onClick={(e) => e.stopPropagation()}
              className="absolute end-4 top-20 bottom-28 z-30 flex w-72 sm:w-80 flex-col rounded-2xl border border-[#D4AF37]/35 bg-[#0B0B0E]/92 p-4 backdrop-blur-md shadow-2xl"
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#D4AF37]">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>{lang === 'ar' ? 'قاعة العرض المشترك' : 'Watch Party'}</span>
                    <span className="font-cinema-mono">#{watchParty.partyId}</span>
                  </div>
                  <p className="text-[10px] text-[#F5F5F0]/55">
                    {watchParty.isHost
                      ? lang === 'ar'
                        ? 'أنت المضيف — التشغيل متزامن مع الضيوف'
                        : 'You are host — playback synced to guests'
                      : lang === 'ar'
                        ? 'وضع الضيف — متزامن تلقائياً مع المضيف'
                        : 'Guest mode — synced to host playback'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPartyLounge(false)}
                  aria-label="Hide lounge"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-[#F5F5F0]/60 hover:text-[#D4AF37] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyPartyInvite}
                className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[11px] font-medium text-[#D4AF37] hover:bg-[#D4AF37]/20 cursor-pointer"
              >
                {copiedPartyLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>
                  {copiedPartyLink
                    ? lang === 'ar'
                      ? 'تم نسخ رابط الدعوة!'
                      : 'Invite Link Copied!'
                    : lang === 'ar'
                      ? 'نسخ رابط دعوة الأصدقاء'
                      : 'Copy Invite Link'}
                </span>
              </button>

              <div className="my-3 flex-1 space-y-2 overflow-y-auto pe-1">
                {partyMessages.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#F5F5F0]/45">
                    {lang === 'ar'
                      ? 'أرسل أول تعليق مباشر داخل الغرفة.'
                      : 'Send the first live screening note.'}
                  </p>
                ) : (
                  partyMessages.map((msg) => (
                    <div
                      key={msg.messageId}
                      className="rounded-lg border border-white/[0.06] bg-[#050505]/80 px-2.5 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="font-semibold text-[#D4AF37]">{msg.authorName}</span>
                        <span className="font-cinema-mono text-[#F5F5F0]/40">
                          {formatTime(msg.filmTimeSec)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[#F5F5F0]/85">{msg.text}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendPartyChat} className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  maxLength={240}
                  value={partyMsgInput}
                  onChange={(e) => setPartyMsgInput(e.target.value)}
                  placeholder={lang === 'ar' ? 'اهمس للقاعة...' : 'Message room...'}
                  className="h-9 flex-1 rounded-lg border border-white/15 bg-[#050505] px-2.5 text-xs text-[#F5F5F0] placeholder:text-[#F5F5F0]/35 focus:border-[#D4AF37] focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4AF37] text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* Emotional Pulse Reaction Dock */}
          {!videoError && !showEndCredits && upNextCountdown === null && (
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute end-4 sm:end-8 z-20 flex flex-col items-end gap-2 transition-opacity duration-300 ${
                useNativeControls ? 'bottom-20' : 'bottom-28'
              } ${showControls || useNativeControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              {floatingPulse && (
                <div
                  key={floatingPulse.key}
                  className="animate-bounce rounded-full border border-[#D4AF37]/60 bg-black/80 px-2.5 py-1 text-xs text-[#D4AF37] shadow-lg"
                >
                  {floatingPulse.kind === 'fire'
                    ? '🔥 +1'
                    : floatingPulse.kind === 'shock'
                      ? '⚡ +1'
                      : '❤️ +1'}
                </div>
              )}

              <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/75 p-1.5 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => handleSendPulse('fire')}
                  title={lang === 'ar' ? 'نبض حماس' : 'Hype Pulse'}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-400 hover:bg-white/10 cursor-pointer"
                >
                  <Flame className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSendPulse('shock')}
                  title={lang === 'ar' ? 'نبض مفاجأة' : 'Shock Pulse'}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-sky-400 hover:bg-white/10 cursor-pointer"
                >
                  <Zap className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSendPulse('heart')}
                  title={lang === 'ar' ? 'نبض تأثر' : 'Heart Pulse'}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-400 hover:bg-white/10 cursor-pointer"
                >
                  <Heart className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {showEndCredits && (
            <PersonalizedEndCredits
              film={film}
              nextFilm={nextFilm}
              defaultViewerName={viewerDefaultName}
              lang={lang}
              onReplay={() => {
                setShowEndCredits(false);
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play().catch(() => {});
                }
              }}
              onPlayNext={onPlayNextFilm}
              onClose={onClose}
            />
          )}

          {upNextCountdown !== null && nextFilm && onPlayNextFilm && (
            <div
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 px-6 backdrop-blur-sm"
            >
              <div className="max-w-md w-full space-y-5 rounded-2xl border border-[#D4AF37]/40 bg-[#0B0B0E] p-7 text-center shadow-2xl">
                <p className="text-xs font-medium tracking-[0.18em] text-[#D4AF37]">
                  {lang === 'ar'
                    ? `العمل التالي خلال ${upNextCountdown} ثوانٍ`
                    : `UP NEXT IN ${upNextCountdown}s`}
                </p>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-[#F5F5F0]">
                    {lang === 'ar' ? nextFilm.titleAr : nextFilm.titleEn}
                  </h3>
                  <p className="font-cinema-display text-xs tracking-[0.16em] text-[#D4AF37]/80">
                    {lang === 'ar' ? nextFilm.titleEn : nextFilm.titleAr}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onPlayNextFilm(nextFilm)}
                    className="flex h-11 items-center gap-2 rounded-lg bg-[#D4AF37] px-5 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>{lang === 'ar' ? 'مشاهدة الآن' : 'Watch Next'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUpNextCountdown(null);
                      if (videoRef.current) {
                        videoRef.current.currentTime = 0;
                        videoRef.current.play().catch(() => {});
                      }
                    }}
                    className="h-11 rounded-lg border border-white/15 px-4 text-xs font-medium text-[#F5F5F0]/85 hover:border-white/30 cursor-pointer"
                  >
                    {lang === 'ar' ? 'إعادة الفيلم' : 'Replay'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-11 rounded-lg border border-white/10 px-4 text-xs text-[#F5F5F0]/60 hover:text-[#F5F5F0] cursor-pointer"
                  >
                    {t(lang, 'closePlayer')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {videoError && (
            <div
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 px-6"
            >
              <div className="max-w-md space-y-4 rounded-xl border border-red-500/30 bg-[#121216] p-6 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
                <p className="text-sm leading-relaxed text-[#F5F5F0]">{videoError}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVideoError(null);
                      setUseNativeControls(true);
                    }}
                    className="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#050505] cursor-pointer"
                  >
                    {lang === 'ar' ? 'تجربة المشغل الأصلي' : 'Try Native Player'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-[#F5F5F0] hover:border-white/30 cursor-pointer"
                  >
                    {t(lang, 'closePlayer')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isPlaying && !videoError && !useNativeControls && upNextCountdown === null && !showEndCredits && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              aria-label={t(lang, 'play')}
              className="absolute z-20 flex h-20 w-20 items-center justify-center rounded-full border border-[#D4AF37]/60 bg-black/60 text-[#D4AF37] backdrop-blur-md transition-transform hover:scale-105 cursor-pointer"
            >
              <Play className="h-8 w-8 fill-current ml-1" />
            </button>
          )}

          {/* Interactive Startup Ceremony: Ambient Gold Auditorium Dimmer Flicker + 3D Curved Velvet Curtains */}
          {entrancePhase !== 'done' && !videoError && (
            <div
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
                setEntranceTilt({
                  x: Number((nx * 2.5).toFixed(2)),
                  y: Number((ny * 1.5).toFixed(2)),
                });
              }}
              onMouseLeave={() => setEntranceTilt({ x: 0, y: 0 })}
              onClick={(e) => {
                e.stopPropagation();
                openCurtainsAndPlayNow();
              }}
              className={`absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-[#020203] transition-opacity duration-500 ${
                entrancePhase === 'dissolve' ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            >
              {/* Soft Ambient Gold Dimmer Flicker Overhead Dome & Floor Wash */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
                  entrancePhase === 'flicker'
                    ? 'az-ambient-gold-flicker'
                    : entrancePhase === 'curtains'
                      ? 'opacity-45'
                      : 'opacity-0'
                }`}
                style={{
                  background:
                    'radial-gradient(ellipse 72% 48% at 50% 14%, rgba(212, 175, 55, 0.28), transparent 72%), radial-gradient(circle at 50% 54%, rgba(212, 175, 55, 0.14), transparent 64%)',
                }}
              />

              {/* Left & Right Ambient Gold Auditorium Wall Sconces (soft tungsten flicker) */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-12 left-3 sm:left-7 z-20 flex flex-col justify-around transition-opacity duration-700 ${
                  entrancePhase === 'flicker' || entrancePhase === 'curtains'
                    ? 'opacity-90'
                    : 'opacity-0'
                }`}
              >
                <div className="az-sconce-warm-pulse h-20 w-1.5 rounded-full bg-[#E6C65B] shadow-[0_0_32px_rgba(212,175,55,0.85)]" />
                <div className="az-sconce-warm-pulse h-16 w-1 rounded-full bg-[#D4AF37]/80 shadow-[0_0_24px_rgba(212,175,55,0.65)]" />
              </div>
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-12 right-3 sm:right-7 z-20 flex flex-col justify-around transition-opacity duration-700 ${
                  entrancePhase === 'flicker' || entrancePhase === 'curtains'
                    ? 'opacity-90'
                    : 'opacity-0'
                }`}
              >
                <div className="az-sconce-warm-pulse h-20 w-1.5 rounded-full bg-[#E6C65B] shadow-[0_0_32px_rgba(212,175,55,0.85)]" />
                <div className="az-sconce-warm-pulse h-16 w-1 rounded-full bg-[#D4AF37]/80 shadow-[0_0_24px_rgba(212,175,55,0.65)]" />
              </div>

              {/* Proscenium Top Gold Seam */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/80 to-transparent transition-opacity duration-700 ${
                  entrancePhase === 'flicker' || entrancePhase === 'curtains'
                    ? 'opacity-100'
                    : 'opacity-20'
                }`}
              />

              {/* Interactive 3D Curved Crimson Velvet Curtains (dir="ltr" locks exact symmetric bend) */}
              <div
                dir="ltr"
                style={{ perspective: '1150px' }}
                className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
              >
                {/* Left Curved Velvet Curtain */}
                <div
                  aria-hidden="true"
                  style={{
                    transformOrigin: 'left top',
                    transform:
                      entrancePhase === 'curtains' || entrancePhase === 'dissolve'
                        ? `translateX(-94%) rotateY(${25 + entranceTilt.x}deg) skewY(-2.4deg) scaleX(0.82)`
                        : entrancePhase === 'flicker'
                          ? `translateX(-3%) rotateY(${8 + entranceTilt.x}deg) skewY(-0.6deg) scaleX(0.98)`
                          : 'translateX(0%) rotateY(3deg) skewY(0deg) scaleX(1)',
                    transition: 'transform 1250ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  className="pointer-events-auto absolute inset-y-0 left-0 w-1/2 cursor-pointer border-r-[3px] border-[#D4AF37]/75 bg-[repeating-linear-gradient(90deg,#240509_0px,#520D16_16px,#170306_30px,#430A12_44px)] shadow-[inset_-30px_0_54px_rgba(0,0,0,0.78),12px_0_30px_rgba(0,0,0,0.9)]"
                >
                  <div className="absolute inset-y-0 right-1.5 w-px bg-[#F5DE93]/45" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/65" />
                  <div className="absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-[#D4AF37]/12 to-transparent" />
                </div>

                {/* Right Curved Velvet Curtain */}
                <div
                  aria-hidden="true"
                  style={{
                    transformOrigin: 'right top',
                    transform:
                      entrancePhase === 'curtains' || entrancePhase === 'dissolve'
                        ? `translateX(94%) rotateY(${-25 + entranceTilt.x}deg) skewY(2.4deg) scaleX(0.82)`
                        : entrancePhase === 'flicker'
                          ? `translateX(3%) rotateY(${-8 + entranceTilt.x}deg) skewY(0.6deg) scaleX(0.98)`
                          : 'translateX(0%) rotateY(-3deg) skewY(0deg) scaleX(1)',
                    transition: 'transform 1250ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  className="pointer-events-auto absolute inset-y-0 right-0 w-1/2 cursor-pointer border-l-[3px] border-[#D4AF37]/75 bg-[repeating-linear-gradient(90deg,#430A12_0px,#170306_14px,#520D16_28px,#240509_44px)] shadow-[inset_30px_0_54px_rgba(0,0,0,0.78),-12px_0_30px_rgba(0,0,0,0.9)]"
                >
                  <div className="absolute inset-y-0 left-1.5 w-px bg-[#F5DE93]/45" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/65" />
                  <div className="absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-[#D4AF37]/12 to-transparent" />
                </div>
              </div>

              {/* Center Auditorium Stage Title & Interactive Draw Curtains Controls */}
              <div
                className={`relative z-30 flex flex-col items-center gap-3 px-6 text-center transition-all duration-700 ${
                  entrancePhase === 'flicker'
                    ? 'opacity-100 translate-y-0 scale-100'
                    : entrancePhase === 'curtains'
                      ? 'opacity-85 -translate-y-1 scale-[0.99]'
                      : 'opacity-55 translate-y-1 scale-[0.98]'
                }`}
              >
                <p className="font-cinema-display text-xs tracking-[0.34em] text-[#D4AF37]">
                  AZ FILMS · PRIVATE SCREENING
                </p>
                <h3 className="text-2xl sm:text-4xl font-bold text-[#F5F5F0] drop-shadow-[0_4px_24px_rgba(212,175,55,0.28)]">
                  {primaryTitle}
                </h3>
                <div className="h-px w-24 bg-gradient-to-r from-transparent via-[#D4AF37]/80 to-transparent" />
                <p className="text-xs text-[#F5F5F0]/75">
                  {entrancePhase === 'curtains'
                    ? lang === 'ar'
                      ? 'انحناء الستائر المخملية وبدء العرض السينمائي'
                      : 'Parting velvet drapes · Opening projection'
                    : lang === 'ar'
                      ? 'وميض خافت لأضواء القاعة الذهبية وتعتيم الشاشة'
                      : 'Soft ambient gold house lights dimming'}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCurtainsAndPlayNow();
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg bg-[#D4AF37] px-4 text-xs font-bold text-[#050505] shadow-[0_0_24px_rgba(212,175,55,0.4)] hover:bg-[#E6C65B] cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>
                      {lang === 'ar' ? 'فتح الستار وبدء العرض' : 'Draw Curtains & Play'}
                    </span>
                  </button>
                  {mode === 'film' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHallMode(true);
                        setFourDxMotion(true);
                        setFourDxAtmos('embers');
                        openCurtainsAndPlayNow();
                      }}
                      className="flex h-10 items-center gap-2 rounded-lg border border-[#D4AF37]/65 bg-[#D4AF37]/15 px-4 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/25 cursor-pointer"
                    >
                      <Armchair className="h-3.5 w-3.5" />
                      <span>
                        {lang === 'ar' ? 'دخول صالة 3D 4DX الكاملة' : 'Enter 3D 4DX Hall'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearEntranceTimers();
                      setEntrancePhase('done');
                      videoRef.current?.play().catch(() => {});
                    }}
                    className="h-10 rounded-lg border border-white/20 bg-black/70 px-3.5 text-[11px] font-medium text-[#F5F5F0]/80 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] cursor-pointer"
                  >
                    {lang === 'ar' ? 'تخطي الافتتاحية' : 'Skip Intro'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sleek Bottom Cinema Controls */}
      {hasStream && !embedUrl && !videoError && !useNativeControls && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-5 pt-12 sm:px-8 transition-opacity duration-300 ${
            showControls
              ? theaterDim && isPlaying
                ? 'opacity-50 hover:opacity-100'
                : 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Interactive Film Heartbeat Graph above timeline */}
          {pulses.length > 0 && (
            <div className="mb-1.5 flex items-center gap-3">
              <span className="w-14 text-[10px] font-medium text-[#D4AF37]/80">
                {lang === 'ar' ? 'نبض المشهد' : 'PULSE'}
              </span>
              <div className="flex flex-1 items-end gap-[2px] h-5">
                {heartbeatBuckets.map((ratio, idx) => (
                  <div
                    key={idx}
                    className="flex-1 rounded-t-sm bg-[#D4AF37]/65 transition-all duration-300"
                    style={{ height: `${Math.round(ratio * 100)}%` }}
                  />
                ))}
              </div>
              <span className="w-20 text-right text-[10px] tabular-nums text-[#F5F5F0]/45">
                {pulses.length} {lang === 'ar' ? 'نبضة' : 'pulses'}
              </span>
            </div>
          )}

          {/* Timeline Seek Bar with Live Hover Frame Thumbnail Preview & A-B Loop Markers */}
          <div className="mb-3 flex items-center gap-3">
            <span className="font-cinema-mono text-xs text-[#F5F5F0]/80 w-14">
              {formatTime(currentTime)}
            </span>
            <div
              className="relative flex-1 flex items-center"
              onMouseMove={handleTimelineHover}
              onMouseLeave={() => setHoverScrub(null)}
            >
              {/* Floating Scrub Preview Card */}
              {hoverScrub && (
                <div
                  style={{ left: `${Math.min(92, Math.max(8, hoverScrub.pct))}%` }}
                  className="pointer-events-none absolute bottom-7 z-40 -translate-x-1/2 overflow-hidden rounded-lg border border-[#D4AF37]/45 bg-[#0B0B0E] p-1.5 shadow-2xl"
                >
                  <canvas
                    ref={previewCanvasRef}
                    width={160}
                    height={90}
                    className={`rounded bg-black ${hoverScrub.hasFrame ? 'block mb-1' : 'hidden'}`}
                  />
                  <div className="flex items-center justify-center gap-2 px-1.5 py-0.5 text-[11px]">
                    <span className="font-cinema-mono text-[#F5F5F0]">
                      {formatTime(hoverScrub.time)}
                    </span>
                    {hoverScrub.pulseHits > 0 && (
                      <span className="text-[#D4AF37] tabular-nums">
                        · {hoverScrub.pulseHits} {lang === 'ar' ? 'نبضة' : 'pulses'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="relative h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                {loopA !== null && duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 bg-[#D4AF37]/35"
                    style={{
                      left: `${(loopA / duration) * 100}%`,
                      width:
                        loopB !== null && loopB > loopA
                          ? `${((loopB - loopA) / duration) * 100}%`
                          : '2px',
                    }}
                  />
                )}
                <div
                  className="h-full bg-[#D4AF37]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.5}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                aria-label="Seek timeline"
                className="absolute inset-0 h-6 w-full cursor-pointer opacity-0"
              />
            </div>
            <span className="font-cinema-mono text-xs text-[#F5F5F0]/60 w-20 text-right">
              -{formatTime(remainingTime)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? t(lang, 'pause') : t(lang, 'play')}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#F5F5F0] hover:text-[#D4AF37] cursor-pointer"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
              </button>

              <button
                type="button"
                onClick={() => seekBy(-10)}
                aria-label="Rewind 10 seconds"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#F5F5F0]/80 hover:text-[#F5F5F0] cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => seekBy(10)}
                aria-label="Forward 10 seconds"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#F5F5F0]/80 hover:text-[#F5F5F0] cursor-pointer"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              <div className="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label="Toggle Mute"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#F5F5F0]/80 hover:text-[#F5F5F0] cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4 text-[#D4AF37]" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  aria-label="Volume"
                  className="w-20 accent-[#D4AF37] cursor-pointer"
                />
              </div>

              {/* Real-time Web Audio Spectrum Visualizer when audio DSP active */}
              {audioConnected && isPlaying && (
                <canvas
                  ref={spectrumCanvasRef}
                  width={56}
                  height={20}
                  aria-hidden="true"
                  className="hidden md:block opacity-85"
                />
              )}

              <span className="hidden lg:inline font-cinema-mono text-xs text-[#F5F5F0]/50">
                {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Director 24fps Deck (Frame Step, Speed, A-B Loop) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowDirectorDeck((v) => !v);
                    setShowQualityMenu(false);
                  }}
                  className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    playbackRate !== 1 || loopA !== null || showDirectorDeck
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]'
                      : 'border-white/15 bg-black/50 text-[#F5F5F0] hover:border-[#D4AF37]/60'
                  }`}
                >
                  <Clapperboard className="h-3.5 w-3.5 text-[#D4AF37]" />
                  <span className="hidden sm:inline">
                    {playbackRate !== 1
                      ? `${playbackRate}×`
                      : lang === 'ar'
                        ? 'المخرج'
                        : 'Director'}
                  </span>
                </button>

                {showDirectorDeck && (
                  <div
                    dir={lang === 'ar' ? 'rtl' : 'ltr'}
                    className="absolute bottom-11 right-0 z-40 w-72 rounded-xl border border-white/15 bg-[#0B0B0E]/95 p-3.5 shadow-2xl backdrop-blur-md space-y-3"
                  >
                    <div className="space-y-1.5">
                      <p className="text-[10px] tracking-[0.14em] text-[#D4AF37]/80">
                        {lang === 'ar' ? 'دراسة إطار بإطار (24fps)' : '24FPS FRAME STEP'}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => stepFrame(-1)}
                          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] text-xs text-[#F5F5F0] hover:border-[#D4AF37]/60 cursor-pointer"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          <span>{lang === 'ar' ? 'إطار للخلف' : '-1 Frame'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => stepFrame(1)}
                          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] text-xs text-[#F5F5F0] hover:border-[#D4AF37]/60 cursor-pointer"
                        >
                          <span>{lang === 'ar' ? 'إطار للأمام' : '+1 Frame'}</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 border-t border-white/10 pt-2.5">
                      <p className="text-[10px] tracking-[0.14em] text-[#D4AF37]/80">
                        {lang === 'ar' ? 'سرعة العرض' : 'PLAYBACK SPEED'}
                      </p>
                      <div className="grid grid-cols-6 gap-1">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => setPlaybackRate(rate)}
                            className={`h-8 rounded-md text-[11px] font-cinema-mono transition-colors cursor-pointer ${
                              playbackRate === rate
                                ? 'bg-[#D4AF37] font-bold text-[#050505]'
                                : 'bg-white/[0.05] text-[#F5F5F0]/80 hover:bg-white/10'
                            }`}
                          >
                            {rate}×
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 border-t border-white/10 pt-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] tracking-[0.14em] text-[#D4AF37]/80">
                          {lang === 'ar' ? 'تكرار مشهد A–B' : 'A–B SCENE LOOP'}
                        </p>
                        {(loopA !== null || loopB !== null) && (
                          <button
                            type="button"
                            onClick={() => {
                              setLoopA(null);
                              setLoopB(null);
                            }}
                            className="text-[11px] text-[#F5F5F0]/60 hover:text-[#D4AF37] cursor-pointer"
                          >
                            {lang === 'ar' ? 'مسح' : 'Clear'}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setLoopA(currentTime);
                            if (loopB !== null && loopB <= currentTime) setLoopB(null);
                          }}
                          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs cursor-pointer ${
                            loopA !== null
                              ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]'
                              : 'border-white/15 bg-white/[0.04] text-[#F5F5F0]/80'
                          }`}
                        >
                          <Repeat className="h-3.5 w-3.5" />
                          <span>
                            A {loopA !== null ? `(${formatTime(loopA)})` : ''}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (loopA === null) {
                              setLoopA(Math.max(0, currentTime - 5));
                            }
                            setLoopB(currentTime);
                          }}
                          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs cursor-pointer ${
                            loopB !== null
                              ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]'
                              : 'border-white/15 bg-white/[0.04] text-[#F5F5F0]/80'
                          }`}
                        >
                          <Repeat className="h-3.5 w-3.5" />
                          <span>
                            B {loopB !== null ? `(${formatTime(loopB)})` : ''}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-white/10 pt-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] tracking-[0.14em] text-[#D4AF37]/80">
                          {lang === 'ar' ? 'تعليقات التوقيت الحي' : 'SCENE ANNOTATIONS'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowSceneNotesOverlay((v) => !v)}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                            showSceneNotesOverlay
                              ? 'bg-[#D4AF37]/20 text-[#D4AF37]'
                              : 'bg-white/[0.06] text-[#F5F5F0]/55'
                          }`}
                        >
                          {showSceneNotesOverlay
                            ? lang === 'ar'
                              ? 'ظاهرة'
                              : 'On'
                            : lang === 'ar'
                              ? 'مخفية'
                              : 'Off'}
                        </button>
                      </div>
                      <form onSubmit={handlePinCurrentNote} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={quickSceneNote}
                          onChange={(e) => setQuickSceneNote(e.target.value)}
                          maxLength={220}
                          placeholder={
                            lang === 'ar'
                              ? `تثبيت ملاحظة عند ${formatTime(currentTime)}...`
                              : `Pin note at ${formatTime(currentTime)}...`
                          }
                          className="h-8 flex-1 rounded-md border border-white/15 bg-black/50 px-2.5 text-[11px] text-[#F5F5F0] placeholder-[#F5F5F0]/35 outline-none focus:border-[#D4AF37]/60"
                        />
                        <button
                          type="submit"
                          disabled={!quickSceneNote.trim()}
                          aria-label={lang === 'ar' ? 'تثبيت' : 'Pin'}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#D4AF37] text-[#050505] disabled:opacity-40 cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {qualities.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQualityMenu((v) => !v);
                      setShowDirectorDeck(false);
                    }}
                    title={
                      upscale4kStats && is4kUpscaleActive
                        ? `4K UHD ${upscale4kStats.w}×${upscale4kStats.h}`
                        : lang === 'ar'
                          ? 'جودة العرض'
                          : 'Playback Quality'
                    }
                    className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      is4kQualitySelected && !webgl4kUnsupported
                        ? 'border-[#D4AF37]/70 bg-[#D4AF37]/15 text-[#D4AF37] hover:bg-[#D4AF37]/25'
                        : 'border-white/15 bg-black/50 text-[#F5F5F0] hover:border-[#D4AF37]/60'
                    }`}
                  >
                    <Settings className="h-3.5 w-3.5 text-[#D4AF37]" />
                    <span className="font-cinema-mono">
                      {is4kQualitySelected ? '4K UHD' : selectedQuality?.label}
                    </span>
                  </button>
                  {showQualityMenu && (
                    <div className="absolute bottom-11 right-0 min-w-[175px] rounded-xl border border-white/15 bg-[#0E0E12]/95 p-1.5 shadow-2xl backdrop-blur-md">
                      <p className="px-2.5 py-1 text-[10px] tracking-[0.14em] text-[#D4AF37]/80">
                        {lang === 'ar' ? 'دقة العرض الفائقة' : 'STREAM RESOLUTION'}
                      </p>
                      {qualities.map((q) => {
                        const isSelected =
                          selectedQuality?.label === q.label && selectedQuality?.url === q.url;
                        const is4kOpt = /4k|2160|uhd/i.test(q.label);
                        return (
                          <button
                            key={`${q.label}-${q.url}`}
                            type="button"
                            onClick={() => {
                              setSelectedQuality(q);
                              setShowQualityMenu(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#D4AF37]/20 font-semibold text-[#D4AF37]'
                                : 'text-[#F5F5F0]/80 hover:bg-white/[0.06]'
                            }`}
                          >
                            <span>{q.label}</span>
                            {is4kOpt && (
                              <span className="font-cinema-mono text-[10px] text-[#D4AF37]">
                                2160p
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? t(lang, 'exitFullscreen') : t(lang, 'fullscreen')}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#F5F5F0]/85 hover:text-[#D4AF37] cursor-pointer"
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {captureError && (
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          className="fixed bottom-24 start-1/2 z-50 -translate-x-1/2 rounded-lg border border-[#D4AF37]/40 bg-[#121216] px-4 py-2.5 text-xs text-[#F5F5F0] shadow-2xl"
        >
          {captureError}
        </div>
      )}

      {capturedFrameUrl && (
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClick={() => setCapturedFrameUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-[#D4AF37]/35 bg-[#0B0B0E] p-5 sm:p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[#D4AF37]">
                <Camera className="h-4 w-4" />
                <h3 className="text-sm sm:text-base font-bold text-[#F5F5F0]">
                  {lang === 'ar' ? 'لوحة الكادر السينمائي' : 'Captured Cinema Frame'}
                </h3>
                <span className="font-cinema-mono text-xs text-[#D4AF37]/80">
                  {capturedFrameTime}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCapturedFrameUrl(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#F5F5F0]/70 hover:text-[#D4AF37] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#050505]">
              <img
                src={capturedFrameUrl}
                alt="Captured cinema frame"
                className="w-full h-auto object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddFrameToStrip}
                  className="h-10 rounded-lg border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-3.5 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/20 cursor-pointer"
                >
                  {lang === 'ar'
                    ? `أضف لشريط 35mm (${stripFrames.length}/3)`
                    : `Add to 35mm Strip (${stripFrames.length}/3)`}
                </button>
                {stripFrames.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleBuildCelluloidStrip()}
                    className="h-10 rounded-lg border border-white/20 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#F5F5F0] hover:border-[#D4AF37] cursor-pointer"
                  >
                    {lang === 'ar' ? 'توليد شريط 35mm' : 'Generate 35mm Strip'}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setCapturedFrameUrl(null)}
                  className="h-10 rounded-lg border border-white/15 px-4 text-xs font-medium text-[#F5F5F0]/80 hover:border-white/30 cursor-pointer"
                >
                  {lang === 'ar' ? 'متابعة المشاهدة' : 'Resume Film'}
                </button>
                <button
                  type="button"
                  onClick={handleShareCapturedFrame}
                  className="flex h-10 items-center gap-2 rounded-lg border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-4 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/20 cursor-pointer"
                >
                  <Share2 className="h-4 w-4" />
                  <span>{lang === 'ar' ? 'مشاركة اللقطة' : 'Share Frame'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCapturedFrame}
                  className="flex h-10 items-center gap-2 rounded-lg bg-[#D4AF37] px-5 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>{lang === 'ar' ? 'حفظ البوستر (PNG)' : 'Save Poster (PNG)'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stripSheetUrl && (
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClick={() => setStripSheetUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#D4AF37]/40 bg-[#0B0B0E] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[#D4AF37]">
                {lang === 'ar' ? 'شريط سيلولويد 35mm (1080×1920)' : '35mm Celluloid Contact Sheet'}
              </h3>
              <button
                type="button"
                onClick={() => setStripSheetUrl(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#F5F5F0]/70 hover:text-[#D4AF37] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[65vh] overflow-hidden rounded-xl border border-white/10 bg-black flex justify-center">
              <img
                src={stripSheetUrl}
                alt="35mm celluloid film strip"
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setStripFrames([]);
                  setStripSheetUrl(null);
                }}
                className="h-10 rounded-lg border border-white/15 px-3 text-xs text-[#F5F5F0]/70 hover:text-[#F5F5F0] cursor-pointer"
              >
                {lang === 'ar' ? 'شريط جديد' : 'Reset Strip'}
              </button>
              <a
                href={stripSheetUrl}
                download={`az-films-${film.id}-35mm-strip.png`}
                className="flex h-10 items-center gap-2 rounded-lg bg-[#D4AF37] px-5 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B]"
              >
                <Download className="h-4 w-4" />
                <span>{lang === 'ar' ? 'تنزيل شريط 35mm (PNG)' : 'Download 35mm Strip'}</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
