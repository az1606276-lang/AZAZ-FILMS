import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Edit3,
  Eye,
  EyeOff,
  Film as FilmIcon,
  Globe,
  Link2,
  Lock,
  Megaphone,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  Star,
  Trash2,
  Unlock,
  Upload,
  Users,
  Vote,
  Wrench,
  X,
} from 'lucide-react';
import { GENRE_LABELS, STATUS_LABELS, t } from '../lib/i18n';
import { fetchAllUsers, updateUserRole } from '../services/authService';
import {
  deleteFilmById,
  sanitizeFilmId,
  saveFilm,
  setFeaturedHeroFilm,
  toggleFilmVisibility,
  updateFilmSortOrder,
  uploadMediaFile,
} from '../services/filmService';
import { saveSiteSettings } from '../services/siteSettingsService';
import {
  createAzTechOrder,
  executeBatchLinkRepair,
  probeAzTechLinks,
  purgeCachesAndSyncServer,
} from '../services/azTechService';
import type {
  AppLanguage,
  CastMember,
  Film,
  FilmGenre,
  FilmStatus,
  SiteAccessMode,
  SiteSettings,
  UserProfile,
  VideoQuality,
} from '../types/cinema';
import { AdminAnalyticsPanel } from './AdminAnalyticsPanel';
import { AzTechCenterPanel } from './AzTechCenterPanel';

interface AdminDashboardProps {
  films: Film[];
  siteSettings: SiteSettings;
  currentUser: UserProfile | null;
  isAdmin: boolean;
  lang: AppLanguage;
}

type AdminTab = 'films' | 'control' | 'az_tech' | 'analytics' | 'users';

function buildSettingsDraft(s: SiteSettings): Omit<SiteSettings, 'updatedAt'> {
  return {
    accessMode: s.accessMode,
    statusTitleAr: s.statusTitleAr,
    statusTitleEn: s.statusTitleEn,
    statusMessageAr: s.statusMessageAr,
    statusMessageEn: s.statusMessageEn,
    announcementEnabled: s.announcementEnabled,
    announcementAr: s.announcementAr,
    announcementEn: s.announcementEn,
    instagramUrl: s.instagramUrl,
    onlyShowReadyFilms: s.onlyShowReadyFilms ?? false,
    countdownEnabled: s.countdownEnabled ?? false,
    countdownTargetIso: s.countdownTargetIso ?? '',
    countdownTitleAr: s.countdownTitleAr ?? '',
    countdownTitleEn: s.countdownTitleEn ?? '',
    pollEnabled: s.pollEnabled ?? false,
    pollId: s.pollId ?? '',
    pollQuestionAr: s.pollQuestionAr ?? '',
    pollQuestionEn: s.pollQuestionEn ?? '',
    pollOptionAAr: s.pollOptionAAr ?? '',
    pollOptionAEn: s.pollOptionAEn ?? '',
    pollOptionBAr: s.pollOptionBAr ?? '',
    pollOptionBEn: s.pollOptionBEn ?? '',
  };
}

const EMPTY_FILM_FORM: Omit<Film, 'createdAt' | 'updatedAt'> = {
  id: '',
  titleAr: '',
  titleEn: '',
  year: new Date().getFullYear(),
  releaseDate: '',
  genre: 'drama',
  duration: '',
  durationSeconds: 0,
  status: 'released',
  isOriginal: true,
  isFeatured: false,
  isVisible: true,
  sortOrder: 10,
  synopsisAr: '',
  synopsisEn: '',
  director: '',
  producers: '',
  cast: [],
  posterUrl: '',
  backdropUrl: '',
  stillUrls: [],
  trailerUrl: '',
  videoUrl: '',
  videoQualities: [],
};

export function AdminDashboard({
  films,
  siteSettings,
  currentUser,
  isAdmin,
  lang,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('films');
  const [editingFilm, setEditingFilm] = useState<Omit<Film, 'createdAt' | 'updatedAt'> | null>(null);
  const [isNewFilm, setIsNewFilm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ field: string; pct: number } | null>(null);

  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [settingsDraft, setSettingsDraft] = useState<Omit<SiteSettings, 'updatedAt'>>(() =>
    buildSettingsDraft(siteSettings)
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [copiedUrlKey, setCopiedUrlKey] = useState<string | null>(null);
  const [linkMaintenanceBusy, setLinkMaintenanceBusy] = useState(false);
  const [linkMaintenanceReport, setLinkMaintenanceReport] = useState<string | null>(null);
  const [customBioUrl, setCustomBioUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem('az_custom_bio_url') || '';
    } catch {
      return '';
    }
  });
  const [editingBioUrl, setEditingBioUrl] = useState(false);
  const [bioUrlInput, setBioUrlInput] = useState('');

  useEffect(() => {
    setSettingsDraft(buildSettingsDraft(siteSettings));
  }, [siteSettings]);

  useEffect(() => {
    if (isAdmin && activeTab === 'users') {
      setUsersLoading(true);
      fetchAllUsers()
        .then(setUsersList)
        .finally(() => setUsersLoading(false));
    }
  }, [isAdmin, activeTab]);

  if (!isAdmin || !currentUser) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="rounded-2xl border border-white/10 bg-[#0B0B0E] p-10 space-y-4">
          <Shield className="mx-auto h-10 w-10 text-[#D4AF37]" />
          <h1 className="text-xl font-bold text-[#F5F5F0]">{t(lang, 'navAdmin')}</h1>
          <p className="text-sm text-[#F5F5F0]/65">{t(lang, 'adminDenied')}</p>
        </div>
      </div>
    );
  }

  const openNewFilm = () => {
    const nextOrder = films.reduce((max, f) => Math.max(max, f.sortOrder), 0) + 1;
    setEditingFilm({ ...EMPTY_FILM_FORM, sortOrder: nextOrder });
    setIsNewFilm(true);
    setFormError(null);
    setMediaNotice(null);
  };

  const openEditFilm = (film: Film) => {
    setEditingFilm({
      id: film.id,
      titleAr: film.titleAr,
      titleEn: film.titleEn,
      year: film.year,
      releaseDate: film.releaseDate || '',
      genre: film.genre,
      duration: film.duration || '',
      durationSeconds: film.durationSeconds || 0,
      status: film.status,
      isOriginal: film.isOriginal,
      isFeatured: film.isFeatured,
      isVisible: film.isVisible,
      sortOrder: film.sortOrder,
      synopsisAr: film.synopsisAr || '',
      synopsisEn: film.synopsisEn || '',
      director: film.director || '',
      producers: film.producers || '',
      cast: film.cast ? [...film.cast] : [],
      posterUrl: film.posterUrl || '',
      backdropUrl: film.backdropUrl || '',
      stillUrls: film.stillUrls ? [...film.stillUrls] : [],
      trailerUrl: film.trailerUrl || '',
      videoUrl: film.videoUrl || '',
      videoQualities: film.videoQualities ? [...film.videoQualities] : [],
    });
    setIsNewFilm(false);
    setFormError(null);
    setMediaNotice(null);
  };

  const handleFileUpload = async (
    file: File,
    category: 'posters' | 'backdrops' | 'stills' | 'trailers' | 'videos',
    onDone: (url: string) => void
  ) => {
    setFormError(null);
    setMediaNotice(null);
    setUploadProgress({ field: category, pct: 0 });
    try {
      const url = await uploadMediaFile(file, category, (pct) =>
        setUploadProgress({ field: category, pct })
      );
      onDone(url);
      setMediaNotice(
        lang === 'ar'
          ? 'تم رفع الملف بنجاح. اضغط "حفظ الفيلم" بالأسفل لتثبيت التغييرات.'
          : 'File uploaded successfully. Click "Save Film" below to commit changes.'
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleSaveFilm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFilm) return;
    if (!editingFilm.titleAr.trim() || !editingFilm.titleEn.trim()) {
      setFormError(
        lang === 'ar'
          ? 'يرجى إدخال اسم الفيلم بالعربية والإنجليزية.'
          : 'Both Arabic and English titles are required.'
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const targetId = isNewFilm
        ? sanitizeFilmId(editingFilm.id || editingFilm.titleEn)
        : editingFilm.id;
      await saveFilm({ ...editingFilm, id: targetId }, isNewFilm, films);
      setEditingFilm(null);
      setMediaNotice(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save film');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (index: number, dir: -1 | 1) => {
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= films.length) return;
    const current = films[index];
    const target = films[swapIdx];
    const currentOrder = current.sortOrder;
    const targetOrder = target.sortOrder === currentOrder ? currentOrder + dir : target.sortOrder;
    await Promise.all([
      updateFilmSortOrder(current.id, targetOrder),
      updateFilmSortOrder(target.id, currentOrder),
    ]);
  };

  const handleRoleToggle = async (u: UserProfile) => {
    const nextRole = u.role === 'admin' ? 'viewer' : 'admin';
    await updateUserRole(u, nextRole, currentUser.uid);
    setUsersList((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, role: nextRole } : x)));
  };

  const handleSwitchAccessMode = async (mode: SiteAccessMode) => {
    const nextDraft = { ...settingsDraft, accessMode: mode };
    setSettingsDraft(nextDraft);
    setSavingSettings(true);
    setSettingsNotice(null);
    try {
      await saveSiteSettings(nextDraft);
      if (typeof window !== 'undefined' && 'caches' in window) {
        window.caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => window.caches.delete(k))))
          .catch(() => {});
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => regs.forEach((r) => r.update().catch(() => {})))
          .catch(() => {});
      }
      setSettingsNotice(
        lang === 'ar'
          ? mode === 'open'
            ? 'تم فتح الموقع للجميع فورًا وتحديث الكاش على الرابط.'
            : mode === 'maintenance'
            ? 'تم تفعيل وضع الصيانة فورًا على الرابط الجديد.'
            : 'تم إغلاق الموقع مؤقتًا للزوار.'
          : `Site mode switched to ${mode.toUpperCase()} immediately.`
      );
    } catch (err) {
      setSettingsNotice(err instanceof Error ? err.message : 'Error updating mode');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleInstantLinkMaintenance = async () => {
    setLinkMaintenanceBusy(true);
    setLinkMaintenanceReport(null);
    const startedAt = Date.now();
    try {
      const [repairOutcome, siteProbe, cacheOutcome] = await Promise.all([
        executeBatchLinkRepair(films),
        probeAzTechLinks([
          {
            id: 'site:shared',
            field: 'siteUrl',
            label: lang === 'ar' ? 'الرابط العام للمنصة' : 'Shared Public URL',
            url: sharedBaseUrl,
          },
        ]),
        purgeCachesAndSyncServer(siteSettings),
      ]);

      const siteResult = siteProbe.results[0];
      const latency = Date.now() - startedAt;

      await createAzTechOrder({
        actionType: 'batch_repair',
        requestNote: 'صيانة ومعالجة فورية للرابط الجديد من خانة التحكم بالروابط',
        resolutionNote: `تم فحص الرابط العام (${siteResult?.status || 'LIVE'}) وتحديث ${repairOutcome.updatedFilms} فيلم + مسح ${cacheOutcome.cachesCleared} كاش خلال ${latency}ms`,
        status: repairOutcome.brokenCount > 0 ? 'warning' : 'resolved',
        checkedLinks: repairOutcome.checkedLinks + 1,
        updatedLinks: repairOutcome.updatedFilms,
        latencyMs: latency,
      }).catch(() => {});

      setLinkMaintenanceReport(
        lang === 'ar'
          ? `تمت صيانة الرابط الجديد فورًا (${latency}ms) — حالة الرابط: ${
              siteResult?.ok ? `متصل (${siteResult.status})` : 'تمت المزامنة'
            } | فحص ${repairOutcome.checkedLinks} رابط أفلام وتحديث ${repairOutcome.updatedFilms} عمل للـ 4K + مسح ${
              cacheOutcome.cachesCleared
            } كاش قديم.`
          : `New link maintenance done (${latency}ms): URL ${
              siteResult?.ok ? `live (${siteResult.status})` : 'synced'
            }, checked ${repairOutcome.checkedLinks} media links, updated ${repairOutcome.updatedFilms} films to 4K, purged ${cacheOutcome.cachesCleared} caches.`
      );
    } catch (err) {
      setLinkMaintenanceReport(
        err instanceof Error ? err.message : 'Link maintenance encountered an error'
      );
    } finally {
      setLinkMaintenanceBusy(false);
    }
  };

  const handleSaveSettingsForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsNotice(null);
    try {
      await saveSiteSettings(settingsDraft);
      setSettingsNotice(
        lang === 'ar' ? 'تم حفظ إعدادات الرابط والموقع بنجاح.' : 'Site & link settings saved.'
      );
    } catch (err) {
      setSettingsNotice(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrlKey(key);
      window.setTimeout(() => setCopiedUrlKey(null), 2200);
    } catch {
      setCopiedUrlKey(null);
    }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isDevPreview =
    !currentOrigin ||
    currentOrigin.includes('ais-dev-') ||
    currentOrigin.includes('localhost') ||
    currentOrigin.includes('127.0.0.1');
  const defaultPublishedOrigin =
    'https://ais-pre-4uxmpklg4xnkqhtb7zpi47-418838364307.europe-west2.run.app';
  const defaultNewBioUrl = `${defaultPublishedOrigin}/?v=2026-4k`;
  const displayBioUrl =
    customBioUrl.trim() || (isDevPreview ? defaultNewBioUrl : `${currentOrigin}/?v=2026-4k`);
  const sharedBaseUrl = (() => {
    try {
      return new URL(displayBioUrl).origin;
    } catch {
      return isDevPreview ? defaultPublishedOrigin : currentOrigin;
    }
  })();

  const applyNewBioUrl = (raw: string) => {
    const cleaned = raw.trim();
    setCustomBioUrl(cleaned);
    try {
      if (cleaned) {
        localStorage.setItem('az_custom_bio_url', cleaned);
      } else {
        localStorage.removeItem('az_custom_bio_url');
      }
    } catch {
      // Ignore storage quota error
    }
    setEditingBioUrl(false);
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 space-y-8">
      {/* Admin Top Header */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs tracking-[0.2em] text-[#D4AF37]">AZ FILMS STUDIO</p>
          <h1 className="mt-1 text-2xl font-bold text-[#F5F5F0] sm:text-3xl">
            {t(lang, 'adminTitle')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('films')}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'films'
                ? 'bg-[#D4AF37] text-[#050505]'
                : 'border border-white/10 bg-[#0B0B0E] text-[#F5F5F0]/80 hover:border-white/25'
            }`}
          >
            <FilmIcon className="h-4 w-4" />
            <span>{t(lang, 'tabFilms')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('control')}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'control'
                ? 'bg-[#D4AF37] text-[#050505]'
                : 'border border-white/10 bg-[#0B0B0E] text-[#F5F5F0]/80 hover:border-white/25'
            }`}
          >
            <Link2 className="h-4 w-4" />
            <span>{t(lang, 'tabSiteControl')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('az_tech')}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'az_tech'
                ? 'bg-[#D4AF37] text-[#050505]'
                : 'border border-[#D4AF37]/30 bg-[#0B0B0E] text-[#D4AF37] hover:border-[#D4AF37]/60'
            }`}
          >
            <Cpu className="h-4 w-4" />
            <span>{t(lang, 'tabAzTech')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-[#D4AF37] text-[#050505]'
                : 'border-white/10 bg-[#0B0B0E] text-[#F5F5F0]/80 hover:border-white/25'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>{t(lang, 'tabAnalytics')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'users'
                ? 'bg-[#D4AF37] text-[#050505]'
                : 'border border-white/10 bg-[#0B0B0E] text-[#F5F5F0]/80 hover:border-white/25'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>{t(lang, 'tabUsers')}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: FILM MANAGEMENT */}
      {activeTab === 'films' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#F5F5F0]/65">
              {lang === 'ar'
                ? `إجمالي الأعمال في المكتبة: ${films.length}`
                : `Total catalog entries: ${films.length}`}
            </p>
            <button
              type="button"
              onClick={openNewFilm}
              className="flex h-10 items-center gap-2 rounded-lg bg-[#D4AF37] px-4 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{t(lang, 'addNewFilm')}</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0B0B0E]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-[#F5F5F0]/55">
                  <th className="px-4 py-3 text-start font-medium">#</th>
                  <th className="px-4 py-3 text-start font-medium">{lang === 'ar' ? 'الفيلم' : 'Film'}</th>
                  <th className="px-4 py-3 text-start font-medium">{t(lang, 'genreLabel')}</th>
                  <th className="px-4 py-3 text-start font-medium">{t(lang, 'statusLabel')}</th>
                  <th className="px-4 py-3 text-start font-medium">{lang === 'ar' ? 'الوسائط' : 'Media'}</th>
                  <th className="px-4 py-3 text-end font-medium">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {films.map((film, idx) => (
                  <tr
                    key={film.id}
                    className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-cinema-mono text-xs text-[#F5F5F0]/50 w-6">
                          {film.sortOrder}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleReorder(idx, -1)}
                          disabled={idx === 0}
                          aria-label="Move up"
                          className="p-1 text-[#F5F5F0]/45 hover:text-[#D4AF37] disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorder(idx, 1)}
                          disabled={idx === films.length - 1}
                          aria-label="Move down"
                          className="p-1 text-[#F5F5F0]/45 hover:text-[#D4AF37] disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#F5F5F0]">{film.titleAr}</div>
                      <div className="text-xs text-[#F5F5F0]/55">
                        {film.titleEn} · <span className="tabular-nums">{film.year}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#F5F5F0]/75">
                      {GENRE_LABELS[film.genre]?.[lang]}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#F5F5F0]/75">
                      {STATUS_LABELS[film.status]?.[lang]}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#F5F5F0]/60">
                      <span className={film.posterUrl ? 'text-[#D4AF37]' : ''}>
                        {film.posterUrl ? 'Poster ✓' : 'Poster —'}
                      </span>
                      <span className="mx-1.5">·</span>
                      <span className={film.videoUrl ? 'text-[#D4AF37]' : ''}>
                        {film.videoUrl ? 'Video ✓' : 'Video —'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setFeaturedHeroFilm(film.id, films)}
                          title={film.isFeatured ? t(lang, 'featuredInHero') : t(lang, 'setAsHero')}
                          className={`flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors cursor-pointer ${
                            film.isFeatured
                              ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]'
                              : 'border-white/10 text-[#F5F5F0]/60 hover:border-white/25'
                          }`}
                        >
                          <Star className={`h-3.5 w-3.5 ${film.isFeatured ? 'fill-current' : ''}`} />
                          <span className="hidden xl:inline">
                            {film.isFeatured ? t(lang, 'featuredInHero') : t(lang, 'setAsHero')}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleFilmVisibility(film.id, !film.isVisible)}
                          title={film.isVisible ? t(lang, 'visibleLabel') : t(lang, 'hiddenLabel')}
                          className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                            film.isVisible
                              ? 'border-white/10 text-[#F5F5F0]/75 hover:border-white/30'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {film.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditFilm(film)}
                          aria-label={t(lang, 'editFilm')}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-[#F5F5F0]/80 hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        {confirmDeleteId === film.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteFilmById(film.id);
                              setConfirmDeleteId(null);
                            }}
                            className="h-8 rounded-md bg-red-600 px-2.5 text-xs font-semibold text-white hover:bg-red-500 cursor-pointer"
                          >
                            {t(lang, 'confirmDelete')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(film.id)}
                            aria-label={t(lang, 'deleteFilm')}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-[#F5F5F0]/60 hover:border-red-500/50 hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SITE & LINK CONTROL (FOR INSTAGRAM BIO & LIVE ACCESS) */}
      {activeTab === 'control' && (
        <div className="space-y-6">
          {settingsNotice && (
            <div className="flex items-center gap-2 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3 text-xs font-medium text-[#D4AF37]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{settingsNotice}</span>
            </div>
          )}

          {/* Instant 1-Tap Access Mode Switch */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-6 space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-[#F5F5F0]">
                  {lang === 'ar'
                    ? 'التحكم الفوري في حالة الموقع والرابط'
                    : 'Live Site Access Control'}
                </h2>
                <p className="text-xs text-[#F5F5F0]/60">
                  {lang === 'ar'
                    ? 'أي تغيير هنا ينعكس لحظيًا على الرابط المثبت في إنستغرام بدون تعديل الرابط — وأنت كمالك يظل الموقع مفتوحًا لك.'
                    : 'Changes apply immediately on your pinned Instagram bio link while keeping full owner access.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => handleSwitchAccessMode('open')}
                className={`flex items-start gap-3 rounded-xl border p-4 text-start transition-colors cursor-pointer ${
                  settingsDraft.accessMode === 'open'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-[#F5F5F0]'
                    : 'border-white/10 bg-[#050505] text-[#F5F5F0]/75 hover:border-white/25'
                }`}
              >
                <Unlock
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    settingsDraft.accessMode === 'open' ? 'text-emerald-400' : 'text-[#F5F5F0]/45'
                  }`}
                />
                <div className="space-y-1">
                  <div className="text-sm font-bold">
                    {lang === 'ar' ? 'مفتوح للجميع' : 'Open (Live)'}
                  </div>
                  <p className="text-xs text-[#F5F5F0]/60">
                    {lang === 'ar'
                      ? 'جميع الزوار يشاهدون الأفلام بشكل طبيعي.'
                      : 'All visitors can browse and watch films.'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={savingSettings}
                onClick={() => handleSwitchAccessMode('maintenance')}
                className={`flex items-start gap-3 rounded-xl border p-4 text-start transition-colors cursor-pointer ${
                  settingsDraft.accessMode === 'maintenance'
                    ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5F5F0]'
                    : 'border-white/10 bg-[#050505] text-[#F5F5F0]/75 hover:border-white/25'
                }`}
              >
                <Wrench
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    settingsDraft.accessMode === 'maintenance' ? 'text-[#D4AF37]' : 'text-[#F5F5F0]/45'
                  }`}
                />
                <div className="space-y-1">
                  <div className="text-sm font-bold">
                    {lang === 'ar' ? 'وضع الصيانة' : 'Maintenance Mode'}
                  </div>
                  <p className="text-xs text-[#F5F5F0]/60">
                    {lang === 'ar'
                      ? 'تظهر شاشة «قيد التحديث والصيانة» مع رسالتك.'
                      : 'Shows cinema maintenance screen with custom note.'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={savingSettings}
                onClick={() => handleSwitchAccessMode('closed')}
                className={`flex items-start gap-3 rounded-xl border p-4 text-start transition-colors cursor-pointer ${
                  settingsDraft.accessMode === 'closed'
                    ? 'border-red-500/70 bg-red-500/10 text-[#F5F5F0]'
                    : 'border-white/10 bg-[#050505] text-[#F5F5F0]/75 hover:border-white/25'
                }`}
              >
                <Lock
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    settingsDraft.accessMode === 'closed' ? 'text-red-400' : 'text-[#F5F5F0]/45'
                  }`}
                />
                <div className="space-y-1">
                  <div className="text-sm font-bold">
                    {lang === 'ar' ? 'إغلاق الموقع مؤقتًا' : 'Closed / Locked'}
                  </div>
                  <p className="text-xs text-[#F5F5F0]/60">
                    {lang === 'ar'
                      ? 'قفل الرابط مؤقتًا ومنع العرض عن الزوار.'
                      : 'Locks public link until you reopen it.'}
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Form for Custom Messages, Announcement Banner & Instagram Handle */}
            <form
              onSubmit={handleSaveSettingsForm}
              className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-6 space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#D4AF37]">
                  {lang === 'ar'
                    ? 'رسالة الصيانة والإعلان العلوي'
                    : 'Maintenance Notice & Live Banner'}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSettingsDraft((d) => ({
                        ...d,
                        statusTitleAr: 'نجهّز فيلمًا جديدًا الآن',
                        statusTitleEn: 'Preparing a New Release',
                        statusMessageAr:
                          'نقوم حاليًا برفع عمل سينمائي جديد على AZ FILMS. ترقّبوا الافتتاح بعد قليل.',
                        statusMessageEn:
                          'We are preparing a new AZ FILMS premiere. Opening shortly.',
                      }))
                    }
                    className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#F5F5F0]/70 hover:border-[#D4AF37] cursor-pointer"
                  >
                    {lang === 'ar' ? 'قالب: تحضير فيلم جديد' : 'Preset: New Film'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettingsDraft((d) => ({
                        ...d,
                        statusTitleAr: 'المنصة مغلقة مؤقتًا',
                        statusTitleEn: 'Temporarily Closed',
                        statusMessageAr:
                          'تم إيقاف البث مؤقتًا من قِبل الإدارة. شكرًا لزيارتكم ونعود قريبًا.',
                        statusMessageEn:
                          'Streaming is temporarily paused by management. Thank you for visiting.',
                      }))
                    }
                    className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#F5F5F0]/70 hover:border-[#D4AF37] cursor-pointer"
                  >
                    {lang === 'ar' ? 'قالب: إغلاق مؤقت' : 'Preset: Closed'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={lang === 'ar' ? 'عنوان شاشة القفل (عربي)' : 'Lock Title (AR)'}>
                  <input
                    type="text"
                    value={settingsDraft.statusTitleAr}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, statusTitleAr: e.target.value })
                    }
                    className={INPUT_CLS}
                  />
                </Field>
                <Field label={lang === 'ar' ? 'عنوان شاشة القفل (إنجليزي)' : 'Lock Title (EN)'}>
                  <input
                    type="text"
                    value={settingsDraft.statusTitleEn}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, statusTitleEn: e.target.value })
                    }
                    className={INPUT_CLS}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={lang === 'ar' ? 'الرسالة للزوار (عربي)' : 'Visitor Message (AR)'}>
                  <textarea
                    rows={3}
                    value={settingsDraft.statusMessageAr}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, statusMessageAr: e.target.value })
                    }
                    className={INPUT_CLS + ' h-auto py-2'}
                  />
                </Field>
                <Field label={lang === 'ar' ? 'الرسالة للزوار (إنجليزي)' : 'Visitor Message (EN)'}>
                  <textarea
                    rows={3}
                    value={settingsDraft.statusMessageEn}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, statusMessageEn: e.target.value })
                    }
                    className={INPUT_CLS + ' h-auto py-2'}
                  />
                </Field>
              </div>

              <div className="border-t border-white/[0.08] pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5F0]">
                    <Megaphone className="h-4 w-4 text-[#D4AF37]" />
                    <span>
                      {lang === 'ar'
                        ? 'شريط إعلان علوي عند فتح الموقع'
                        : 'Top Announcement Bar (when Open)'}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#F5F5F0]/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.announcementEnabled}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          announcementEnabled: e.target.checked,
                        })
                      }
                      className="accent-[#D4AF37]"
                    />
                    <span>{lang === 'ar' ? 'تفعيل الشريط' : 'Enable'}</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={lang === 'ar' ? 'نص الإعلان (عربي)' : 'Announcement (AR)'}>
                    <input
                      type="text"
                      placeholder={
                        lang === 'ar'
                          ? 'مثال: فيلم العملية الأخيرة متاح للمشاهدة الآن!'
                          : 'e.g. Watch THE LAST OPERATION now!'
                      }
                      value={settingsDraft.announcementAr}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, announcementAr: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </Field>
                  <Field label={lang === 'ar' ? 'نص الإعلان (إنجليزي)' : 'Announcement (EN)'}>
                    <input
                      type="text"
                      placeholder="Now streaming: THE LAST OPERATION"
                      value={settingsDraft.announcementEn}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, announcementEn: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </Field>
                </div>
              </div>

              <Field
                label={
                  lang === 'ar'
                    ? 'حساب إنستغرام (يظهر في شاشة الصيانة وأسفل الموقع)'
                    : 'Instagram Account (@username or URL)'
                }
              >
                <input
                  type="text"
                  dir="ltr"
                  placeholder="https://instagram.com/your_account"
                  value={settingsDraft.instagramUrl}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, instagramUrl: e.target.value })
                  }
                  className={INPUT_CLS}
                />
              </Field>

              {/* Smart Filter: Only Show Ready Films with Poster */}
              <div className="border-t border-white/[0.08] pt-4">
                <label className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-[#050505] p-3.5 cursor-pointer hover:border-[#D4AF37]/40 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5F0]">
                      <Eye className="h-4 w-4 text-[#D4AF37]" />
                      <span>
                        {lang === 'ar'
                          ? 'إظهار الأعمال المكتملة بالبوستر فقط للزوار'
                          : 'Show Only Completed Films (with Poster) to Visitors'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#F5F5F0]/55">
                      {lang === 'ar'
                        ? 'يُخفي تلقائيًا أي عمل لم يُرفع بوستره بعد عن الزوار، بينما يظل ظاهرًا لك في الإدارة.'
                        : 'Automatically hides works without an uploaded poster from public visitors.'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settingsDraft.onlyShowReadyFilms)}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        onlyShowReadyFilms: e.target.checked,
                      })
                    }
                    className="mt-1 h-4 w-4 accent-[#D4AF37]"
                  />
                </label>
              </div>

              {/* Premiere Countdown Controls */}
              <div className="border-t border-white/[0.08] pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5F0]">
                    <Clock className="h-4 w-4 text-[#D4AF37]" />
                    <span>
                      {lang === 'ar'
                        ? 'عدّ تنازلي لموعد عرض الفيلم القادم'
                        : 'Next Premiere Countdown Timer'}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#F5F5F0]/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(settingsDraft.countdownEnabled)}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          countdownEnabled: e.target.checked,
                        })
                      }
                      className="accent-[#D4AF37]"
                    />
                    <span>{lang === 'ar' ? 'تفعيل العدّ التنازلي' : 'Enable'}</span>
                  </label>
                </div>

                <Field
                  label={
                    lang === 'ar'
                      ? 'تاريخ وساعة العرض الأول'
                      : 'Premiere Date & Time'
                  }
                >
                  <input
                    type="datetime-local"
                    dir="ltr"
                    value={(() => {
                      if (!settingsDraft.countdownTargetIso) return '';
                      const d = new Date(settingsDraft.countdownTargetIso);
                      if (isNaN(d.getTime())) return '';
                      const pad = (n: number) => String(n).padStart(2, '0');
                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
                        d.getHours()
                      )}:${pad(d.getMinutes())}`;
                    })()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setSettingsDraft({ ...settingsDraft, countdownTargetIso: '' });
                        return;
                      }
                      const parsed = new Date(val);
                      if (!isNaN(parsed.getTime())) {
                        setSettingsDraft({
                          ...settingsDraft,
                          countdownTargetIso: parsed.toISOString(),
                        });
                      }
                    }}
                    className={INPUT_CLS}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={lang === 'ar' ? 'عنوان العدّ التنازلي (عربي)' : 'Countdown Title (AR)'}>
                    <input
                      type="text"
                      value={settingsDraft.countdownTitleAr || ''}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, countdownTitleAr: e.target.value })
                      }
                      placeholder="العرض الأول للعمل القادم خلال"
                      className={INPUT_CLS}
                    />
                  </Field>
                  <Field label={lang === 'ar' ? 'عنوان العدّ التنازلي (إنجليزي)' : 'Countdown Title (EN)'}>
                    <input
                      type="text"
                      value={settingsDraft.countdownTitleEn || ''}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, countdownTitleEn: e.target.value })
                      }
                      placeholder="Next Premiere Arriving In"
                      className={INPUT_CLS}
                    />
                  </Field>
                </div>
              </div>

              {/* Audience Greenlight Poll Controls */}
              <div className="border-t border-white/[0.08] pt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5F0]">
                    <Vote className="h-4 w-4 text-[#D4AF37]" />
                    <span>
                      {lang === 'ar'
                        ? 'تصويت الجمهور على الفيلم القادم'
                        : 'Audience Greenlight Poll'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        setSettingsDraft({
                          ...settingsDraft,
                          pollId: `poll-${Date.now()}`,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#D4AF37] hover:border-[#D4AF37]/50 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{lang === 'ar' ? 'تصفير / جولة جديدة' : 'Reset / New Round'}</span>
                    </button>
                    <label className="flex items-center gap-2 text-xs text-[#F5F5F0]/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settingsDraft.pollEnabled !== false}
                        onChange={(e) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            pollEnabled: e.target.checked,
                          })
                        }
                        className="accent-[#D4AF37]"
                      />
                      <span>{lang === 'ar' ? 'إظهار التصويت' : 'Enable Poll'}</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={lang === 'ar' ? 'سؤال التصويت (عربي)' : 'Poll Question (AR)'}>
                    <input
                      type="text"
                      maxLength={180}
                      value={settingsDraft.pollQuestionAr || ''}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, pollQuestionAr: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </Field>
                  <Field label={lang === 'ar' ? 'سؤال التصويت (إنجليزي)' : 'Poll Question (EN)'}>
                    <input
                      type="text"
                      maxLength={180}
                      value={settingsDraft.pollQuestionEn || ''}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, pollQuestionEn: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={lang === 'ar' ? 'الخيار أ (عربي)' : 'Option A (AR)'}>
                    <input
                      type="text"
                      maxLength={120}
                      value={settingsDraft.pollOptionAAr || ''}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, pollOptionAAr: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </Field>
                  <Field label={lang === 'ar' ? 'الخيار أ (إنجليزي)' : 'Option A (EN)'}>
                    <input
                      type="text"
                      maxLength={120}
                      value={settingsDraft.pollOptionAEn || ''}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, pollOptionAEn: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={lang === 'ar' ? 'الخيار ب (عربي)' : 'Option B (AR)'}>
                    <input
                      type="text"
                      maxLength={120}
                      value={settingsDraft.pollOptionBAr || ''}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, pollOptionBAr: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </Field>
                  <Field label={lang === 'ar' ? 'الخيار ب (إنجليزي)' : 'Option B (EN)'}>
                    <input
                      type="text"
                      maxLength={120}
                      value={settingsDraft.pollOptionBEn || ''}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, pollOptionBEn: e.target.value })
                      }
                      className={INPUT_CLS}
                    />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="h-10 rounded-lg bg-[#D4AF37] px-6 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] disabled:opacity-50 cursor-pointer"
                >
                  {savingSettings
                    ? '...'
                    : lang === 'ar'
                    ? 'حفظ إعدادات الموقع'
                    : 'Save Settings'}
                </button>
              </div>
            </form>

            {/* Instagram Bio Link & Film Direct Links Card */}
            <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-6 space-y-5 h-fit">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-[#D4AF37]">
                  {lang === 'ar'
                    ? 'الرابط الثابت لبايو إنستغرام'
                    : 'Fixed Instagram Bio Link'}
                </h2>
                <p className="text-xs leading-relaxed text-[#F5F5F0]/65">
                  {lang === 'ar'
                    ? 'ثبّت هذا الرابط في البايو. أي فيلم تضيفه بروابط سحابية أو أي تعديل أو قفل للموقع يتحدث تلقائيًا عبر السحابة على نفس الرابط:'
                    : 'Pin this URL in your Instagram bio. Cloud film updates and site access locks sync automatically on this link:'}
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-[#D4AF37]/35 bg-[#050505] p-2.5">
                <Globe className="h-4 w-4 text-[#D4AF37] shrink-0" />
                <span dir="ltr" className="font-cinema-mono text-[11px] leading-relaxed text-[#D4AF37] break-all flex-1">
                  {displayBioUrl}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBioUrlInput(displayBioUrl);
                    setEditingBioUrl((prev) => !prev);
                  }}
                  title={lang === 'ar' ? 'تغيير الرابط' : 'Change Link'}
                  className="flex h-8 items-center gap-1 rounded-md border border-white/15 bg-white/[0.03] px-2.5 text-[11px] font-medium text-[#F5F5F0]/80 hover:border-[#D4AF37] hover:text-[#D4AF37] shrink-0 cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>{lang === 'ar' ? 'تغيير' : 'Edit'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyText('main', displayBioUrl)}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-[#D4AF37] px-3 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] shrink-0 cursor-pointer"
                >
                  {copiedUrlKey === 'main' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {copiedUrlKey === 'main'
                      ? lang === 'ar'
                        ? 'تم النسخ'
                        : 'Copied'
                      : lang === 'ar'
                      ? 'نسخ'
                      : 'Copy'}
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyNewBioUrl(defaultNewBioUrl)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                    displayBioUrl === defaultNewBioUrl
                      ? 'border-[#D4AF37]/70 bg-[#D4AF37]/15 text-[#D4AF37]'
                      : 'border-white/10 text-[#F5F5F0]/75 hover:border-[#D4AF37]'
                  }`}
                >
                  {lang === 'ar' ? 'الرابط العام الجديد (?v=2026-4k)' : 'New Public URL (?v=2026-4k)'}
                </button>
                <button
                  type="button"
                  onClick={() => applyNewBioUrl('https://gen-lang-client-0286519577.web.app')}
                  className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                    displayBioUrl === 'https://gen-lang-client-0286519577.web.app'
                      ? 'border-[#D4AF37]/70 bg-[#D4AF37]/15 text-[#D4AF37]'
                      : 'border-white/10 text-[#F5F5F0]/75 hover:border-[#D4AF37]'
                  }`}
                >
                  {lang === 'ar' ? 'الرابط المجاني الدائم (.web.app)' : 'Free Firebase URL (.web.app)'}
                </button>
                {currentOrigin && (
                  <button
                    type="button"
                    onClick={() => applyNewBioUrl(currentOrigin)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                      displayBioUrl === currentOrigin
                        ? 'border-[#D4AF37]/70 bg-[#D4AF37]/15 text-[#D4AF37]'
                        : 'border-white/10 text-[#F5F5F0]/75 hover:border-[#D4AF37]'
                    }`}
                  >
                    {lang === 'ar' ? 'رابط المعاينة المباشر (الجديد)' : 'Live Preview URL'}
                  </button>
                )}
              </div>

              {editingBioUrl && (
                <div className="rounded-xl border border-[#D4AF37]/35 bg-[#050505] p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      dir="ltr"
                      value={bioUrlInput}
                      onChange={(e) => setBioUrlInput(e.target.value)}
                      placeholder="https://..."
                      className={INPUT_CLS + ' font-cinema-mono text-xs'}
                    />
                    <button
                      type="button"
                      onClick={() => applyNewBioUrl(bioUrlInput)}
                      className="h-10 rounded-lg bg-[#D4AF37] px-3.5 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] shrink-0 cursor-pointer"
                    >
                      {lang === 'ar' ? 'تطبيق' : 'Apply'}
                    </button>
                  </div>
                </div>
              )}

              {/* Instant New Link Maintenance & Cache Busting Controls */}
              <div className="rounded-xl border border-[#D4AF37]/30 bg-[#050505] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
                    <Wrench className="h-4 w-4 shrink-0" />
                    <span>
                      {lang === 'ar'
                        ? 'صيانة وتحديث فوري على الرابط الجديد'
                        : 'Instant Link Maintenance & Sync'}
                    </span>
                  </div>
                  <span className="font-cinema-mono text-[10px] text-[#F5F5F0]/55">
                    {siteSettings.accessMode === 'maintenance'
                      ? lang === 'ar'
                        ? 'قيد الصيانة الآن'
                        : 'MAINTENANCE ON'
                      : siteSettings.accessMode === 'closed'
                      ? lang === 'ar'
                        ? 'مغلق'
                        : 'CLOSED'
                      : lang === 'ar'
                      ? 'مفتوح LIVE'
                      : 'LIVE'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={linkMaintenanceBusy}
                    onClick={handleInstantLinkMaintenance}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${linkMaintenanceBusy ? 'animate-spin' : ''}`} />
                    <span>
                      {linkMaintenanceBusy
                        ? lang === 'ar'
                          ? 'جاري الصيانة والمزامنة...'
                          : 'Maintaining...'
                        : lang === 'ar'
                        ? 'صيانة وتحديث الرابط الآن'
                        : 'Run Link Maintenance Now'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() =>
                      handleSwitchAccessMode(
                        settingsDraft.accessMode === 'maintenance' ? 'open' : 'maintenance'
                      )
                    }
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                      settingsDraft.accessMode === 'maintenance'
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        : 'border-[#D4AF37]/45 bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20'
                    }`}
                  >
                    {settingsDraft.accessMode === 'maintenance' ? (
                      <>
                        <Unlock className="h-3.5 w-3.5" />
                        <span>{lang === 'ar' ? 'إنهاء الصيانة وفتح الرابط' : 'Reopen Live Link'}</span>
                      </>
                    ) : (
                      <>
                        <Wrench className="h-3.5 w-3.5" />
                        <span>{lang === 'ar' ? 'تفعيل شاشة الصيانة على الرابط' : 'Enable Maintenance Screen'}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText('fresh', `${sharedBaseUrl}/?v=${Math.floor(Date.now() / 1000)}`)
                    }
                    className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-3 text-[11px] font-medium text-[#F5F5F0]/85 hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
                  >
                    {copiedUrlKey === 'fresh' ? (
                      <Check className="h-3.5 w-3.5 text-[#D4AF37]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {copiedUrlKey === 'fresh'
                        ? lang === 'ar'
                          ? 'تم نسخ الرابط المحدّث'
                          : 'Fresh Link Copied'
                        : lang === 'ar'
                        ? 'نسخ رابط جديد يكسر كاش إنستغرام (?v=)'
                        : 'Copy Cache-Busting Fresh Link'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('az_tech')}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-[#D4AF37]/30 px-3 text-[11px] font-semibold text-[#D4AF37] hover:border-[#D4AF37] cursor-pointer"
                  >
                    <Cpu className="h-3.5 w-3.5" />
                    <span>{lang === 'ar' ? 'مركز AZ التقني' : 'AZ Tech Center'}</span>
                  </button>
                </div>

                {linkMaintenanceReport && (
                  <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-200">
                    {linkMaintenanceReport}
                  </div>
                )}
              </div>

              <p className="rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 text-[11px] leading-relaxed text-[#F5F5F0]/60">
                {lang === 'ar'
                  ? 'ملاحظة: تعديلات لوحة الإدارة (قفل الموقع، الأفلام السحابية، الإعلانات) تنعكس لحظيًا. أما أي تحديث برمجي جديد في واجهة الموقع فيظهر على الرابط الثابت فور الضغط على زر النشر (Share / Publish) بالأعلى، مع مسح تلقائي للكاش عند الزوار.'
                  : 'Admin data changes sync live. New UI/code builds appear on the fixed URL after clicking Share / Publish above, with automatic cache invalidation for visitors.'}
              </p>

              <div className="border-t border-white/[0.08] pt-4 space-y-3">
                <p className="text-xs font-semibold text-[#F5F5F0]/80">
                  {lang === 'ar'
                    ? 'روابط مباشرة للأفلام (للستوري والبايو):'
                    : 'Direct Film Links (for Stories):'}
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {films
                    .filter((f) => f.isVisible && f.videoUrl)
                    .map((f) => {
                      const directUrl = `${sharedBaseUrl}/?film=${encodeURIComponent(f.id)}`;
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#050505] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#F5F5F0] truncate">
                              {f.titleAr}
                            </p>
                            <p dir="ltr" className="font-cinema-mono text-[10px] text-[#F5F5F0]/45 truncate">
                              /?film={f.id}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyText(f.id, directUrl)}
                            className="flex h-7 items-center gap-1 rounded border border-white/15 px-2.5 text-[11px] text-[#F5F5F0]/80 hover:border-[#D4AF37] hover:text-[#D4AF37] shrink-0 cursor-pointer"
                          >
                            {copiedUrlKey === f.id ? (
                              <Check className="h-3 w-3 text-[#D4AF37]" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>{copiedUrlKey === f.id ? '✓' : lang === 'ar' ? 'نسخ' : 'Copy'}</span>
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: AZ TECH CENTER (ADMIN INSTANT MAINTENANCE & LINK ENGINE) */}
      {activeTab === 'az_tech' && (
        <AzTechCenterPanel
          films={films}
          siteSettings={siteSettings}
          sharedBaseUrl={sharedBaseUrl}
          lang={lang}
        />
      )}

      {/* TAB 3: AZ FILMS ANALYTICS */}
      {activeTab === 'analytics' && <AdminAnalyticsPanel films={films} lang={lang} />}

      {/* TAB 3: USERS & ROLES */}
      {activeTab === 'users' && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] overflow-hidden">
          <div className="border-b border-white/[0.08] px-5 py-4">
            <h2 className="text-sm font-semibold text-[#F5F5F0]">
              {lang === 'ar' ? 'الحسابات والصلاحيات (ADMIN / VIEWER)' : 'Platform Accounts & Roles'}
            </h2>
          </div>
          {usersLoading ? (
            <div className="p-8 text-center text-xs text-[#F5F5F0]/55">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-xs text-[#F5F5F0]/50">
                    <th className="px-4 py-3 text-start font-medium">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                    <th className="px-4 py-3 text-start font-medium">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</th>
                    <th className="px-4 py-3 text-start font-medium">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                    <th className="px-4 py-3 text-end font-medium">{lang === 'ar' ? 'تغيير الصلاحية' : 'Manage'}</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u) => (
                    <tr key={u.uid} className="border-b border-white/[0.04]">
                      <td className="px-4 py-3 font-medium text-[#F5F5F0]">{u.displayName}</td>
                      <td className="px-4 py-3 font-cinema-mono text-xs text-[#F5F5F0]/65">{u.email}</td>
                      <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                        <span className={u.role === 'admin' ? 'text-[#D4AF37]' : 'text-[#F5F5F0]/65'}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        {u.email.toLowerCase() !== 'az1606276@gmail.com' ? (
                          <button
                            type="button"
                            onClick={() => handleRoleToggle(u)}
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#F5F5F0] hover:border-[#D4AF37] hover:text-[#D4AF37] cursor-pointer"
                          >
                            {u.role === 'admin'
                              ? lang === 'ar'
                                ? 'تحويل إلى VIEWER'
                                : 'Set VIEWER'
                              : lang === 'ar'
                              ? 'ترقية إلى ADMIN'
                              : 'Promote ADMIN'}
                          </button>
                        ) : (
                          <span className="text-xs text-[#D4AF37]">Owner</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FILM EDITOR MODAL */}
      {editingFilm && (
        <div
          onClick={() => setEditingFilm(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleSaveFilm}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0B0B0E] p-6 sm:p-8 space-y-6"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <h2 className="text-lg font-bold text-[#F5F5F0]">
                {isNewFilm ? t(lang, 'addNewFilm') : t(lang, 'editFilm')}
              </h2>
              <button
                type="button"
                onClick={() => setEditingFilm(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-[#F5F5F0]/75 hover:text-[#D4AF37] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                {formError}
              </div>
            )}

            {/* Core Titles & Identifiers */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={lang === 'ar' ? 'اسم الفيلم (بالعربية)' : 'Arabic Title'}>
                <input
                  type="text"
                  required
                  value={editingFilm.titleAr}
                  onChange={(e) => setEditingFilm({ ...editingFilm, titleAr: e.target.value })}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label={lang === 'ar' ? 'اسم الفيلم (بالإنجليزية)' : 'English Title'}>
                <input
                  type="text"
                  required
                  value={editingFilm.titleEn}
                  onChange={(e) => setEditingFilm({ ...editingFilm, titleEn: e.target.value })}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label={t(lang, 'releaseYear')}>
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  value={editingFilm.year}
                  onChange={(e) => setEditingFilm({ ...editingFilm, year: Number(e.target.value) })}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label={t(lang, 'releaseDateLabel')}>
                <input
                  type="text"
                  placeholder="2026-12-01"
                  value={editingFilm.releaseDate || ''}
                  onChange={(e) => setEditingFilm({ ...editingFilm, releaseDate: e.target.value })}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label={t(lang, 'genreLabel')}>
                <select
                  value={editingFilm.genre}
                  onChange={(e) =>
                    setEditingFilm({ ...editingFilm, genre: e.target.value as FilmGenre })
                  }
                  className={INPUT_CLS}
                >
                  {(Object.keys(GENRE_LABELS) as FilmGenre[]).map((g) => (
                    <option key={g} value={g}>
                      {GENRE_LABELS[g][lang]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t(lang, 'statusLabel')}>
                <select
                  value={editingFilm.status}
                  onChange={(e) =>
                    setEditingFilm({ ...editingFilm, status: e.target.value as FilmStatus })
                  }
                  className={INPUT_CLS}
                >
                  {(Object.keys(STATUS_LABELS) as FilmStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s][lang]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t(lang, 'durationLabel')}>
                <input
                  type="text"
                  placeholder="01:45:00"
                  value={editingFilm.duration || ''}
                  onChange={(e) => setEditingFilm({ ...editingFilm, duration: e.target.value })}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label={lang === 'ar' ? 'ترتيب العرض' : 'Sort Order'}>
                <input
                  type="number"
                  min={0}
                  value={editingFilm.sortOrder}
                  onChange={(e) =>
                    setEditingFilm({ ...editingFilm, sortOrder: Number(e.target.value) })
                  }
                  className={INPUT_CLS}
                />
              </Field>
            </div>

            {/* Flags */}
            <div className="flex flex-wrap gap-6 rounded-xl border border-white/[0.08] bg-[#050505] p-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingFilm.isOriginal}
                  onChange={(e) => setEditingFilm({ ...editingFilm, isOriginal: e.target.checked })}
                  className="accent-[#D4AF37]"
                />
                <span>AZ ORIGINALS</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingFilm.isFeatured}
                  onChange={(e) => setEditingFilm({ ...editingFilm, isFeatured: e.target.checked })}
                  className="accent-[#D4AF37]"
                />
                <span>{t(lang, 'featuredInHero')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingFilm.isVisible}
                  onChange={(e) => setEditingFilm({ ...editingFilm, isVisible: e.target.checked })}
                  className="accent-[#D4AF37]"
                />
                <span>{t(lang, 'visibleLabel')}</span>
              </label>
            </div>

            {/* Synopses & Credits */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={lang === 'ar' ? 'القصة (بالعربية)' : 'Arabic Synopsis'}>
                <textarea
                  rows={4}
                  value={editingFilm.synopsisAr || ''}
                  onChange={(e) => setEditingFilm({ ...editingFilm, synopsisAr: e.target.value })}
                  className={INPUT_CLS + ' h-auto py-2.5'}
                />
              </Field>
              <Field label={lang === 'ar' ? 'القصة (بالإنجليزية)' : 'English Synopsis'}>
                <textarea
                  rows={4}
                  value={editingFilm.synopsisEn || ''}
                  onChange={(e) => setEditingFilm({ ...editingFilm, synopsisEn: e.target.value })}
                  className={INPUT_CLS + ' h-auto py-2.5'}
                />
              </Field>
              <Field label={t(lang, 'directorLabel')}>
                <input
                  type="text"
                  value={editingFilm.director || ''}
                  onChange={(e) => setEditingFilm({ ...editingFilm, director: e.target.value })}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label={t(lang, 'producersLabel')}>
                <input
                  type="text"
                  value={editingFilm.producers || ''}
                  onChange={(e) => setEditingFilm({ ...editingFilm, producers: e.target.value })}
                  className={INPUT_CLS}
                />
              </Field>
            </div>

            {/* Media Assets: Direct Upload OR URL */}
            <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#050505] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-wider text-[#D4AF37]">
                  {lang === 'ar' ? 'ملفات الوسائط والبوستر والفيديو' : 'MEDIA ASSETS & STREAMING FILES'}
                </h3>
                {uploadProgress && (
                  <span className="font-cinema-mono text-xs text-[#D4AF37]">
                    {lang === 'ar' ? 'جاري الرفع:' : 'Uploading'} {uploadProgress.pct}%
                  </span>
                )}
              </div>

              {mediaNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 p-3 text-xs text-[#D4AF37]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{mediaNotice}</span>
                </div>
              )}

              {formError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MediaField
                  label={lang === 'ar' ? 'البوستر الرسمي (صورة)' : 'Official Poster (Image)'}
                  uploadLabel={lang === 'ar' ? 'رفع صورة' : 'Upload'}
                  value={editingFilm.posterUrl || ''}
                  accept="image/*"
                  isImage
                  onChangeUrl={(v) => setEditingFilm({ ...editingFilm, posterUrl: v })}
                  onUpload={(f) =>
                    handleFileUpload(f, 'posters', (url) =>
                      setEditingFilm((prev) => (prev ? { ...prev, posterUrl: url } : prev))
                    )
                  }
                />
                <MediaField
                  label={lang === 'ar' ? 'صورة الخلفية السينمائية' : 'Widescreen Backdrop (Image)'}
                  uploadLabel={lang === 'ar' ? 'رفع صورة' : 'Upload'}
                  value={editingFilm.backdropUrl || ''}
                  accept="image/*"
                  isImage
                  onChangeUrl={(v) => setEditingFilm({ ...editingFilm, backdropUrl: v })}
                  onUpload={(f) =>
                    handleFileUpload(f, 'backdrops', (url) =>
                      setEditingFilm((prev) => (prev ? { ...prev, backdropUrl: url } : prev))
                    )
                  }
                />
                <MediaField
                  label={lang === 'ar' ? 'التريلر الرسمي (فيديو MP4/WebM)' : 'Official Trailer (MP4/WebM or URL)'}
                  uploadLabel={lang === 'ar' ? 'رفع فيديو' : 'Upload'}
                  value={editingFilm.trailerUrl || ''}
                  accept="video/*"
                  onChangeUrl={(v) => setEditingFilm({ ...editingFilm, trailerUrl: v })}
                  onUpload={(f) =>
                    handleFileUpload(f, 'trailers', (url) =>
                      setEditingFilm((prev) => (prev ? { ...prev, trailerUrl: url } : prev))
                    )
                  }
                />
                <MediaField
                  label={lang === 'ar' ? 'ملف الفيلم الكامل (MP4/HLS أو رابط)' : 'Full Film Master (MP4/HLS or URL)'}
                  uploadLabel={lang === 'ar' ? 'رفع فيديو' : 'Upload'}
                  value={editingFilm.videoUrl || ''}
                  accept="video/*"
                  onChangeUrl={(v) => setEditingFilm({ ...editingFilm, videoUrl: v })}
                  onUpload={(f) =>
                    handleFileUpload(f, 'videos', (url) =>
                      setEditingFilm((prev) => (prev ? { ...prev, videoUrl: url } : prev))
                    )
                  }
                />
              </div>

              {(editingFilm.videoUrl?.startsWith('/uploads/') ||
                editingFilm.trailerUrl?.startsWith('/uploads/')) && (
                <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
                  {lang === 'ar'
                    ? 'تنبيه مهم: الفيديو المرفوع من الجهاز يُخزّن مؤقتًا على هذا الرابط فقط. ليشتغل الفيلم تلقائيًا على الجوال ورابط المشاركة للجميع، ارفعه على Google Drive (متاح لمن لديه الرابط) والصق رابطه هنا.'
                    : 'Note: Videos uploaded from your device are stored temporarily on this host only. To play across the Shared link and all mobile phones, paste a Google Drive or cloud MP4/HLS link.'}
                </p>
              )}

              {/* Film Stills Upload */}
              <div className="space-y-2 border-t border-white/[0.06] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#F5F5F0]/75">{t(lang, 'stillsLabel')}</span>
                  <label className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-xs text-[#F5F5F0] hover:border-[#D4AF37] cursor-pointer">
                    <Upload className="h-3.5 w-3.5 text-[#D4AF37]" />
                    <span>{lang === 'ar' ? 'رفع صورة من الفيلم' : 'Upload Still'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) {
                          handleFileUpload(file, 'stills', (url) =>
                            setEditingFilm((prev) =>
                              prev ? { ...prev, stillUrls: [...(prev.stillUrls || []), url] } : prev
                            )
                          );
                        }
                      }}
                    />
                  </label>
                </div>
                {editingFilm.stillUrls && editingFilm.stillUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {editingFilm.stillUrls.map((sUrl, sIdx) => (
                      <div key={sIdx} className="relative h-14 w-24 overflow-hidden rounded border border-white/15">
                        <img src={sUrl} alt="Still" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setEditingFilm({
                              ...editingFilm,
                              stillUrls: editingFilm.stillUrls?.filter((_, i) => i !== sIdx),
                            })
                          }
                          className="absolute right-0.5 top-0.5 rounded bg-black/80 p-0.5 text-white cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Multi-Quality Streams */}
              <div className="space-y-2 border-t border-white/[0.06] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#F5F5F0]/75">
                    {lang === 'ar' ? 'نسخ جودات إضافية (اختياري)' : 'Additional Quality Streams (Optional)'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingFilm({
                        ...editingFilm,
                        videoQualities: [
                          ...(editingFilm.videoQualities || []),
                          { label: '4K UHD (2160p)', url: '' },
                        ],
                      })
                    }
                    className="text-xs text-[#D4AF37] hover:underline cursor-pointer"
                  >
                    + {lang === 'ar' ? 'إضافة جودة' : 'Add Quality'}
                  </button>
                </div>
                {(editingFilm.videoQualities || []).map((q: VideoQuality, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="4K UHD (2160p)"
                      value={q.label}
                      onChange={(e) => {
                        const copy = [...(editingFilm.videoQualities || [])];
                        copy[idx] = { ...copy[idx], label: e.target.value };
                        setEditingFilm({ ...editingFilm, videoQualities: copy });
                      }}
                      className={INPUT_CLS + ' w-28'}
                    />
                    <input
                      type="text"
                      placeholder="https://... or /uploads/videos/..."
                      value={q.url}
                      onChange={(e) => {
                        const copy = [...(editingFilm.videoQualities || [])];
                        copy[idx] = { ...copy[idx], url: e.target.value };
                        setEditingFilm({ ...editingFilm, videoQualities: copy });
                      }}
                      className={INPUT_CLS + ' flex-1'}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditingFilm({
                          ...editingFilm,
                          videoQualities: editingFilm.videoQualities?.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-2 text-[#F5F5F0]/60 hover:text-red-400 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Cast Builder */}
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#050505] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#D4AF37]">{t(lang, 'castLabel')}</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditingFilm({
                      ...editingFilm,
                      cast: [...(editingFilm.cast || []), { name: '', role: '' }],
                    })
                  }
                  className="text-xs text-[#D4AF37] hover:underline cursor-pointer"
                >
                  + {lang === 'ar' ? 'إضافة عضو' : 'Add Cast Member'}
                </button>
              </div>
              {(editingFilm.cast || []).map((c: CastMember, idx: number) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={lang === 'ar' ? 'الاسم' : 'Name'}
                    value={c.name}
                    onChange={(e) => {
                      const next = [...(editingFilm.cast || [])];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setEditingFilm({ ...editingFilm, cast: next });
                    }}
                    className={INPUT_CLS + ' flex-1'}
                  />
                  <input
                    type="text"
                    placeholder={lang === 'ar' ? 'الدور / المهمة' : 'Role'}
                    value={c.role}
                    onChange={(e) => {
                      const next = [...(editingFilm.cast || [])];
                      next[idx] = { ...next[idx], role: e.target.value };
                      setEditingFilm({ ...editingFilm, cast: next });
                    }}
                    className={INPUT_CLS + ' flex-1'}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditingFilm({
                        ...editingFilm,
                        cast: editingFilm.cast?.filter((_, i) => i !== idx),
                      })
                    }
                    className="p-2 text-[#F5F5F0]/60 hover:text-red-400 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
              <button
                type="button"
                onClick={() => setEditingFilm(null)}
                className="h-10 rounded-lg border border-white/15 px-5 text-xs font-medium text-[#F5F5F0] hover:border-white/30 cursor-pointer"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="submit"
                disabled={saving || Boolean(uploadProgress)}
                className="h-10 rounded-lg bg-[#D4AF37] px-6 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] disabled:opacity-50 cursor-pointer"
              >
                {saving ? '...' : t(lang, 'saveFilm')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const INPUT_CLS =
  'h-10 w-full rounded-lg border border-white/15 bg-[#050505] px-3 text-xs text-[#F5F5F0] placeholder:text-[#F5F5F0]/35 focus:border-[#D4AF37] focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-[#F5F5F0]/70">{label}</span>
      {children}
    </label>
  );
}

function MediaField({
  label,
  uploadLabel,
  value,
  accept,
  isImage,
  onChangeUrl,
  onUpload,
}: {
  label: string;
  uploadLabel: string;
  value: string;
  accept: string;
  isImage?: boolean;
  onChangeUrl: (v: string) => void;
  onUpload: (f: File) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs text-[#F5F5F0]/70">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="https://... /uploads/..."
          value={value}
          onChange={(e) => onChangeUrl(e.target.value)}
          className={INPUT_CLS + ' flex-1'}
        />
        <label className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-[#121216] px-3 text-xs text-[#F5F5F0] hover:border-[#D4AF37] shrink-0 cursor-pointer">
          <Upload className="h-3.5 w-3.5 text-[#D4AF37]" />
          <span>{uploadLabel}</span>
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onUpload(f);
            }}
          />
        </label>
      </div>
      {isImage && value && (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#0B0B0E] p-2">
          <img
            src={value}
            alt={label}
            className="h-12 w-12 rounded object-cover border border-white/10"
          />
          <span className="text-[11px] text-[#D4AF37] truncate flex-1">
            {value.startsWith('data:') ? 'Image ready ✓' : value}
          </span>
          <button
            type="button"
            onClick={() => onChangeUrl('')}
            className="text-xs text-[#F5F5F0]/50 hover:text-red-400 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
