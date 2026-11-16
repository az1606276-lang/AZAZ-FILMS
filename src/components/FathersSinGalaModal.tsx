import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Armchair,
  AudioWaveform,
  Camera,
  Check,
  Clapperboard,
  Download,
  Flame,
  Heart,
  MessageSquare,
  Pause,
  Play,
  Send,
  Smartphone,
  Sparkles,
  Ticket,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Cinema4kUpscaler } from '../services/cinema4kUpscaler';
import { CinemaAudioEngine } from '../services/cinemaAudioEngine';
import {
  getSavedViewerCreditName,
  saveViewerCreditName,
  sendFilmPulse,
  sendPresenceHeartbeat,
  subscribeFilmPresenceCount,
  subscribeFilmPulses,
} from '../services/cinemaPulseService';
import { fetchFilmComments, submitFilmComment } from '../services/commentService';
import type { AppLanguage, Film, FilmComment } from '../types/cinema';

export const FATHERS_SIN_GALA_VIDEO_URL =
  '/assets/aistudio/WhatsApp_Video_2026-11-16_at_12.00.38_PM_6b39e3e9.mp4';

interface GalaChapter {
  id: string;
  timeSec: number;
  timeLabel: string;
  titleAr: string;
  titleEn: string;
  noteAr: string;
  noteEn: string;
  accentRgb: string;
}

const GALA_CHAPTERS: GalaChapter[] = [
  {
    id: 'red-carpet',
    timeSec: 0,
    timeLabel: '00:00',
    titleAr: 'السجادة الحمراء وبوابة AZ FILMS',
    titleEn: 'Red Carpet & Exterior Searchlights',
    noteAr: 'وصول الضيوف تحت أضواء السماء أمام قاعة AZ FILMS الكبرى',
    noteEn: 'Guests arrive under sky searchlights at the grand AZ FILMS facade',
    accentRgb: '212, 175, 55',
  },
  {
    id: 'golden-stage',
    timeSec: 10,
    timeLabel: '00:10',
    titleAr: 'الشلال الذهبي وافتتاح المسرح',
    titleEn: 'Golden Stage Waterfall Reveal',
    noteAr: 'إضاءة شاشة العرض العملاقة وظهور شعار AZ FILMS أمام الحضور',
    noteEn: 'The grand screen illuminates as AZ FILMS opens the auditorium ceremony',
    accentRgb: '235, 190, 90',
  },
  {
    id: 'opening-host',
    timeSec: 20,
    timeLabel: '00:20',
    titleAr: 'الكلمة الافتتاحية وتقديم ذنب أبوي',
    titleEn: "Opening Address & Father's Sin Poster",
    noteAr: 'ترحيب المقدم بالحضور وكشف الهوية البصرية الرسمية للفيلم',
    noteEn: "Host welcomes attendees and unveils the official Father's Sin visual reveal",
    accentRgb: '212, 175, 55',
  },
  {
    id: 'director-speech',
    timeSec: 77,
    timeLabel: '01:17',
    titleAr: 'كلمة المخرج عبدالعزيز الثنيان',
    titleEn: 'Director Abdulaziz Al-Thunayan',
    noteAr: 'حديث صريح عن رحلة العمل والشغف خلف صناعة ذنب أبوي وساق له 70',
    noteEn: "Director shares candid memories behind crafting Father's Sin and Saq Lah 70",
    accentRgb: '220, 175, 70',
  },
  {
    id: 'stars-stage',
    timeSec: 163,
    timeLabel: '02:43',
    titleAr: 'صعود النجمين نايف ومطلق',
    titleEn: 'Stars Naif & Mutlaq Take Stage',
    noteAr: 'تحية الجمهور الحارة ولحظات عفوية مع أبطال الفيلم على خشبة المسرح',
    noteEn: 'Warm audience cheers and candid banter as lead stars step onto the stage',
    accentRgb: '240, 196, 95',
  },
  {
    id: 'bts-reel',
    timeSec: 212,
    timeLabel: '03:32',
    titleAr: 'عرض خاص من كواليس التصوير',
    titleEn: 'Exclusive Behind-the-Scenes Reel',
    noteAr: 'مشاهد لم تُعرض من قبل: رسم الستوري بورد، الكلاكيت، الكرين، والدرون',
    noteEn: 'Never-before-seen footage: storyboards, Scene 9 slate, cranes & color suite',
    accentRgb: '185, 155, 95',
  },
  {
    id: 'cast-panel',
    timeSec: 287,
    timeLabel: '04:47',
    titleAr: 'الجلسة الحوارية مع الطاقم والنجوم',
    titleEn: 'Cast & Crew Live Stage Panel',
    noteAr: 'حوار مفتوح مع عبدالعزيز، نايف، مطلق، فهد، سعد، أبو سعد، مشعل وشرق القحطاني',
    noteEn: 'Full ensemble Q&A with director, actors, and production voices',
    accentRgb: '212, 175, 55',
  },
  {
    id: 'hall-entry',
    timeSec: 404,
    timeLabel: '06:44',
    titleAr: 'العبور عبر بوابة صالة العرض الكبرى',
    titleEn: 'Entering the Grand Screening Hall',
    noteAr: 'مسيرة الضيوف نحو المقاعد وأصوات الحماس مع فهد وسعد قبل العرض',
    noteEn: 'Walkthrough past the illuminated portal with live reactions from Fahad & Saad',
    accentRgb: '198, 162, 72',
  },
  {
    id: 'curtain-screening',
    timeSec: 470,
    timeLabel: '07:50',
    titleAr: 'تعتيم القاعة وبداية العرض العالمي',
    titleEn: 'Auditorium Blackout & World Premiere',
    noteAr: 'إطفاء أنوار الصالة وسط سطوع شعاع العرض على شاشة ذنب أبوي',
    noteEn: "House lights fade out as the projector beam locks onto Father's Sin",
    accentRgb: '245, 210, 115',
  },
];

interface GalaGuestStar {
  id: string;
  name: string;
  roleAr: string;
  roleEn: string;
  jumpSec: number;
  highlightAr: string;
  highlightEn: string;
}

const GALA_GUEST_STARS: GalaGuestStar[] = [
  {
    id: 'abdulaziz',
    name: 'عبدالعزيز الثنيان',
    roleAr: 'المخرج وصاحب الرؤية',
    roleEn: 'Director',
    jumpSec: 77,
    highlightAr: 'يقود رؤية فيلم ذنب أبوي ويشارك كواليس التحضير وروح الفريق.',
    highlightEn: "Leads Father's Sin vision and shares the creative journey on stage.",
  },
  {
    id: 'naif',
    name: 'نايف',
    roleAr: 'البطولة',
    roleEn: 'Lead Cast',
    jumpSec: 163,
    highlightAr: 'يصعد وسط تصفيق القاعة مع مواقف عفوية وتحديات تجسيد الشخصية.',
    highlightEn: 'Steps onto stage to warm applause and shares character insights.',
  },
  {
    id: 'mutlaq',
    name: 'مطلق',
    roleAr: 'البطولة',
    roleEn: 'Lead Cast',
    jumpSec: 175,
    highlightAr: 'أحد أبرز أبطال العمل وحواراته المرحة على المسرح أشعلت تفاعل الجمهور.',
    highlightEn: 'Co-lead whose spontaneous stage banter lit up the auditorium.',
  },
  {
    id: 'fahad',
    name: 'فهد',
    roleAr: 'طاقم التمثيل',
    roleEn: 'Cast Member',
    jumpSec: 422,
    highlightAr: 'يشارك انطباعه الحماسي لحظة دخول الضيوف إلى صالة العرض الكبرى.',
    highlightEn: 'Shares immediate excitement upon stepping into the grand hall.',
  },
  {
    id: 'saad',
    name: 'سعد',
    roleAr: 'طاقم التمثيل',
    roleEn: 'Cast Member',
    jumpSec: 446,
    highlightAr: 'يؤكد أن الفيلم يجمع بين لحظات الضحك والتوتر الإنساني المؤثر.',
    highlightEn: 'Highlights the emotional balance of humor and dramatic tension.',
  },
  {
    id: 'abusaad',
    name: 'أبو سعد',
    roleAr: 'شخصية محورية',
    roleEn: 'Featured Cast',
    jumpSec: 326,
    highlightAr: 'يتحدث عن ثقل المشاهد الدرامية أمام الكاميرا وتجربة التصوير.',
    highlightEn: 'Reflects on intense dramatic scenes during principal photography.',
  },
  {
    id: 'mishal',
    name: 'مشعل',
    roleAr: 'طاقم التمثيل',
    roleEn: 'Cast Member',
    jumpSec: 356,
    highlightAr: 'يحكي عن كواليس التحول السريع بين الكواليس وأداء المشاهد.',
    highlightEn: 'Shares behind-the-scenes camaraderie on set.',
  },
  {
    id: 'sharq',
    name: 'شرق القحطاني',
    roleAr: 'فريق العمل',
    roleEn: 'Production Crew',
    jumpSec: 382,
    highlightAr: 'يسلط الضوء على التناغم الفني خلف الكاميرات طوال أيام التصوير.',
    highlightEn: 'Speaks on seamless crew coordination across every shooting day.',
  },
];

const VIP_SEAT_ZONES = [
  { code: 'VIP-A1', labelAr: 'المقعد الملكي · وسط الصف الأول', labelEn: 'Royal Center · Row A1' },
  { code: 'VIP-B2', labelAr: 'صف المخرجين · إطلالة المسرح', labelEn: 'Directors Row · Stage View' },
  { code: 'VIP-C4', labelAr: 'وسط الحضور · قلب القاعة', labelEn: 'Heart of the Crowd · C4' },
  { code: 'VIP-S1', labelAr: 'جناح النجوم والمصورين', labelEn: 'Cast Balcony · VIP-S1' },
];

function synthesizeApplauseSwell(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const dur = 1.9;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(2, bufSize, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < bufSize; i++) {
        const t = i / ctx.sampleRate;
        const clapBurst = Math.sin(t * 26 + ch * 1.1) > 0.25 ? 1 : 0.45;
        const env = Math.sin(Math.min(1, t / 0.35) * (Math.PI / 2)) * Math.pow(1 - t / dur, 1.3);
        data[i] = (Math.random() * 2 - 1) * clapBurst * env * 0.42;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1350;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.36;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    window.setTimeout(() => ctx.close().catch(() => {}), 2200);
  } catch {
    // Ignore Web Audio autoplay restriction
  }
}

function formatGalaTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface FathersSinGalaModalProps {
  film: Film | null;
  lang: AppLanguage;
  defaultViewerName?: string;
  onClose: () => void;
  onOpenFilmDetails?: (film: Film) => void;
}

export function FathersSinGalaModal({
  film,
  lang,
  defaultViewerName,
  onClose,
  onOpenFilmDetails,
}: FathersSinGalaModalProps) {
  const [stage, setStage] = useState<'checkin' | 'hall'>('checkin');
  const [showEntranceVeil, setShowEntranceVeil] = useState(false);
  const [guestName, setGuestName] = useState(() => getSavedViewerCreditName(defaultViewerName));
  const [selectedSeat, setSelectedSeat] = useState('VIP-A1');
  const [perspective, setPerspective] = useState<'front' | 'crowd'>('crowd');
  // Keep Spatial Web Audio DSP opt-in so native <video> audio/playback never stalls on iOS/mobile
  const [spatialAudioOn, setSpatialAudioOn] = useState(false);
  const [useNativeControls, setUseNativeControls] = useState(false);
  const [lightStickOn, setLightStickOn] = useState(false);
  const [flashBurst, setFlashBurst] = useState(false);
  const [applauseBurst, setApplauseBurst] = useState(false);
  const [galaGlowRgb, setGalaGlowRgb] = useState('212, 175, 55');

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [needsUnmuteTap, setNeedsUnmuteTap] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(486);
  const [isMuted, setIsMuted] = useState(false);

  const [activeAttendees, setActiveAttendees] = useState(1);
  const [applauseTotal, setApplauseTotal] = useState(0);
  const [selectedStar, setSelectedStar] = useState<GalaGuestStar>(GALA_GUEST_STARS[0]);
  const [activeSideTab, setActiveSideTab] = useState<'chapters' | 'cast' | 'guestbook'>('chapters');
  const [comments, setComments] = useState<FilmComment[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [ticketDataUrl, setTicketDataUrl] = useState<string | null>(null);
  const [uhd4kEnabled, setUhd4kEnabled] = useState(true);
  const [webgl4kUnsupported, setWebgl4kUnsupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const upscale4kCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const upscaler4kRef = useRef<Cinema4kUpscaler | null>(null);
  const audioEngineRef = useRef<CinemaAudioEngine | null>(null);

  const filmId = film?.id || 'fathers-sin';
  const galaSrc =
    film?.trailerUrl && film.trailerUrl.trim() ? film.trailerUrl.trim() : FATHERS_SIN_GALA_VIDEO_URL;
  const is4kUpscaleActive =
    stage === 'hall' && uhd4kEnabled && !useNativeControls && !videoError && !webgl4kUnsupported;

  const activeChapter = useMemo(() => {
    let current = GALA_CHAPTERS[0];
    for (const ch of GALA_CHAPTERS) {
      if (currentTime >= ch.timeSec) current = ch;
    }
    return current;
  }, [currentTime]);

  useEffect(() => {
    sendPresenceHeartbeat(filmId, true);
    const hb = window.setInterval(() => sendPresenceHeartbeat(filmId, true), 20000);
    const unsubPresence = subscribeFilmPresenceCount(filmId, setActiveAttendees);
    const unsubPulses = subscribeFilmPulses(filmId, (pts) => {
      setApplauseTotal(pts.length);
    });
    fetchFilmComments(filmId).then(setComments).catch(() => {});

    return () => {
      window.clearInterval(hb);
      unsubPresence();
      unsubPulses();
      sendPresenceHeartbeat(filmId, false);
      audioEngineRef.current?.dispose();
      audioEngineRef.current = null;
    };
  }, [filmId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ticketDataUrl) {
          setTicketDataUrl(null);
        } else {
          onClose();
        }
      } else if (
        e.key === ' ' &&
        stage === 'hall' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, ticketDataUrl, onClose]);

  // Real-time screen-to-auditorium color sampling
  useEffect(() => {
    if (stage !== 'hall') return;
    let rafId = 0;
    let lastSample = 0;

    const tick = (now: number) => {
      const video = videoRef.current;
      const canvas = sampleCanvasRef.current;
      if (video && canvas && video.readyState >= 2 && now - lastSample >= 320) {
        lastSample = now;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const px = ctx.getImageData(12, 7, 1, 1).data;
            const r = Math.min(255, Math.max(85, px[0]));
            const g = Math.min(255, Math.max(70, px[1]));
            const b = Math.min(255, Math.max(45, px[2]));
            setGalaGlowRgb(`${r}, ${g}, ${b}`);
          } catch {
            setGalaGlowRgb(activeChapter.accentRgb);
          }
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [stage, activeChapter.accentRgb]);

  // Real-time WebGL 4K UHD (3840x2160) Super-Resolution Upscaler for Gala Stage
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
      sharpness: 0.72,
      onUnsupported: () => setWebgl4kUnsupported(true),
    });
    upscaler4kRef.current = engine;
    engine.startLoop(video);

    return () => {
      engine.dispose();
      if (upscaler4kRef.current === engine) {
        upscaler4kRef.current = null;
      }
    };
  }, [is4kUpscaleActive, galaSrc]);

  const toggleSpatialDsp = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!spatialAudioOn) {
      if (!audioEngineRef.current) {
        audioEngineRef.current = new CinemaAudioEngine();
      }
      const status = audioEngineRef.current.attach(video);
      if (status.connected) {
        audioEngineRef.current.resumeIfNeeded();
        audioEngineRef.current.applyPreset('spatial3d');
        audioEngineRef.current.setSpatialSeat(
          perspective === 'crowd' ? 0 : 0.05,
          perspective === 'crowd' ? 0.42 : 0.16
        );
        setSpatialAudioOn(true);
      }
    } else {
      audioEngineRef.current?.applyPreset('studio');
      setSpatialAudioOn(false);
    }
  };

  const attemptVideoPlay = async (video: HTMLVideoElement | null) => {
    if (!video) return;
    setVideoError(null);
    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      // Autoplay with audio blocked -> retry muted so video immediately moves and show 1-tap unmute button
      try {
        video.muted = true;
        setIsMuted(true);
        await video.play();
        setIsPlaying(true);
        setNeedsUnmuteTap(true);
      } catch {
        setIsPlaying(false);
        setUseNativeControls(true);
      }
    }
  };

  const enterRedCarpetCeremony = (e?: FormEvent) => {
    e?.preventDefault();
    const clean = guestName.trim() || (lang === 'ar' ? 'ضيف الشرف' : 'VIP Guest');
    setGuestName(clean);
    saveViewerCreditName(clean);

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setStage('hall');
    if (!prefersReduced) {
      setShowEntranceVeil(true);
      synthesizeApplauseSwell();
      window.setTimeout(() => setShowEntranceVeil(false), 1450);
    }

    // Play immediately right after React commits the <video> mount (double rAF keeps direct gesture close)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void attemptVideoPlay(videoRef.current);
      });
    });
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (spatialAudioOn) {
        audioEngineRef.current?.resumeIfNeeded();
      }
      void attemptVideoPlay(video);
    } else {
      video.pause();
    }
  };

  const jumpToTimestamp = (sec: number) => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = sec;
      setCurrentTime(sec);
    } catch {
      // Wait for metadata if seeking too early
    }
    if (video.paused) {
      void attemptVideoPlay(video);
    }
  };

  const handleUnmuteTap = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setIsMuted(false);
    setNeedsUnmuteTap(false);
    if (video.paused) {
      void video.play().catch(() => {});
    }
  };

  const triggerStandingOvation = () => {
    synthesizeApplauseSwell();
    setApplauseBurst(true);
    setApplauseTotal((n) => n + 1);
    window.setTimeout(() => setApplauseBurst(false), 1600);
    void sendFilmPulse(filmId, 'heart', currentTime, duration || 486);
  };

  const triggerPressFlash = () => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    setFlashBurst(true);
    window.setTimeout(() => setFlashBurst(false), 380);
  };

  const handlePostGuestbook = async (e: FormEvent) => {
    e.preventDefault();
    const cleanText = noteInput.trim();
    const author = guestName.trim() || (lang === 'ar' ? 'ضيف العرض الأول' : 'Premiere Guest');
    if (!cleanText || submittingNote) return;
    setSubmittingNote(true);
    try {
      const created = await submitFilmComment(
        filmId,
        `${author} · ${selectedSeat}`,
        `[${formatGalaTime(currentTime)}] ${cleanText}`
      );
      setComments((prev) => [created, ...prev]);
      setNoteInput('');
      void sendFilmPulse(filmId, 'fire', currentTime, duration || 486);
    } finally {
      setSubmittingNote(false);
    }
  };

  const generateVipTicketPng = () => {
    const w = 1080;
    const h = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createRadialGradient(w * 0.5, h * 0.28, 60, w * 0.5, h * 0.5, 1100);
    grad.addColorStop(0, '#241B0A');
    grad.addColorStop(0.55, '#0B0A0D');
    grad.addColorStop(1, '#050505');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.72)';
    ctx.lineWidth = 4;
    ctx.strokeRect(56, 56, w - 112, h - 112);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(78, 78, w - 156, h - 156);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 32px Georgia, serif';
    ctx.fillText('A Z   F I L M S   ·   W O R L D   P R E M I E R E', w / 2, 190);

    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 108px sans-serif';
    ctx.fillText('ذنب أبوي', w / 2, 470);

    ctx.fillStyle = '#D4AF37';
    ctx.font = '600 40px Georgia, serif';
    ctx.fillText("FATHER'S SIN  —  GALA NIGHT", w / 2, 555);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(220, 670);
    ctx.lineTo(w - 220, 670);
    ctx.stroke();

    ctx.fillStyle = 'rgba(245, 245, 240, 0.6)';
    ctx.font = '500 28px sans-serif';
    ctx.fillText('GUEST OF HONOR  ·  ضيف الشرف', w / 2, 790);

    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 62px sans-serif';
    ctx.fillText(guestName.trim() || 'VIP GUEST', w / 2, 885);

    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 54px monospace';
    ctx.fillText(`SEAT  ${selectedSeat}`, w / 2, 1060);

    ctx.fillStyle = 'rgba(245, 245, 240, 0.72)';
    ctx.font = '500 30px sans-serif';
    ctx.fillText('إخراج: عبدالعزيز الثنيان', w / 2, 1280);
    ctx.fillText('بطولة: نايف · مطلق · فهد · سعد', w / 2, 1345);

    ctx.fillStyle = 'rgba(212, 175, 55, 0.78)';
    ctx.font = '600 24px monospace';
    ctx.fillText('VERIFIED OFFICIAL GALA PASS · AZ FILMS HALL', w / 2, 1730);

    setTicketDataUrl(canvas.toDataURL('image/png'));
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const isFinalCurtainMoment = currentTime >= 468;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#040406] text-[#F5F5F0]"
    >
      {/* Ambient Stage Color Reflection Backdrop */}
      <div
        aria-hidden="true"
        style={{
          background: `radial-gradient(ellipse 75% 55% at 50% 18%, rgba(${galaGlowRgb}, ${
            applauseBurst ? 0.34 : 0.16
          }), transparent 72%)`,
        }}
        className="pointer-events-none absolute inset-0 transition-all duration-500"
      />

      <canvas ref={sampleCanvasRef} width={24} height={14} className="hidden" />

      {/* Top Gala Navigation Strip */}
      <header className="relative z-30 flex items-center justify-between gap-4 border-b border-white/[0.08] bg-black/75 px-4 py-3 backdrop-blur-md sm:px-8 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-cinema-display text-sm tracking-[0.2em] text-[#D4AF37] shrink-0">
            AZ FILMS
          </span>
          <span aria-hidden="true" className="text-white/25">
            ·
          </span>
          <h2 className="truncate text-sm sm:text-base font-bold text-[#F5F5F0]">
            {lang === 'ar'
              ? 'حفل التقديم العالمي — فيلم ذنب أبوي'
              : "World Gala Premiere — Father's Sin"}
          </h2>
          <span className="hidden md:inline text-xs text-[#D4AF37]/85 tabular-nums shrink-0">
            · {activeAttendees} {lang === 'ar' ? 'في القاعة' : 'attending'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {stage === 'hall' && (
            <>
              <button
                type="button"
                onClick={generateVipTicketPng}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-3 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#050505] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Ticket className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {lang === 'ar' ? 'تذكرتك VIP' : 'VIP Pass'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setUseNativeControls((v) => !v)}
                title={lang === 'ar' ? 'تبديل مشغل المتصفح المباشر' : 'Native Video Controls'}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  useNativeControls
                    ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]'
                    : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-white/30'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
              </button>
              {film && onOpenFilmDetails && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFilmDetails(film);
                  }}
                  className="hidden sm:flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs text-[#F5F5F0]/85 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'صفحة الفيلم' : 'Film Page'}</span>
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق القاعة' : 'Close Gala'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-[#F5F5F0] hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* STAGE 1: VIP RED CARPET CHECK-IN */}
      {stage === 'checkin' && (
        <div className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-8">
          <div className="w-full max-w-3xl rounded-2xl border border-[#D4AF37]/30 bg-[#0B0B0E]/95 p-6 sm:p-10 shadow-[0_32px_100px_rgba(0,0,0,0.9)] space-y-8">
            <div className="space-y-3 text-center">
              <p className="font-cinema-mono text-xs tracking-[0.26em] text-[#D4AF37]">
                AZ GRAND AUDITORIUM · RED CARPET ENTRANCE
              </p>
              <h1 className="text-3xl sm:text-5xl font-bold text-[#F5F5F0] text-balance">
                {lang === 'ar' ? 'ليلة تقديم فيلم ذنب أبوي' : "Father's Sin — Gala Premiere Night"}
              </h1>
              <p className="mx-auto max-w-xl text-sm leading-relaxed text-[#F5F5F0]/75">
                {lang === 'ar'
                  ? 'ادخل قاعة العرض الكبرى وعِش الحفل لحظة بلحظة مع المخرج عبدالعزيز الثنيان ونجوم العمل؛ بتصفيق القاعة، الصوت المكاني، وكواليس لم تُعرض من قبل.'
                  : 'Step into the grand premiere hall alongside director Abdulaziz Al-Thunayan and the cast with live applause, spatial acoustics, and synced stage chapters.'}
              </p>
            </div>

            <form onSubmit={enterRedCarpetCeremony} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#D4AF37]">
                  {lang === 'ar' ? 'اسمك على بطاقة الدعوة الرسمية' : 'Your Name on the Official Invite'}
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder={lang === 'ar' ? 'اكتب اسمك للدخول على السجادة الحمراء...' : 'Enter your name...'}
                  className="h-12 w-full rounded-xl border border-white/15 bg-[#050505] px-4 text-sm text-[#F5F5F0] placeholder:text-[#F5F5F0]/35 focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-[#D4AF37]">
                  {lang === 'ar' ? 'اختر مقعدك داخل حفل التقديم' : 'Select Your Gala Seat'}
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {VIP_SEAT_ZONES.map((seat) => {
                    const active = selectedSeat === seat.code;
                    return (
                      <button
                        key={seat.code}
                        type="button"
                        onClick={() => setSelectedSeat(seat.code)}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-start transition-colors cursor-pointer ${
                          active
                            ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5F5F0]'
                            : 'border-white/10 bg-[#050505] text-[#F5F5F0]/75 hover:border-white/25'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-cinema-mono text-xs font-bold text-[#D4AF37]">
                            {seat.code}
                          </p>
                          <p className="truncate text-xs mt-0.5">
                            {lang === 'ar' ? seat.labelAr : seat.labelEn}
                          </p>
                        </div>
                        {active && <Check className="h-4 w-4 text-[#D4AF37] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
                <div className="text-xs text-[#F5F5F0]/60">
                  {lang === 'ar'
                    ? 'إخراج عبدالعزيز الثنيان · نايف · مطلق · فهد · سعد'
                    : 'Directed by Abdulaziz Al-Thunayan · Live Premiere Event'}
                </div>
                <button
                  type="submit"
                  className="flex h-12 items-center gap-2.5 rounded-xl bg-[#D4AF37] px-7 text-sm font-bold text-[#050505] shadow-[0_0_32px_rgba(212,175,55,0.4)] hover:bg-[#E6C65B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {lang === 'ar' ? 'ادخل السجادة الحمراء والقاعة' : 'Enter Red Carpet & Hall'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STAGE 2: INTERACTIVE LIVING GALA AUDITORIUM */}
      {stage === 'hall' && (
        <div className="relative z-10 flex flex-1 flex-col overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-12">
          {/* Auditorium Stage & Video Viewport */}
          <div className="relative flex flex-col justify-between bg-[#030305] p-3 sm:p-5 lg:col-span-8 min-h-0">
            {/* Paparazzi Press Flash Overlay */}
            {flashBurst && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(circle_at_20%_20%,rgba(255,250,230,0.42),transparent_40%),radial-gradient(circle_at_82%_26%,rgba(255,250,230,0.38),transparent_42%)]"
              />
            )}

            {/* Ambient Gold & Fade-to-Black Red Carpet Entrance Veil */}
            {showEntranceVeil && (
              <div
                onClick={() => setShowEntranceVeil(false)}
                className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#020203]/95 p-6 text-center backdrop-blur-sm cursor-pointer"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(ellipse 65% 48% at 50% 24%, rgba(212, 175, 55, 0.26), transparent 72%)',
                  }}
                />
                <div className="relative z-10 space-y-3">
                  <p className="font-cinema-mono text-xs tracking-[0.26em] text-[#D4AF37]">
                    WELCOME · SEAT {selectedSeat}
                  </p>
                  <h2 className="text-2xl sm:text-4xl font-bold text-[#F5F5F0]">
                    {lang === 'ar' ? `أهلاً بك، ${guestName}` : `Welcome, ${guestName}`}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#F5F5F0]/75">
                    {lang === 'ar'
                      ? 'تُعتّم أنوار القاعة وتُضاء المنصة الذهبية...'
                      : 'Auditorium lights dimming · Stage spotlight illuminated...'}
                  </p>
                </div>
              </div>
            )}

            {/* Top Live Moment Strip */}
            <div className="relative z-20 mb-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <p className="text-[11px] font-cinema-mono text-[#D4AF37]">
                  {activeChapter.timeLabel} ·{' '}
                  {lang === 'ar' ? activeChapter.titleAr : activeChapter.titleEn}
                </p>
                <p className="truncate text-xs text-[#F5F5F0]/70">
                  {lang === 'ar' ? activeChapter.noteAr : activeChapter.noteEn}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {!webgl4kUnsupported && (
                  <button
                    type="button"
                    onClick={() => setUhd4kEnabled((v) => !v)}
                    title={lang === 'ar' ? 'تفعيل معالجة 4K UHD الفائقة' : 'Toggle 4K UHD Super-Resolution'}
                    className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-cinema-mono font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      uhd4kEnabled && !useNativeControls
                        ? 'border-[#D4AF37]/80 bg-[#D4AF37]/20 text-[#D4AF37]'
                        : 'border-white/15 bg-black/60 text-[#F5F5F0]/75 hover:border-white/30'
                    }`}
                  >
                    <span>4K UHD</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPerspective((p) => (p === 'crowd' ? 'front' : 'crowd'))}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    perspective === 'crowd'
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]'
                      : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-white/30'
                  }`}
                >
                  <Armchair className="h-3.5 w-3.5" />
                  <span>
                    {perspective === 'crowd'
                      ? lang === 'ar'
                        ? 'وسط الحضور 3D'
                        : 'In Crowd 3D'
                      : lang === 'ar'
                        ? 'الصف الأول'
                        : 'Front Stage'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleSpatialDsp}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    spatialAudioOn
                      ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]'
                      : 'border-white/15 bg-black/60 text-[#F5F5F0]/80 hover:border-white/30'
                  }`}
                >
                  <AudioWaveform className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {lang === 'ar' ? 'صوت القاعة 3D' : 'Hall DSP'}
                  </span>
                </button>
              </div>
            </div>

            {/* 3D Framed Gala Stage Screen */}
            <div
              className="relative flex flex-1 items-center justify-center min-h-[220px]"
              style={{ perspective: '1200px' }}
            >
              <div
                style={{
                  transform:
                    perspective === 'crowd'
                      ? 'rotateX(1.8deg) scale(0.97)'
                      : 'rotateX(0deg) scale(1)',
                  boxShadow: `0 24px 80px rgba(0,0,0,0.95), 0 0 65px rgba(${galaGlowRgb}, ${
                    applauseBurst ? 0.35 : 0.16
                  })`,
                }}
                className="relative aspect-video w-full max-h-[56vh] overflow-hidden rounded-xl border border-[#D4AF37]/30 bg-black transition-transform duration-500"
              >
                <video
                  ref={videoRef}
                  src={galaSrc}
                  playsInline
                  controls={useNativeControls}
                  preload="auto"
                  onClick={useNativeControls ? undefined : togglePlay}
                  onPlay={() => {
                    setIsPlaying(true);
                    setIsBuffering(false);
                    setVideoError(null);
                  }}
                  onPause={() => setIsPlaying(false)}
                  onWaiting={() => setIsBuffering(true)}
                  onCanPlay={() => setIsBuffering(false)}
                  onLoadedMetadata={() => {
                    const dur = videoRef.current?.duration;
                    if (dur && isFinite(dur)) setDuration(dur);
                  }}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentTime(videoRef.current.currentTime || 0);
                  }}
                  onError={() => {
                    setIsBuffering(false);
                    setVideoError(
                      lang === 'ar'
                        ? 'تعذر تحميل بث الحفل على هذا المتصفح. جرّب تفعيل المشغل الأصلي أو الفتح عبر Chrome / Safari.'
                        : 'Unable to load Gala video stream on this browser. Try Native Controls or Chrome / Safari.'
                    );
                  }}
                  className="h-full w-full object-contain cursor-pointer"
                />

                {is4kUpscaleActive && (
                  <canvas
                    ref={upscale4kCanvasRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                  />
                )}

                {!isPlaying && !useNativeControls && !videoError && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={lang === 'ar' ? 'تشغيل الحفل' : 'Play Gala'}
                    className="absolute inset-0 z-10 m-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#D4AF37]/80 bg-black/75 text-[#D4AF37] backdrop-blur-sm hover:scale-105 transition-transform cursor-pointer"
                  >
                    <Play className="h-7 w-7 fill-current ml-0.5" />
                  </button>
                )}

                {isBuffering && !videoError && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                    <span className="h-10 w-10 animate-spin rounded-full border-2 border-[#D4AF37] border-t-transparent" />
                  </div>
                )}

                {needsUnmuteTap && isPlaying && (
                  <button
                    type="button"
                    onClick={handleUnmuteTap}
                    className="absolute top-3 start-3 z-20 flex items-center gap-2 rounded-lg bg-[#D4AF37] px-3.5 py-2 text-xs font-bold text-[#050505] shadow-lg hover:bg-[#E6C65B] cursor-pointer"
                  >
                    <Volume2 className="h-4 w-4" />
                    <span>{lang === 'ar' ? 'اضغط لتفعيل الصوت' : 'Tap to Unmute'}</span>
                  </button>
                )}

                {videoError && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/90 p-5 text-center">
                    <AlertCircle className="h-8 w-8 text-red-400" />
                    <p className="max-w-md text-xs sm:text-sm text-[#F5F5F0]">{videoError}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setVideoError(null);
                          setUseNativeControls(true);
                          videoRef.current?.load();
                          void attemptVideoPlay(videoRef.current);
                        }}
                        className="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#050505] cursor-pointer"
                      >
                        {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                      </button>
                      <a
                        href={galaSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-white/20 px-4 py-2 text-xs font-medium text-[#F5F5F0] hover:border-[#D4AF37]"
                      >
                        {lang === 'ar' ? 'فتح الفيديو مباشرة' : 'Open Video Directly'}
                      </a>
                    </div>
                  </div>
                )}

                {applauseBurst && (
                  <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
                    <div className="rounded-lg border border-[#D4AF37]/70 bg-black/80 px-4 py-1.5 text-xs font-bold text-[#D4AF37] shadow-xl">
                      {lang === 'ar'
                        ? `تصفيق القاعة يرتفع · مقعد ${selectedSeat}`
                        : `Auditorium Applause Rising · Seat ${selectedSeat}`}
                    </div>
                  </div>
                )}

                {isFinalCurtainMoment && film && onOpenFilmDetails && (
                  <div className="absolute inset-x-4 bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/60 bg-black/88 px-4 py-3 backdrop-blur-md">
                    <div>
                      <p className="text-xs font-bold text-[#D4AF37]">
                        {lang === 'ar' ? 'تعتيم صالة العرض الكبرى' : 'Grand Screening Blackout'}
                      </p>
                      <p className="text-[11px] text-[#F5F5F0]/75">
                        {lang === 'ar'
                          ? 'انتهت مراسم التقديم وبدأت لحظة فيلم ذنب أبوي'
                          : "Ceremony concludes as Father's Sin takes the main screen"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenFilmDetails(film);
                      }}
                      className="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
                    >
                      {lang === 'ar' ? 'الانتقال لصفحة ذنب أبوي' : "Open Father's Sin"}
                    </button>
                  </div>
                )}
              </div>

              {perspective === 'crowd' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 -bottom-1 z-10 hidden sm:flex justify-around items-end opacity-85"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      {lightStickOn && idx % 2 === 1 && (
                        <span className="mb-1 h-2.5 w-2.5 rounded-full bg-[#F5DE93] shadow-[0_0_18px_rgba(245,222,147,0.95)]" />
                      )}
                      <div
                        style={{
                          boxShadow: `0 -4px 14px rgba(${galaGlowRgb}, 0.25)`,
                        }}
                        className="h-6 w-12 rounded-t-2xl border-t border-[#D4AF37]/25 bg-[#090709]"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Interactive Crowd Action Bar & Seekbar */}
            <div className="relative z-20 mt-3 space-y-2.5 rounded-xl border border-white/[0.08] bg-[#0B0B0E]/90 p-3 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4AF37] text-[#050505] hover:bg-[#E6C65B] cursor-pointer shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4 fill-current" />
                  )}
                </button>
                <span className="font-cinema-mono text-xs text-[#F5F5F0]/80 w-12 text-center shrink-0">
                  {formatGalaTime(currentTime)}
                </span>
                <div className="relative flex-1 flex items-center">
                  <div className="relative h-2 w-full rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full bg-[#D4AF37]" style={{ width: `${progressPct}%` }} />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration || 486}
                    step={0.5}
                    value={currentTime}
                    onChange={(e) => jumpToTimestamp(Number(e.target.value))}
                    aria-label="Seek gala timeline"
                    className="absolute inset-0 h-6 w-full cursor-pointer opacity-0"
                  />
                </div>
                <span className="font-cinema-mono text-xs text-[#F5F5F0]/55 w-12 text-center shrink-0">
                  {formatGalaTime(duration)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.muted = !v.muted;
                    setIsMuted(v.muted);
                    if (!v.muted) setNeedsUnmuteTap(false);
                  }}
                  aria-label="Mute"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#F5F5F0]/80 hover:text-[#D4AF37] cursor-pointer shrink-0"
                >
                  {isMuted ? (
                    <VolumeX className="h-4 w-4 text-[#D4AF37]" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={triggerStandingOvation}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3.5 text-xs font-bold text-[#050505] hover:bg-[#E6C65B] transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Heart className="h-3.5 w-3.5 fill-current" />
                    <span>{lang === 'ar' ? 'تصفيق القاعة' : 'Applaud'}</span>
                    <span className="font-cinema-mono text-[11px] opacity-80">
                      ({applauseTotal})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={triggerPressFlash}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-xs text-[#F5F5F0]/85 hover:border-[#D4AF37] hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{lang === 'ar' ? 'فلاش الصحافة' : 'Press Flash'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLightStickOn((v) => !v)}
                    className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      lightStickOn
                        ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]'
                        : 'border-white/15 bg-white/[0.04] text-[#F5F5F0]/85 hover:border-white/30'
                    }`}
                  >
                    <Flame className="h-3.5 w-3.5" />
                    <span>{lang === 'ar' ? 'أضئ مقعدك' : 'Seat Light'}</span>
                  </button>
                </div>

                <span className="font-cinema-mono text-[11px] text-[#D4AF37]/80">
                  {guestName} · {selectedSeat}
                </span>
              </div>
            </div>
          </div>

          {/* Right Live Companion Sidebar */}
          <aside className="flex flex-col overflow-hidden border-t border-white/[0.08] bg-[#09090C] lg:col-span-4 lg:border-t-0 lg:border-s">
            <div className="flex items-center gap-1 border-b border-white/[0.08] p-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveSideTab('chapters')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeSideTab === 'chapters'
                    ? 'bg-[#D4AF37] text-[#050505]'
                    : 'text-[#F5F5F0]/70 hover:bg-white/[0.05]'
                }`}
              >
                <Clapperboard className="inline h-3.5 w-3.5 me-1" />
                <span>{lang === 'ar' ? 'فقرات الحفل (9)' : 'Acts (9)'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSideTab('cast')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeSideTab === 'cast'
                    ? 'bg-[#D4AF37] text-[#050505]'
                    : 'text-[#F5F5F0]/70 hover:bg-white/[0.05]'
                }`}
              >
                <Users className="inline h-3.5 w-3.5 me-1" />
                <span>{lang === 'ar' ? 'نجوم المنصة' : 'On Stage'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSideTab('guestbook')}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeSideTab === 'guestbook'
                    ? 'bg-[#D4AF37] text-[#050505]'
                    : 'text-[#F5F5F0]/70 hover:bg-white/[0.05]'
                }`}
              >
                <MessageSquare className="inline h-3.5 w-3.5 me-1" />
                <span>{lang === 'ar' ? 'سجل الذكريات' : 'Guestbook'}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
              {activeSideTab === 'chapters' &&
                GALA_CHAPTERS.map((ch, idx) => {
                  const isCurrent = ch.id === activeChapter.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => jumpToTimestamp(ch.timeSec)}
                      className={`w-full rounded-xl border p-3 text-start transition-colors cursor-pointer ${
                        isCurrent
                          ? 'border-[#D4AF37] bg-[#D4AF37]/12'
                          : 'border-white/[0.07] bg-[#0E0E12] hover:border-[#D4AF37]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#F5F5F0]">
                          {String(idx + 1).padStart(2, '0')}.{' '}
                          {lang === 'ar' ? ch.titleAr : ch.titleEn}
                        </span>
                        <span className="font-cinema-mono text-[11px] text-[#D4AF37] shrink-0">
                          {ch.timeLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#F5F5F0]/65">
                        {lang === 'ar' ? ch.noteAr : ch.noteEn}
                      </p>
                    </button>
                  );
                })}

              {activeSideTab === 'cast' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/[0.07] p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-[#F5F5F0]">{selectedStar.name}</h3>
                        <p className="text-xs text-[#D4AF37]">
                          {lang === 'ar' ? selectedStar.roleAr : selectedStar.roleEn}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => jumpToTimestamp(selectedStar.jumpSec)}
                        className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-[11px] font-bold text-[#050505] hover:bg-[#E6C65B] cursor-pointer shrink-0"
                      >
                        {lang === 'ar'
                          ? `انتقل للحظته (${formatGalaTime(selectedStar.jumpSec)})`
                          : `Jump (${formatGalaTime(selectedStar.jumpSec)})`}
                      </button>
                    </div>
                    <p className="text-xs leading-relaxed text-[#F5F5F0]/80">
                      {lang === 'ar' ? selectedStar.highlightAr : selectedStar.highlightEn}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {GALA_GUEST_STARS.map((star) => {
                      const active = selectedStar.id === star.id;
                      return (
                        <button
                          key={star.id}
                          type="button"
                          onClick={() => {
                            setSelectedStar(star);
                            jumpToTimestamp(star.jumpSec);
                          }}
                          className={`rounded-xl border p-3 text-start transition-colors cursor-pointer ${
                            active
                              ? 'border-[#D4AF37] bg-[#D4AF37]/12'
                              : 'border-white/[0.08] bg-[#0E0E12] hover:border-[#D4AF37]/40'
                          }`}
                        >
                          <p className="truncate text-xs font-bold text-[#F5F5F0]">{star.name}</p>
                          <p className="truncate text-[11px] text-[#F5F5F0]/55 mt-0.5">
                            {lang === 'ar' ? star.roleAr : star.roleEn}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeSideTab === 'guestbook' && (
                <div className="space-y-3">
                  <form onSubmit={handlePostGuestbook} className="space-y-2">
                    <textarea
                      rows={2}
                      maxLength={240}
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder={
                        lang === 'ar'
                          ? 'اكتب كلمة للطاقم أو شعورك في هذه اللحظة من الحفل...'
                          : 'Leave a premiere note for the director & cast...'
                      }
                      className="w-full rounded-xl border border-white/15 bg-[#050505] p-3 text-xs text-[#F5F5F0] placeholder:text-[#F5F5F0]/35 focus:border-[#D4AF37] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={submittingNote || !noteInput.trim()}
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] text-xs font-bold text-[#050505] hover:bg-[#E6C65B] disabled:opacity-40 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>
                        {lang === 'ar'
                          ? `إرسال في سجل الحفل (${formatGalaTime(currentTime)})`
                          : `Sign Guestbook (${formatGalaTime(currentTime)})`}
                      </span>
                    </button>
                  </form>

                  <div className="space-y-2 pt-1">
                    {comments.length === 0 ? (
                      <p className="py-6 text-center text-xs text-[#F5F5F0]/45">
                        {lang === 'ar'
                          ? 'كن أول من يوثق حضوره في ليلة العرض العالمي.'
                          : 'Be the first to sign the World Premiere guestbook.'}
                      </p>
                    ) : (
                      comments.map((c) => (
                        <div
                          key={c.commentId}
                          className="rounded-xl border border-white/[0.07] bg-[#0E0E12] p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-bold text-[#D4AF37] truncate">{c.authorName}</span>
                            <span className="tabular-nums text-[#F5F5F0]/40 shrink-0">
                              {c.createdAt.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-[#F5F5F0]/85">{c.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {ticketDataUrl && (
        <div
          onClick={() => setTicketDataUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[#D4AF37]/45 bg-[#0B0B0E] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#D4AF37]">
                {lang === 'ar' ? 'تذكرة حضور العرض العالمي' : 'Official Gala Premiere Pass'}
              </h3>
              <button
                type="button"
                onClick={() => setTicketDataUrl(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#F5F5F0]/70 hover:text-[#D4AF37] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-hidden rounded-xl border border-white/10 bg-black flex justify-center">
              <img
                src={ticketDataUrl}
                alt="VIP Gala Premiere Pass"
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>
            <a
              href={ticketDataUrl}
              download={`az-films-fathers-sin-vip-${selectedSeat}.png`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-xs font-bold text-[#050505] hover:bg-[#E6C65B]"
            >
              <Download className="h-4 w-4" />
              <span>{lang === 'ar' ? 'حفظ التذكرة الذهبية (PNG)' : 'Download VIP Pass (PNG)'}</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
