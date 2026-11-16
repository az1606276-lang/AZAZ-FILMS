import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Link2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  applyEmergencyMaintenanceMode,
  createAzTechOrder,
  deleteAzTechOrder,
  executeBatchLinkRepair,
  executeDirectLinkUpdate,
  fetchAzTechServerStatus,
  normalizeCloudMediaUrl,
  probeAzTechLinks,
  purgeCachesAndSyncServer,
  subscribeAzTechOrders,
  type AzTechOrder,
  type AzTechProbeResult,
  type AzTechProbeTarget,
  type AzTechServerStatus,
} from '../services/azTechService';
import type { AppLanguage, Film, SiteAccessMode, SiteSettings } from '../types/cinema';

interface AzTechCenterPanelProps {
  films: Film[];
  siteSettings: SiteSettings;
  sharedBaseUrl: string;
  lang: AppLanguage;
}

const INPUT_CLS =
  'h-10 w-full rounded-lg border border-white/10 bg-[#050505] px-3 text-sm text-[#F5F5F0] placeholder-[#F5F5F0]/35 outline-none focus:border-[#D4AF37]';

export function AzTechCenterPanel({
  films,
  siteSettings,
  sharedBaseUrl,
  lang,
}: AzTechCenterPanelProps) {
  const [serverStatus, setServerStatus] = useState<AzTechServerStatus | null>(null);
  const [orders, setOrders] = useState<AzTechOrder[]>([]);
  const [probeResults, setProbeResults] = useState<AzTechProbeResult[]>([]);
  const [busyAction, setBusyAction] = useState<
    'scan' | 'repair' | 'cache' | 'maintenance' | 'direct' | null
  >(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

  // Direct AZ Tech Center Request & Link Update Form
  const [targetFilmId, setTargetFilmId] = useState<string>(() => films[0]?.id || '');
  const [targetField, setTargetField] = useState<
    'videoUrl' | 'trailerUrl' | 'posterUrl' | 'backdropUrl'
  >('videoUrl');
  const [newUrlInput, setNewUrlInput] = useState('');
  const [directiveNote, setDirectiveNote] = useState('');

  useEffect(() => {
    if (!targetFilmId && films.length > 0) {
      setTargetFilmId(films[0].id);
    }
  }, [films, targetFilmId]);

  useEffect(() => {
    fetchAzTechServerStatus()
      .then(setServerStatus)
      .catch(() => setServerStatus(null));

    const unsub = subscribeAzTechOrders(setOrders);
    return () => unsub();
  }, []);

  const previewNorm = normalizeCloudMediaUrl(newUrlInput);

  const handleFullScanOnly = async () => {
    setBusyAction('scan');
    setFeedback(null);
    const t0 = Date.now();
    try {
      const targets: AzTechProbeTarget[] = films.flatMap((film) => {
        const list: AzTechProbeTarget[] = [];
        if (film.videoUrl?.trim()) {
          list.push({
            id: `${film.id}:videoUrl`,
            filmId: film.id,
            field: 'videoUrl' as const,
            label: `${film.titleAr} — الفيديو الكامل`,
            url: film.videoUrl.trim(),
          });
        }
        if (film.trailerUrl?.trim()) {
          list.push({
            id: `${film.id}:trailerUrl`,
            filmId: film.id,
            field: 'trailerUrl' as const,
            label: `${film.titleAr} — التريلر`,
            url: film.trailerUrl.trim(),
          });
        }
        if (film.posterUrl?.trim() && !film.posterUrl.startsWith('data:')) {
          list.push({
            id: `${film.id}:posterUrl`,
            filmId: film.id,
            field: 'posterUrl' as const,
            label: `${film.titleAr} — البوستر`,
            url: film.posterUrl.trim(),
          });
        }
        return list;
      });
      targets.push({
        id: 'site:shared',
        field: 'siteUrl' as const,
        label: lang === 'ar' ? 'الرابط الثابت العام' : 'Shared Bio URL',
        url: sharedBaseUrl,
      });

      const res = await probeAzTechLinks(targets);
      setProbeResults(res.results);
      const issuesCount = res.results.filter((r) => !r.ok || r.devOnlyUpload || r.suggestedUrl).length;
      setFeedback({
        kind: issuesCount > 0 ? 'warn' : 'ok',
        text:
          lang === 'ar'
            ? `اكتمل فحص ${res.results.length} رابطًا خلال ${Date.now() - t0}ms — ${
                issuesCount === 0
                  ? 'جميع الروابط تعمل بكفاءة 100%.'
                  : `تم رصد ${issuesCount} رابط قابل للتحسين أو المعالجة الفورية.`
              }`
            : `Scanned ${res.results.length} URLs in ${Date.now() - t0}ms — ${issuesCount} need optimization.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'warn',
        text: err instanceof Error ? err.message : 'Scan failed',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleBatchAutoRepair = async () => {
    setBusyAction('repair');
    setFeedback(null);
    const t0 = Date.now();
    try {
      const outcome = await executeBatchLinkRepair(films);
      setProbeResults(outcome.probeResults);
      const latency = Date.now() - t0;

      await createAzTechOrder({
        actionType: 'batch_repair',
        requestNote: 'طلب فحص ومعالجة وإصلاح الروابط وتوحيد جودة 4K UHD عبر مركز AZ التقني',
        resolutionNote: `تم فحص ${outcome.checkedLinks} رابط، وتحديث/ترقية ${outcome.updatedFilms} أعمال إلى روابط محسّنة وجودة 4K UHD`,
        status: outcome.brokenCount > 0 ? 'warning' : 'resolved',
        checkedLinks: outcome.checkedLinks,
        updatedLinks: outcome.updatedFilms,
        latencyMs: latency,
      });

      setFeedback({
        kind: outcome.brokenCount > 0 ? 'warn' : 'ok',
        text:
          lang === 'ar'
            ? `تمت المعالجة الفورية: فحص ${outcome.checkedLinks} رابطًا وتحديث ${outcome.updatedFilms} فيلم بنجاح.${
                outcome.brokenCount > 0 ? ` (${outcome.brokenCount} روابط تتطلب استبدالًا سحابيًا)` : ''
              }`
            : `Repaired ${outcome.updatedFilms} film entries across ${outcome.checkedLinks} links.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'warn',
        text: err instanceof Error ? err.message : 'Repair failed',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePurgeAndSync = async () => {
    setBusyAction('cache');
    setFeedback(null);
    const t0 = Date.now();
    try {
      const res = await purgeCachesAndSyncServer(siteSettings);
      const status = await fetchAzTechServerStatus().catch(() => null);
      if (status) setServerStatus(status);
      const latency = Date.now() - t0;

      await createAzTechOrder({
        actionType: 'cache_sync',
        requestNote: 'طلب مسح الكاش الفوري ومزامنة روابط السحابة للزوار',
        resolutionNote: `تم مسح ${res.cachesCleared} ذاكرة مؤقتة وتحديث السيرفس ووركر وإعادة مزامنة قاعدة البيانات`,
        status: 'resolved',
        checkedLinks: films.length,
        updatedLinks: 1,
        latencyMs: latency,
      });

      setFeedback({
        kind: 'ok',
        text:
          lang === 'ar'
            ? `تمت المزامنة الفورية ومسح ${res.cachesCleared} من ملفات الكاش وتنشيط البث السحابي على الرابط الثابت.`
            : `Cleared ${res.cachesCleared} caches and synchronized cloud state.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'warn',
        text: err instanceof Error ? err.message : 'Sync failed',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuickMaintenanceToggle = async (mode: SiteAccessMode) => {
    setBusyAction('maintenance');
    setFeedback(null);
    try {
      await applyEmergencyMaintenanceMode(siteSettings, mode, directiveNote);
      setFeedback({
        kind: 'ok',
        text:
          lang === 'ar'
            ? mode === 'maintenance'
              ? 'تم تفعيل وضع الصيانة التقنية فورًا على الرابط الثابت مع استمرار دخولك كمالك.'
              : mode === 'closed'
                ? 'تم قفل الوصول مؤقتًا عبر مركز AZ التقني.'
                : 'تم إنهاء الصيانة وإعادة الموقع للبث المباشر فورًا.'
            : `Access mode switched to ${mode.toUpperCase()} immediately.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'warn',
        text: err instanceof Error ? err.message : 'Mode update failed',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDirectOrderSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetFilmId || !newUrlInput.trim()) return;
    setBusyAction('direct');
    setFeedback(null);
    try {
      const res = await executeDirectLinkUpdate({
        films,
        filmId: targetFilmId,
        field: targetField,
        newUrl: newUrlInput,
        directiveNote,
      });
      if (res.probe) {
        setProbeResults((prev) => [
          res.probe!,
          ...prev.filter((p) => p.id !== res.probe!.id),
        ]);
      }
      setNewUrlInput('');
      setDirectiveNote('');
      setFeedback({
        kind: res.probe && !res.probe.ok ? 'warn' : 'ok',
        text:
          lang === 'ar'
            ? `تم تنفيذ طلب مركز AZ التقني فورًا وتحديث رابط «${res.film.titleAr}» في السحابة (${
                res.probe?.ok ? `متصل ${res.probe.status}` : 'حُفظ الرابط'
              }).`
            : `Updated link for ${res.film.titleEn} immediately.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'warn',
        text: err instanceof Error ? err.message : 'Update failed',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const selectedFilm = films.find((f) => f.id === targetFilmId);
  const currentSelectedUrl = selectedFilm ? selectedFilm[targetField] || '' : '';

  return (
    <div className="space-y-6">
      {/* Header & Real-Time AZ Tech Telemetry */}
      <div className="rounded-xl border border-[#D4AF37]/30 bg-[#0B0B0E] p-6 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-cinema-mono tracking-[0.16em] text-[#D4AF37]">
              <Cpu className="h-4 w-4" />
              <span>AZ TECHNICAL COMMAND CENTER · ADMIN ONLY</span>
            </div>
            <h2 className="text-xl font-bold text-[#F5F5F0]">
              {lang === 'ar'
                ? 'مركز AZ التقني — الصيانة الفورية وتحديث الروابط'
                : 'AZ Technical Center — Instant Maintenance & Link Engine'}
            </h2>
            <p className="text-xs text-[#F5F5F0]/65">
              {lang === 'ar'
                ? 'وحدة عمليات خاصة بالإدارة لفحص روابط الأفلام وإصلاحها سحابيًا، وتنفيذ أوامر الصيانة وتحديث الرابط الثابت فورًا.'
                : 'Admin-only operations hub to probe film links, auto-repair cloud URLs, purge caches, and control live maintenance instantaneously.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-[#F5F5F0]/75 border-t border-white/[0.08] pt-3 lg:border-t-0 lg:pt-0">
            <div>
              <span className="text-[#F5F5F0]/45">{lang === 'ar' ? 'الحالة:' : 'Status:'}</span>{' '}
              <span className="font-semibold text-emerald-400">
                {serverStatus?.status === 'online'
                  ? lang === 'ar'
                    ? 'متصل مباشر'
                    : 'ONLINE'
                  : 'SYNC'}
              </span>
            </div>
            <span aria-hidden="true" className="text-white/20">·</span>
            <div>
              <span className="text-[#F5F5F0]/45">{lang === 'ar' ? 'الأصول:' : 'Assets:'}</span>{' '}
              <span className="font-cinema-mono text-[#D4AF37]">
                {serverStatus ? serverStatus.localAssetsCount + serverStatus.uploadsCount : films.length}
              </span>
            </div>
            <span aria-hidden="true" className="text-white/20">·</span>
            <div>
              <span className="text-[#F5F5F0]/45">{lang === 'ar' ? 'البث:' : 'Access:'}</span>{' '}
              <span
                className={`font-semibold ${
                  siteSettings.accessMode === 'open'
                    ? 'text-emerald-400'
                    : siteSettings.accessMode === 'maintenance'
                      ? 'text-[#D4AF37]'
                      : 'text-red-400'
                }`}
              >
                {siteSettings.accessMode === 'open'
                  ? lang === 'ar'
                    ? 'مفتوح'
                    : 'OPEN'
                  : siteSettings.accessMode === 'maintenance'
                    ? lang === 'ar'
                      ? 'صيانة AZ'
                      : 'MAINTENANCE'
                    : lang === 'ar'
                      ? 'مغلق'
                      : 'CLOSED'}
              </span>
            </div>
          </div>
        </div>

        {/* 1-Tap Instant Maintenance Actions */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleBatchAutoRepair}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 text-xs font-bold text-[#050505] transition-colors hover:bg-[#E6C65B] disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <Zap className="h-4 w-4 shrink-0" />
            <span>
              {busyAction === 'repair'
                ? lang === 'ar'
                  ? 'جاري المعالجة...'
                  : 'Repairing...'
                : lang === 'ar'
                  ? 'إصلاح وتحديث كل الروابط لـ 4K'
                  : 'Auto-Repair All Links & 4K'}
            </span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleFullScanOnly}
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#050505] px-4 text-xs font-semibold text-[#F5F5F0] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <Activity className="h-4 w-4 shrink-0 text-[#D4AF37]" />
            <span>
              {busyAction === 'scan'
                ? lang === 'ar'
                  ? 'جاري الفحص...'
                  : 'Scanning...'
                : lang === 'ar'
                  ? 'فحص صحة الروابط الآن'
                  : 'Live Link Health Scan'}
            </span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handlePurgeAndSync}
            className="flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#050505] px-4 text-xs font-semibold text-[#F5F5F0] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 text-[#D4AF37] ${busyAction === 'cache' ? 'animate-spin' : ''}`} />
            <span>
              {busyAction === 'cache'
                ? lang === 'ar'
                  ? 'جاري التحديث...'
                  : 'Syncing...'
                : lang === 'ar'
                  ? 'مسح الكاش ومزامنة السحابة'
                  : 'Purge Cache & Cloud Sync'}
            </span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              handleQuickMaintenanceToggle(
                siteSettings.accessMode === 'maintenance' ? 'open' : 'maintenance'
              )
            }
            className={`flex h-12 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer ${
              siteSettings.accessMode === 'maintenance'
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20'
            }`}
          >
            {siteSettings.accessMode === 'maintenance' ? (
              <>
                <Unlock className="h-4 w-4 shrink-0" />
                <span>{lang === 'ar' ? 'إنهاء الصيانة وفتح البث' : 'End Maintenance Now'}</span>
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4 shrink-0" />
                <span>{lang === 'ar' ? 'تفعيل صيانة AZ التقنية فورًا' : 'Engage AZ Maintenance'}</span>
              </>
            )}
          </button>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-xs ${
              feedback.kind === 'ok'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                : 'border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5DE93]'
            }`}
          >
            {feedback.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#D4AF37]" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Direct Request & Link Update Workbench */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleDirectOrderSubmit}
          className="lg:col-span-6 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-[#D4AF37]">
            <Link2 className="h-4 w-4" />
            <h3 className="text-sm font-bold">
              {lang === 'ar'
                ? 'تنفيذ طلب تحديث رابط فوري (بناءً على طلب مركز AZ التقني)'
                : 'Instant Link Update Request (AZ Tech Center)'}
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs text-[#F5F5F0]/70">
                {lang === 'ar' ? 'الفيلم المستهدف' : 'Target Film'}
              </label>
              <select
                value={targetFilmId}
                onChange={(e) => setTargetFilmId(e.target.value)}
                className={INPUT_CLS}
              >
                {films.map((f) => (
                  <option key={f.id} value={f.id}>
                    {lang === 'ar' ? f.titleAr : f.titleEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs text-[#F5F5F0]/70">
                {lang === 'ar' ? 'نوع الرابط المراد تحديثه' : 'Link Field'}
              </label>
              <select
                value={targetField}
                onChange={(e) =>
                  setTargetField(
                    e.target.value as 'videoUrl' | 'trailerUrl' | 'posterUrl' | 'backdropUrl'
                  )
                }
                className={INPUT_CLS}
              >
                <option value="videoUrl">
                  {lang === 'ar' ? 'رابط الفيلم الكامل (4K UHD)' : 'Full Film Stream (4K UHD)'}
                </option>
                <option value="trailerUrl">
                  {lang === 'ar' ? 'رابط التريلر / الحفل' : 'Trailer / Gala Stream'}
                </option>
                <option value="posterUrl">{lang === 'ar' ? 'رابط البوستر' : 'Poster URL'}</option>
                <option value="backdropUrl">{lang === 'ar' ? 'رابط الخلفية' : 'Backdrop URL'}</option>
              </select>
            </div>
          </div>

          {currentSelectedUrl && (
            <div className="rounded-lg border border-white/[0.06] bg-[#050505] px-3 py-2 text-[11px]">
              <span className="text-[#F5F5F0]/45">
                {lang === 'ar' ? 'الرابط الحالي:' : 'Current:'}{' '}
              </span>
              <span dir="ltr" className="font-cinema-mono text-[#F5F5F0]/75 break-all">
                {currentSelectedUrl}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs text-[#F5F5F0]/70">
              {lang === 'ar'
                ? 'الرابط الجديد (Google Drive / Dropbox / MP4 / HLS)'
                : 'New Cloud URL (Drive / Dropbox / MP4 / HLS)'}
            </label>
            <input
              type="text"
              dir="ltr"
              required
              value={newUrlInput}
              onChange={(e) => setNewUrlInput(e.target.value)}
              placeholder="https://drive.google.com/file/d/... or https://.../master.mp4"
              className={INPUT_CLS}
            />
            {newUrlInput.trim() && previewNorm.changed && (
              <p className="flex items-center gap-1.5 text-[11px] text-[#D4AF37]">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {lang === 'ar' ? `تحسين تلقائي: ${previewNorm.noteAr}` : previewNorm.noteEn}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-[#F5F5F0]/70">
              {lang === 'ar'
                ? 'وصف أمر الصيانة أو التحديث لمركز AZ التقني (اختياري)'
                : 'Maintenance Directive Note (Optional)'}
            </label>
            <input
              type="text"
              maxLength={300}
              value={directiveNote}
              onChange={(e) => setDirectiveNote(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'مثال: تحديث رابط الفيلم للبث السحابي 4K على رابط البايو...'
                  : 'e.g., Replace cloud link and sync 4K stream...'
              }
              className={INPUT_CLS}
            />
          </div>

          <button
            type="submit"
            disabled={busyAction !== null || !newUrlInput.trim() || !targetFilmId}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] text-xs font-bold text-[#050505] transition-colors hover:bg-[#E6C65B] disabled:opacity-50 cursor-pointer"
          >
            <Send className="h-4 w-4" />
            <span>
              {busyAction === 'direct'
                ? lang === 'ar'
                  ? 'جاري الفحص والتحديث الفوري...'
                  : 'Verifying & Updating...'
                : lang === 'ar'
                  ? 'معالجة وتحديث الرابط فورًا'
                  : 'Process & Update Link Immediately'}
            </span>
          </button>
        </form>

        {/* Live Link Diagnostic Results & Audit Log */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#D4AF37]">
                <ShieldCheck className="h-4 w-4" />
                <h3 className="text-sm font-bold">
                  {lang === 'ar' ? 'نتائج فحص الروابط المباشر' : 'Live Link Probe Results'}
                </h3>
              </div>
              <span className="font-cinema-mono text-[11px] text-[#F5F5F0]/55">
                {probeResults.length} {lang === 'ar' ? 'رابط' : 'links'}
              </span>
            </div>

            {probeResults.length === 0 ? (
              <p className="rounded-lg border border-white/[0.06] bg-[#050505] px-4 py-6 text-center text-xs text-[#F5F5F0]/55">
                {lang === 'ar'
                  ? 'اضغط «فحص صحة الروابط الآن» أو «إصلاح وتحديث كل الروابط» لعرض حالة كل فيلم وزمن الاستجابة.'
                  : 'Click Live Link Health Scan or Auto-Repair to inspect every stream.'}
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {probeResults.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#050505] px-3 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#F5F5F0]">{r.label}</p>
                      <p dir="ltr" className="truncate font-cinema-mono text-[10px] text-[#F5F5F0]/45">
                        {r.url}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-cinema-mono text-[11px]">
                      <span className="text-[#F5F5F0]/50">{r.latencyMs}ms</span>
                      <span
                        className={`font-semibold ${
                          r.ok && !r.devOnlyUpload
                            ? 'text-emerald-400'
                            : r.devOnlyUpload
                              ? 'text-[#D4AF37]'
                              : 'text-red-400'
                        }`}
                      >
                        {r.devOnlyUpload
                          ? 'DEV-ONLY'
                          : r.ok
                            ? `${r.status || 200} OK`
                            : r.issue || 'ERR'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#F5F5F0]">
                {lang === 'ar'
                  ? 'سجل أوامر ومعالجات مركز AZ التقني'
                  : 'AZ Tech Center Execution Log'}
              </h3>
              <span className="font-cinema-mono text-[11px] text-[#D4AF37]">
                {orders.length}
              </span>
            </div>

            {orders.length === 0 ? (
              <p className="rounded-lg border border-white/[0.06] bg-[#050505] px-4 py-6 text-center text-xs text-[#F5F5F0]/55">
                {lang === 'ar'
                  ? 'لا توجد عمليات مسجلة بعد — كل عملية صيانة أو تحديث رابط تُحفظ هنا فور تنفيذها.'
                  : 'No technical orders recorded yet.'}
              </p>
            ) : (
              <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                {orders.map((order) => (
                  <div
                    key={order.orderId}
                    className="rounded-lg border border-white/[0.06] bg-[#050505] p-3 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-semibold ${
                          order.status === 'resolved' ? 'text-emerald-400' : 'text-[#D4AF37]'
                        }`}
                      >
                        {order.requestNote}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-cinema-mono text-[10px] text-[#F5F5F0]/45">
                          {order.latencyMs}ms
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteAzTechOrder(order.orderId)}
                          aria-label={lang === 'ar' ? 'حذف السجل' : 'Delete log'}
                          className="text-[#F5F5F0]/40 hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[#F5F5F0]/70">
                      {order.resolutionNote}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
