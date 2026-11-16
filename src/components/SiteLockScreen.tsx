import { Globe, Lock, RefreshCw, Wrench } from 'lucide-react';
import type { AppLanguage, SiteSettings, UserProfile } from '../types/cinema';
import { CountdownTimer } from './CountdownTimer';

interface SiteLockScreenProps {
  settings: SiteSettings;
  lang: AppLanguage;
  onToggleLang: () => void;
  user: UserProfile | null;
  onOwnerSignIn: () => void;
  onSignOut: () => void;
}

export function SiteLockScreen({
  settings,
  lang,
  onToggleLang,
  user,
  onOwnerSignIn,
  onSignOut,
}: SiteLockScreenProps) {
  const isMaintenance = settings.accessMode === 'maintenance';
  const title =
    lang === 'ar'
      ? settings.statusTitleAr
      : settings.statusTitleEn;
  const message =
    lang === 'ar'
      ? settings.statusMessageAr
      : settings.statusMessageEn;

  const cleanInstagramHref = (() => {
    const raw = settings.instagramUrl?.trim() || '';
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const handle = raw.replace(/^@/, '').replace(/\/+$/, '');
    return handle ? `https://instagram.com/${handle}` : '';
  })();

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#050505] text-[#F5F5F0] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(212,175,55,0.12),rgba(5,5,5,0.98)_65%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-6 sm:px-8">
        <span className="font-cinema-display text-2xl font-semibold tracking-[0.2em] text-[#F5F5F0]">
          AZ FILMS
        </span>
        <button
          type="button"
          onClick={onToggleLang}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-[#F5F5F0]/80 hover:border-[#D4AF37]/50 hover:text-[#F5F5F0] cursor-pointer"
        >
          <Globe className="h-3.5 w-3.5 text-[#D4AF37]" />
          <span>{lang === 'ar' ? 'EN' : 'AR'}</span>
        </button>
      </header>

      <main className="relative z-10 mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#D4AF37]">
          {isMaintenance ? <Wrench className="h-7 w-7" /> : <Lock className="h-7 w-7" />}
        </div>

        <p className="mb-3 text-xs font-medium tracking-[0.22em] text-[#D4AF37]">
          {isMaintenance
            ? lang === 'ar'
              ? 'صيانة وتحديث المنصة'
              : 'MAINTENANCE MODE'
            : lang === 'ar'
            ? 'الموقع مغلق مؤقتًا'
            : 'TEMPORARILY CLOSED'}
        </p>

        <h1 className="text-3xl font-bold leading-snug text-[#F5F5F0] sm:text-4xl text-balance">
          {title}
        </h1>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-[#F5F5F0]/75 sm:text-base">
          {message}
        </p>

        {settings.countdownEnabled && settings.countdownTargetIso && (
          <CountdownTimer
            targetIso={settings.countdownTargetIso}
            titleAr={settings.countdownTitleAr}
            titleEn={settings.countdownTitleEn}
            lang={lang}
            variant="centered"
          />
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {cleanInstagramHref && (
            <a
              href={cleanInstagramHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-6 text-xs font-semibold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/20"
            >
              <span>
                {lang === 'ar' ? 'تابع جديدنا عبر إنستغرام' : 'Follow Updates on Instagram'}
              </span>
            </a>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-5 text-xs font-semibold text-[#F5F5F0]/80 transition-colors hover:border-[#D4AF37]/50 hover:text-[#D4AF37] cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{lang === 'ar' ? 'تحديث للتحقق الآن' : 'Refresh Status'}</span>
          </button>
        </div>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] px-6 py-6 text-xs text-[#F5F5F0]/45 sm:px-8">
        <span className="tracking-[0.16em]">A PRIVATE WORLD OF CINEMA</span>
        <div className="flex items-center gap-4">
          {!user ? (
            <button
              type="button"
              onClick={onOwnerSignIn}
              className="text-[#F5F5F0]/35 hover:text-[#D4AF37] transition-colors cursor-pointer"
            >
              {lang === 'ar' ? 'دخول المالك' : 'Owner Sign In'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignOut}
              className="text-[#F5F5F0]/50 hover:text-[#D4AF37] transition-colors cursor-pointer"
            >
              {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </button>
          )}
          <span className="tabular-nums">© {new Date().getFullYear()} AZ FILMS</span>
        </div>
      </footer>
    </div>
  );
}
