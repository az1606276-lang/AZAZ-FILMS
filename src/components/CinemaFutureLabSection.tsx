import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioWaveform, Compass, Play, Radar, Volume2, VolumeX } from 'lucide-react';
import { TheatreAmbianceSynth } from '../services/cinemaAudioEngine';
import {
  computeFilmRadarMetrics,
  extractFilmChromaticDna,
  type FilmChromaticDNA,
} from '../services/filmDnaService';
import type { AppLanguage, Film } from '../types/cinema';

interface CinemaFutureLabSectionProps {
  films: Film[];
  lang: AppLanguage;
  onSelectFilm: (film: Film) => void;
  onLaunchWithSpatialAudio: (film: Film) => void;
}

const AXES_AR = ['التباين', 'الدفء اللوني', 'التشبع', 'الإيقاع', 'أصالة الاستوديو'];
const AXES_EN = ['Contrast', 'Color Temp', 'Saturation', 'Pacing', 'Originality'];

function radarPolygonPoints(values: number[], cx: number, cy: number, radius: number): string {
  return values
    .map((val, idx) => {
      const angle = (Math.PI * 2 * idx) / values.length - Math.PI / 2;
      const r = (Math.max(10, Math.min(100, val)) / 100) * radius;
      return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
    })
    .join(' ');
}

export function CinemaFutureLabSection({
  films,
  lang,
  onSelectFilm,
  onLaunchWithSpatialAudio,
}: CinemaFutureLabSectionProps) {
  const availableFilms = useMemo(() => films.filter((f) => f.isVisible), [films]);

  const [filmAId, setFilmAId] = useState<string>(() => availableFilms[0]?.id || '');
  const [filmBId, setFilmBId] = useState<string>(
    () => availableFilms[1]?.id || availableFilms[0]?.id || ''
  );

  useEffect(() => {
    if (!availableFilms.length) return;
    if (!availableFilms.some((f) => f.id === filmAId)) {
      setFilmAId(availableFilms[0].id);
    }
    if (!availableFilms.some((f) => f.id === filmBId)) {
      setFilmBId((availableFilms[1] || availableFilms[0]).id);
    }
  }, [availableFilms, filmAId, filmBId]);

  const filmA = availableFilms.find((f) => f.id === filmAId) || availableFilms[0] || null;
  const filmB = availableFilms.find((f) => f.id === filmBId) || availableFilms[1] || filmA;

  const [dnaA, setDnaA] = useState<FilmChromaticDNA | null>(null);
  const [dnaB, setDnaB] = useState<FilmChromaticDNA | null>(null);

  useEffect(() => {
    let active = true;
    const srcA = filmA?.backdropUrl || filmA?.posterUrl || '';
    if (!srcA) {
      setDnaA(null);
      return;
    }
    extractFilmChromaticDna(srcA).then((res) => {
      if (active) setDnaA(res);
    });
    return () => {
      active = false;
    };
  }, [filmA?.id, filmA?.backdropUrl, filmA?.posterUrl]);

  useEffect(() => {
    let active = true;
    const srcB = filmB?.backdropUrl || filmB?.posterUrl || '';
    if (!srcB) {
      setDnaB(null);
      return;
    }
    extractFilmChromaticDna(srcB).then((res) => {
      if (active) setDnaB(res);
    });
    return () => {
      active = false;
    };
  }, [filmB?.id, filmB?.backdropUrl, filmB?.posterUrl]);

  // 3D Interactive Auditorium Seat Synth State
  const synthRef = useRef<TheatreAmbianceSynth | null>(null);
  const [auditoriumLive, setAuditoriumLive] = useState(false);
  const [seatPos, setSeatPos] = useState<{ pan: number; depth: number }>({ pan: 0, depth: 0.35 });

  useEffect(() => {
    return () => {
      synthRef.current?.stop();
      synthRef.current = null;
    };
  }, []);

  const toggleAuditoriumAudio = () => {
    if (auditoriumLive) {
      synthRef.current?.stop();
      setAuditoriumLive(false);
      return;
    }
    if (!synthRef.current) {
      synthRef.current = new TheatreAmbianceSynth();
    }
    const ok = synthRef.current.start(true, seatPos.pan, seatPos.depth);
    setAuditoriumLive(ok);
  };

  const handleSeatPadClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1; // -1..+1
    const ny = Math.min(0.95, Math.max(0.05, (e.clientY - rect.top) / rect.height));
    const pan = Math.max(-0.85, Math.min(0.85, nx));
    setSeatPos({ pan, depth: ny });
    synthRef.current?.setSeat(pan, ny);
  };

  if (!filmA) return null;

  const metricsA = computeFilmRadarMetrics(filmA, dnaA);
  const metricsB = filmB ? computeFilmRadarMetrics(filmB, dnaB) : metricsA;

  const valsA = [
    metricsA.contrast,
    metricsA.warmth,
    metricsA.saturation,
    metricsA.pacing,
    metricsA.originality,
  ];
  const valsB = [
    metricsB.contrast,
    metricsB.warmth,
    metricsB.saturation,
    metricsB.pacing,
    metricsB.originality,
  ];

  const axesLabels = lang === 'ar' ? AXES_AR : AXES_EN;
  const cx = 140;
  const cy = 132;
  const radius = 84;
  const playableFeatured =
    availableFilms.find((f) => f.status === 'released' && Boolean(f.videoUrl?.trim())) || filmA;

  return (
    <section
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="mx-auto max-w-[1440px] border-t border-white/[0.08] px-4 py-14 sm:px-8"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-[0.2em] text-[#D4AF37]">
            AZ LABS · NEXT-ERA CINEMA
          </p>
          <h2 className="text-2xl font-bold text-[#F5F5F0] sm:text-3xl text-balance">
            {lang === 'ar'
              ? 'مختبر السينما المستقبلية'
              : 'Future Cinema Sensory Lab'}
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-[#F5F5F0]/60 sm:text-sm">
            {lang === 'ar'
              ? 'قارن البصمة البصرية والإيقاعية لأعمال الاستوديو على رادار خماسي، واختبر توزيع الصوت الثلاثي الأبعاد مباشرة من مقعدك داخل القاعة.'
              : 'Compare two films on a live 5-axis visual & pacing radar, and audition real-time 3D auditorium spatial acoustics from any seat.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Left: 5-Axis Film DNA Comparator */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0B0B0E] p-6 lg:col-span-7">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#F5F5F0]">
                <Radar className="h-4 w-4 text-[#D4AF37]" />
                <span>
                  {lang === 'ar'
                    ? 'رادار مقارنة الحمض السينمائي'
                    : '5-Axis Film DNA Comparator'}
                </span>
              </div>
              <span className="text-[11px] text-[#F5F5F0]/45">
                {lang === 'ar' ? 'مستخرج من ألوان وإيقاع العمل' : 'Live artwork & pacing telemetry'}
              </span>
            </div>

            {/* Film Selectors */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="flex items-center gap-2 text-[11px] text-[#D4AF37]">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#D4AF37]" />
                  <span>{lang === 'ar' ? 'العمل الأول' : 'Film A'}</span>
                </span>
                <select
                  value={filmA.id}
                  onChange={(e) => setFilmAId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[#D4AF37]/35 bg-[#050505] px-3 text-xs text-[#F5F5F0] focus:border-[#D4AF37] focus:outline-none"
                >
                  {availableFilms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {lang === 'ar' ? f.titleAr : f.titleEn} ({f.year})
                    </option>
                  ))}
                </select>
              </label>

              {filmB && (
                <label className="block space-y-1.5">
                  <span className="flex items-center gap-2 text-[11px] text-[#E2E8F0]">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#94A3B8]" />
                    <span>{lang === 'ar' ? 'العمل الثاني' : 'Film B'}</span>
                  </span>
                  <select
                    value={filmB.id}
                    onChange={(e) => setFilmBId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-white/15 bg-[#050505] px-3 text-xs text-[#F5F5F0] focus:border-[#D4AF37] focus:outline-none"
                  >
                    {availableFilms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {lang === 'ar' ? f.titleAr : f.titleEn} ({f.year})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {/* Dual Radar Visualization + Side Metrics */}
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-12 pt-1">
              <div className="flex justify-center md:col-span-6">
                <svg viewBox="0 0 280 264" className="w-full max-w-[260px] overflow-visible">
                  {[0.33, 0.66, 1].map((scale, rIdx) => (
                    <polygon
                      key={rIdx}
                      points={radarPolygonPoints([scale * 100, scale * 100, scale * 100, scale * 100, scale * 100], cx, cy, radius)}
                      fill="none"
                      stroke="rgba(255,255,255,0.09)"
                      strokeWidth="1"
                    />
                  ))}
                  {axesLabels.map((label, idx) => {
                    const angle = (Math.PI * 2 * idx) / axesLabels.length - Math.PI / 2;
                    const xEnd = cx + radius * Math.cos(angle);
                    const yEnd = cy + radius * Math.sin(angle);
                    const lx = cx + (radius + 22) * Math.cos(angle);
                    const ly = cy + (radius + 20) * Math.sin(angle);
                    return (
                      <g key={label}>
                        <line
                          x1={cx}
                          y1={cy}
                          x2={xEnd}
                          y2={yEnd}
                          stroke="rgba(255,255,255,0.1)"
                          strokeWidth="1"
                        />
                        <text
                          x={lx}
                          y={ly}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="rgba(245,245,240,0.7)"
                          fontSize="10"
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Film B Polygon */}
                  {filmB && (
                    <polygon
                      points={radarPolygonPoints(valsB, cx, cy, radius)}
                      fill="rgba(148,163,184,0.18)"
                      stroke="#94A3B8"
                      strokeWidth="1.5"
                    />
                  )}
                  {/* Film A Polygon */}
                  <polygon
                    points={radarPolygonPoints(valsA, cx, cy, radius)}
                    fill="rgba(212,175,55,0.22)"
                    stroke="#D4AF37"
                    strokeWidth="2"
                  />
                </svg>
              </div>

              <div className="space-y-3 md:col-span-6">
                {axesLabels.map((label, idx) => (
                  <div key={label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#F5F5F0]/70">{label}</span>
                      <span className="font-cinema-mono tabular-nums text-[#F5F5F0]/85">
                        <span className="text-[#D4AF37]">{valsA[idx]}%</span>
                        {filmB && filmB.id !== filmA.id && (
                          <span className="text-[#94A3B8]"> · {valsB[idx]}%</span>
                        )}
                      </span>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="absolute inset-y-0 start-0 bg-[#D4AF37]/85 transition-all duration-300"
                        style={{ width: `${valsA[idx]}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dual Chromatic Strip Preview + Quick Open */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
            <div className="flex flex-1 items-center gap-2 min-w-[180px]">
              {dnaA ? (
                <div className="flex h-4 flex-1 overflow-hidden rounded border border-white/10">
                  {dnaA.slices.slice(0, 18).map((hex, i) => (
                    <div key={`${hex}-${i}`} className="flex-1" style={{ backgroundColor: hex }} />
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-[#F5F5F0]/45">
                  {lang === 'ar' ? filmA.titleAr : filmA.titleEn}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelectFilm(filmA)}
              className="text-xs font-medium text-[#D4AF37] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              {lang === 'ar' ? 'فتح تفاصيل العمل الأول' : 'Inspect Film A'}
            </button>
          </div>
        </div>

        {/* Right: Live 3D Spatial Auditorium Seat Tester */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0B0B0E] p-6 lg:col-span-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#F5F5F0]">
                <AudioWaveform className="h-4 w-4 text-[#D4AF37]" />
                <span>
                  {lang === 'ar'
                    ? 'مسرح الصوت المكاني 3D'
                    : '3D Spatial Auditorium Lab'}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleAuditoriumAudio}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  auditoriumLive
                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#050505]'
                    : 'border-[#D4AF37]/45 bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20'
                }`}
              >
                {auditoriumLive ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                <span>
                  {auditoriumLive
                    ? lang === 'ar'
                      ? 'إيقاف الاختبار'
                      : 'Mute Acoustic'
                    : lang === 'ar'
                      ? 'تشغيل القاعة'
                      : 'Test Hall Audio'}
                </span>
              </button>
            </div>

            <p className="text-xs leading-relaxed text-[#F5F5F0]/60">
              {lang === 'ar'
                ? 'انقر في أي نقطة داخل مخطط القاعة لنقل مقعد الاستماع بين اليمين واليسار والصفوف الأمامية والخلفية وسماع التردد والعمق مباشرة.'
                : 'Click anywhere in the virtual auditorium to reposition your listening seat and hear stereo pan and hall convolution depth shift live.'}
            </p>

            {/* Interactive 2D Auditorium Stage Map */}
            <div
              onClick={handleSeatPadClick}
              role="application"
              aria-label={lang === 'ar' ? 'مخطط مقعد الصوت داخل القاعة' : 'Auditorium acoustic seat map'}
              className="relative h-52 w-full overflow-hidden rounded-xl border border-white/10 bg-[#050505] cursor-crosshair select-none"
            >
              {/* Curved Cinema Screen Bar at Top */}
              <div className="mx-auto mt-3 h-1.5 w-3/4 rounded-full bg-gradient-to-r from-transparent via-[#D4AF37]/75 to-transparent" />
              <p className="mt-1 text-center text-[10px] tracking-[0.18em] text-[#D4AF37]/70">
                {lang === 'ar' ? 'شاشة العرض الرئيسية' : 'PROJECTION SCREEN'}
              </p>

              {/* Subtle Acoustic Concentric Waves */}
              <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
                <div className="h-36 w-72 rounded-b-full border border-white/[0.05]" />
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
                <div className="h-44 w-96 rounded-b-full border border-white/[0.03]" />
              </div>

              {/* Listener Seat Marker */}
              <div
                style={{
                  left: `${((seatPos.pan / 0.85 + 1) / 2) * 84 + 8}%`,
                  top: `${seatPos.depth * 62 + 24}%`,
                }}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-150"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.45)]">
                  <Compass className="h-4 w-4" />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-center justify-between text-[10px] font-cinema-mono text-[#F5F5F0]/45 tabular-nums">
                <span>
                  L/R: {seatPos.pan >= 0 ? `+${Math.round(seatPos.pan * 100)}%` : `${Math.round(seatPos.pan * 100)}%`}
                </span>
                <span>
                  {lang === 'ar' ? 'العمق' : 'DEPTH'}: {Math.round(seatPos.depth * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
            <span className="text-[11px] text-[#F5F5F0]/55">
              {lang === 'ar'
                ? 'تقنية Convolver 3D متوفرة الآن داخل المشغّل'
                : 'Available inside Cinema Player Audio DSP'}
            </span>
            {playableFeatured && (
              <button
                type="button"
                onClick={() => onLaunchWithSpatialAudio(playableFeatured)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#D4AF37] px-4 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{lang === 'ar' ? 'شاهد بصوت 3D الآن' : 'Watch in 3D Audio'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
