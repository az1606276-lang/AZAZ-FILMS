import { useEffect, useState } from 'react';
import { BarChart3, Download, RefreshCw, X } from 'lucide-react';
import {
  exportAnalyticsCsv,
  fetchAdminAnalyticsReport,
} from '../services/analyticsService';
import type {
  AnalyticsDashboardReport,
  AnalyticsRangePreset,
  AppLanguage,
  Film,
  FilmAnalyticsSummary,
} from '../types/cinema';

interface AdminAnalyticsPanelProps {
  films: Film[];
  lang: AppLanguage;
}

function formatDurationSeconds(sec: number): string {
  if (!sec || sec <= 0) return '00:00';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface ChartPoint {
  label: string;
  primary: number;
  secondary?: number;
}

function CinemaBarLineChart({
  title,
  primaryLabel,
  secondaryLabel,
  data,
}: {
  title: string;
  primaryLabel: string;
  secondaryLabel?: string;
  data: ChartPoint[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.primary, d.secondary || 0)));
  const visibleData = data.length > 31 ? data.slice(-31) : data;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#F5F5F0]">{title}</h3>
        <div className="flex items-center gap-4 text-xs text-[#F5F5F0]/65">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#D4AF37]" />
            <span>{primaryLabel}</span>
          </span>
          {secondaryLabel && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-white/35" />
              <span>{secondaryLabel}</span>
            </span>
          )}
        </div>
      </div>

      {visibleData.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-xs text-[#F5F5F0]/45">
          No data in selected range
        </div>
      ) : (
        <div className="relative">
          <div className="flex h-48 items-end gap-1.5 border-b border-white/10 pb-2 pt-4">
            {visibleData.map((pt, idx) => {
              const h1 = Math.round((pt.primary / maxVal) * 100);
              const h2 = pt.secondary !== undefined ? Math.round((pt.secondary / maxVal) * 100) : 0;
              const isHovered = hoverIdx === idx;
              return (
                <div
                  key={pt.label}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                  className="relative flex flex-1 h-full items-end justify-center gap-0.5 group cursor-pointer"
                >
                  <div
                    className={`w-full max-w-[14px] rounded-t transition-colors ${
                      isHovered ? 'bg-[#E6C65B]' : 'bg-[#D4AF37]/80'
                    }`}
                    style={{ height: `${Math.max(pt.primary > 0 ? 6 : 2, h1)}%` }}
                  />
                  {secondaryLabel && (
                    <div
                      className="w-full max-w-[10px] rounded-t bg-white/30"
                      style={{ height: `${Math.max((pt.secondary || 0) > 0 ? 6 : 0, h2)}%` }}
                    />
                  )}

                  {isHovered && (
                    <div className="pointer-events-none absolute -top-9 z-20 whitespace-nowrap rounded border border-white/15 bg-[#121216] px-2 py-1 text-[11px] text-[#F5F5F0] shadow-lg font-cinema-mono">
                      {pt.label}: {pt.primary}
                      {secondaryLabel ? ` / ${pt.secondary || 0}` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[#F5F5F0]/45 font-cinema-mono">
            <span>{visibleData[0]?.label}</span>
            <span>{visibleData[visibleData.length - 1]?.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminAnalyticsPanel({ films, lang }: AdminAnalyticsPanelProps) {
  const [preset, setPreset] = useState<AnalyticsRangePreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [report, setReport] = useState<AnalyticsDashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilmStats, setSelectedFilmStats] = useState<FilmAnalyticsSummary | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminAnalyticsReport(films, preset, customStart, customEnd);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [preset, customStart, customEnd, films.length]);

  const presetLabels: { id: AnalyticsRangePreset; ar: string; en: string }[] = [
    { id: 'today', ar: 'اليوم', en: 'Today' },
    { id: '7d', ar: 'آخر 7 أيام', en: 'Last 7 Days' },
    { id: '30d', ar: 'آخر 30 يومًا', en: 'Last 30 Days' },
    { id: '90d', ar: 'آخر 90 يومًا', en: 'Last 90 Days' },
    { id: 'custom', ar: 'تاريخ مخصص', en: 'Custom Range' },
  ];

  const activePresetLabel = presetLabels.find((p) => p.id === preset)?.[lang] || preset;

  return (
    <div className="space-y-8">
      {/* Header & Range Controls */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-cinema-display text-xs tracking-[0.2em] text-[#D4AF37]">
            AZ FILMS ANALYTICS
          </p>
          <h2 className="mt-1 text-2xl font-bold text-[#F5F5F0]">
            {lang === 'ar' ? 'إحصائيات الزوار والمشاهدات والتقارير' : 'Audience, Playback & Retention Reports'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {presetLabels.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPreset(item.id)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                preset === item.id
                  ? 'bg-[#D4AF37] text-[#050505] font-semibold'
                  : 'border border-white/10 bg-[#0B0B0E] text-[#F5F5F0]/75 hover:border-white/25'
              }`}
            >
              {item[lang]}
            </button>
          ))}

          <button
            type="button"
            onClick={loadReport}
            aria-label="Refresh Analytics"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#0B0B0E] text-[#F5F5F0]/80 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {report && (
            <button
              type="button"
              onClick={() => exportAnalyticsCsv(report, activePresetLabel)}
              className="flex h-9 items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3.5 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/20 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}</span>
            </button>
          )}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-4">
          <label className="flex items-center gap-2 text-xs text-[#F5F5F0]/75">
            <span>{lang === 'ar' ? 'من:' : 'From:'}</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-white/15 bg-[#050505] px-3 py-1.5 text-xs text-[#F5F5F0]"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[#F5F5F0]/75">
            <span>{lang === 'ar' ? 'إلى:' : 'To:'}</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-white/15 bg-[#050505] px-3 py-1.5 text-xs text-[#F5F5F0]"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading && !report ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-[#0B0B0E]" />
          ))}
        </div>
      ) : report ? (
        <>
          {/* Section 1: Visitor Stats */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#D4AF37]">
              {lang === 'ar' ? 'أولاً: إحصائيات الزوار' : '1. Platform Visitor Metrics'}
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              <StatCell label={lang === 'ar' ? 'إجمالي الزوار (الفترة)' : 'Total Visits (Range)'} value={report.totalVisitors} />
              <StatCell label={lang === 'ar' ? 'زوار اليوم' : 'Visitors Today'} value={report.todayVisitors} />
              <StatCell label={lang === 'ar' ? 'زوار الأسبوع' : 'This Week'} value={report.weekVisitors} />
              <StatCell label={lang === 'ar' ? 'زوار الشهر' : 'This Month'} value={report.monthVisitors} />
              <StatCell label={lang === 'ar' ? 'الزوار الفريدون' : 'Unique Visitors'} value={report.uniqueVisitors} />
              <StatCell label={lang === 'ar' ? 'الزيارات المتكررة' : 'Returning Visits'} value={report.returningVisits} />
              <StatCell
                label={lang === 'ar' ? 'المتصلون حاليًا (تقديرية)' : 'Active Now (Est.)'}
                value={report.activeNowEstimated}
                accent
              />
            </div>
          </div>

          {/* Section 2: Film View Stats */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#D4AF37]">
              {lang === 'ar' ? 'ثانيًا: إحصائيات المشاهدات' : '2. Film Playback & Completion Metrics'}
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              <StatCell label={lang === 'ar' ? 'إجمالي المشاهدات' : 'Total Views'} value={report.totalViews} accent />
              <StatCell label={lang === 'ar' ? 'مشاهدات اليوم' : 'Views Today'} value={report.todayViews} />
              <StatCell label={lang === 'ar' ? 'مشاهدات الأسبوع' : 'This Week'} value={report.weekViews} />
              <StatCell label={lang === 'ar' ? 'مشاهدات الشهر' : 'This Month'} value={report.monthViews} />
              <StatCell label={lang === 'ar' ? 'مرات التشغيل' : 'Play Starts'} value={report.totalPlayStarts} />
              <StatCell label={lang === 'ar' ? 'المشاهدات المكتملة' : 'Completed Views'} value={report.completedViews} />
              <StatCell
                label={lang === 'ar' ? 'متوسط مدة المشاهدة' : 'Avg Watch Time'}
                value={formatDurationSeconds(report.avgWatchSeconds)}
                sub={`${report.overallCompletionRate}% ${lang === 'ar' ? 'إكمال' : 'completion'}`}
              />
            </div>
          </div>

          {/* Highlights: Top Film & Recently Watched */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-5">
              <p className="text-xs text-[#F5F5F0]/50">
                {lang === 'ar' ? 'أكثر فيلم مشاهدة' : 'Most Watched Film'}
              </p>
              {report.topFilm ? (
                <div className="mt-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-[#F5F5F0]">
                      {lang === 'ar' ? report.topFilm.titleAr : report.topFilm.titleEn}
                    </p>
                    <p className="text-xs text-[#D4AF37]">
                      {report.topFilm.totalViews} {lang === 'ar' ? 'مشاهدة' : 'views'} · {report.topFilm.completionRate}%{' '}
                      {lang === 'ar' ? 'نسبة الإكمال' : 'completion'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFilmStats(report.topFilm)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#F5F5F0] hover:border-[#D4AF37] cursor-pointer"
                  >
                    {lang === 'ar' ? 'التفاصيل' : 'Inspect'}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#F5F5F0]/45">
                  {lang === 'ar' ? 'لم تُسجل مشاهدات أفلام في هذه الفترة بعد.' : 'No film playback recorded in this period yet.'}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-5">
              <p className="text-xs text-[#F5F5F0]/50">
                {lang === 'ar' ? 'أحدث الأفلام مشاهدة' : 'Recently Watched Films'}
              </p>
              {report.recentlyWatchedFilms.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {report.recentlyWatchedFilms.map((f) => (
                    <li
                      key={f.filmId}
                      className="flex items-center justify-between text-xs border-b border-white/[0.05] pb-1.5 last:border-none last:pb-0"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFilmStats(f)}
                        className="font-medium text-[#F5F5F0] hover:text-[#D4AF37] cursor-pointer"
                      >
                        {lang === 'ar' ? f.titleAr : f.titleEn}
                      </button>
                      <span className="font-cinema-mono text-[#F5F5F0]/55">
                        {f.lastWatchedAt?.toLocaleDateString()} · {f.totalViews} {lang === 'ar' ? 'تشغيل' : 'plays'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[#F5F5F0]/45">
                  {lang === 'ar' ? 'لا توجد جلسات تشغيل مسجلة بعد.' : 'No playback sessions recorded yet.'}
                </p>
              )}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CinemaBarLineChart
              title={lang === 'ar' ? 'حركة الزوار حسب الأيام' : 'Visitor Traffic by Day'}
              primaryLabel={lang === 'ar' ? 'إجمالي الزيارات' : 'Visits'}
              secondaryLabel={lang === 'ar' ? 'متكررة' : 'Returning'}
              data={report.visitorTrafficSeries.map((d) => ({
                label: d.dateKey.slice(5),
                primary: d.visitors,
                secondary: d.returning,
              }))}
            />
            <CinemaBarLineChart
              title={lang === 'ar' ? 'مشاهدات الأفلام حسب الأيام' : 'Film Views by Day'}
              primaryLabel={lang === 'ar' ? 'بدء التشغيل' : 'Plays'}
              secondaryLabel={lang === 'ar' ? 'مكتملة' : 'Completed'}
              data={report.filmViewsSeries.map((d) => ({
                label: d.dateKey.slice(5),
                primary: d.views,
                secondary: d.completed,
              }))}
            />
          </div>

          {/* Film Rankings Table */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] overflow-hidden">
            <div className="border-b border-white/[0.08] px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#F5F5F0]">
                {lang === 'ar' ? 'ترتيب الأفلام حسب المشاهدات' : 'Film Rankings by Views'}
              </h3>
              <span className="text-xs text-[#F5F5F0]/45">
                {lang === 'ar' ? 'اضغط على أي فيلم لعرض إحصائياته المستقلة' : 'Click any film for its dedicated analytics'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-xs text-[#F5F5F0]/50">
                    <th className="px-4 py-3 text-start font-medium">{lang === 'ar' ? 'الفيلم' : 'Film'}</th>
                    <th className="px-4 py-3 text-end font-medium">{lang === 'ar' ? 'المشاهدات' : 'Views'}</th>
                    <th className="px-4 py-3 text-end font-medium">{lang === 'ar' ? 'الفريدون' : 'Unique'}</th>
                    <th className="px-4 py-3 text-end font-medium">{lang === 'ar' ? 'اليوم' : 'Today'}</th>
                    <th className="px-4 py-3 text-end font-medium">{lang === 'ar' ? 'متوسط المدة' : 'Avg Watch'}</th>
                    <th className="px-4 py-3 text-end font-medium">{lang === 'ar' ? 'المكتملة' : 'Completed'}</th>
                    <th className="px-4 py-3 text-end font-medium">{lang === 'ar' ? 'نسبة الإكمال' : 'Completion %'}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.filmRankings.map((row) => (
                    <tr
                      key={row.filmId}
                      onClick={() => setSelectedFilmStats(row)}
                      className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-[#F5F5F0]">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-3.5 w-3.5 text-[#D4AF37]" />
                          <span>{lang === 'ar' ? row.titleAr : row.titleEn}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-end font-cinema-mono text-[#F5F5F0]">{row.totalViews}</td>
                      <td className="px-4 py-3 text-end font-cinema-mono text-[#F5F5F0]/75">{row.uniqueViewers}</td>
                      <td className="px-4 py-3 text-end font-cinema-mono text-[#F5F5F0]/75">{row.todayViews}</td>
                      <td className="px-4 py-3 text-end font-cinema-mono text-[#F5F5F0]/75">
                        {formatDurationSeconds(row.avgWatchSeconds)}
                      </td>
                      <td className="px-4 py-3 text-end font-cinema-mono text-[#F5F5F0]/75">{row.completedCount}</td>
                      <td className="px-4 py-3 text-end font-cinema-mono text-[#D4AF37]">{row.completionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* Per-Film Dedicated Analytics Modal */}
      {selectedFilmStats && (
        <div
          onClick={() => setSelectedFilmStats(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0B0B0E] p-6 space-y-6"
          >
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
              <div>
                <p className="text-xs tracking-[0.18em] text-[#D4AF37]">PER-FILM ANALYTICS</p>
                <h3 className="mt-1 text-xl font-bold text-[#F5F5F0]">
                  {selectedFilmStats.titleAr} — {selectedFilmStats.titleEn}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFilmStats(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-[#F5F5F0]/80 hover:text-[#D4AF37] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCell label={lang === 'ar' ? 'إجمالي المشاهدات' : 'Total Views'} value={selectedFilmStats.totalViews} accent />
              <StatCell label={lang === 'ar' ? 'المشاهدون الفريدون' : 'Unique Viewers'} value={selectedFilmStats.uniqueViewers} />
              <StatCell label={lang === 'ar' ? 'مشاهدات اليوم' : 'Today Views'} value={selectedFilmStats.todayViews} />
              <StatCell
                label={lang === 'ar' ? 'متوسط وقت المشاهدة' : 'Avg Watch Time'}
                value={formatDurationSeconds(selectedFilmStats.avgWatchSeconds)}
              />
              <StatCell label={lang === 'ar' ? 'مرات الإكمال' : 'Completions'} value={selectedFilmStats.completedCount} />
              <StatCell label={lang === 'ar' ? 'نسبة الإكمال' : 'Completion Rate'} value={`${selectedFilmStats.completionRate}%`} accent />
            </div>

            <CinemaBarLineChart
              title={lang === 'ar' ? 'المشاهدات حسب الأيام' : 'Daily Views Breakdown'}
              primaryLabel={lang === 'ar' ? 'المشاهدات' : 'Views'}
              secondaryLabel={lang === 'ar' ? 'المكتملة' : 'Completed'}
              data={selectedFilmStats.dailySeries.map((d) => ({
                label: d.dateKey.slice(5),
                primary: d.views,
                secondary: d.completed,
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-4">
      <p className="text-xs text-[#F5F5F0]/55 truncate">{label}</p>
      <p
        className={`mt-2 font-cinema-mono text-2xl font-semibold ${
          accent ? 'text-[#D4AF37]' : 'text-[#F5F5F0]'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-[#F5F5F0]/45 font-cinema-mono">{sub}</p>}
    </div>
  );
}
