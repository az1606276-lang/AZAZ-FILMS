import { useState } from 'react';
import { Globe, LogOut, Menu, Search, Shield, X } from 'lucide-react';
import { t } from '../lib/i18n';
import type { AppLanguage, AppView, UserProfile } from '../types/cinema';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  lang: AppLanguage;
  onToggleLang: () => void;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  user: UserProfile | null;
  isAdmin: boolean;
  onSignOut: () => void;
}

export function TopBar({
  lang,
  onToggleLang,
  activeView,
  onNavigate,
  user,
  isAdmin,
  onSignOut,
}: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { view: AppView; label: string; adminOnly?: boolean }[] = [
    { view: 'home', label: t(lang, 'navHome') },
    { view: 'library', label: t(lang, 'navLibrary') },
    { view: 'originals', label: t(lang, 'navOriginals') },
    { view: 'coming_soon', label: t(lang, 'navComingSoon') },
    { view: 'my_list', label: t(lang, 'navMyList') },
    ...(isAdmin ? [{ view: 'admin' as AppView, label: t(lang, 'navAdmin'), adminOnly: true }] : []),
  ];

  const handleNav = (view: AppView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#050505]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="font-cinema-display text-2xl font-semibold tracking-[0.18em] text-[#F5F5F0] transition-colors hover:text-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer"
        >
          AZ FILMS
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeView === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => handleNav(item.view)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#D4AF37]'
                    : item.adminOnly
                    ? 'text-[#D4AF37]/80 hover:text-[#D4AF37]'
                    : 'text-[#F5F5F0]/75 hover:text-[#F5F5F0]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-[21px] h-[1.5px] bg-[#D4AF37]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Install, Search, Language & Account Action */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <PWAInstallButton lang={lang} />
          <button
            type="button"
            onClick={() => handleNav('search')}
            aria-label={t(lang, 'navSearch')}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
              activeView === 'search'
                ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]'
                : 'border-white/10 bg-white/[0.03] text-[#F5F5F0]/80 hover:border-white/25 hover:text-[#F5F5F0]'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleLang}
            aria-label="Toggle Language"
            className="hidden sm:flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-[#F5F5F0]/80 transition-colors hover:border-white/25 hover:text-[#F5F5F0] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="h-3.5 w-3.5 text-[#D4AF37]" />
            <span>{lang === 'ar' ? 'EN' : 'AR'}</span>
          </button>

          {user && (
            <div className="hidden sm:flex items-center gap-2.5">
              {isAdmin && activeView !== 'admin' && (
                <button
                  type="button"
                  onClick={() => handleNav('admin')}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 text-xs font-semibold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/20 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>{t(lang, 'navAdmin')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onSignOut}
                className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-[#F5F5F0] transition-colors hover:border-white/25 hover:bg-white/[0.08] whitespace-nowrap shrink-0 cursor-pointer"
                title={user.email}
              >
                <span className="max-w-[110px] truncate">{user.displayName}</span>
                <LogOut className="h-3.5 w-3.5 text-[#F5F5F0]/60" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Menu"
            className="flex lg:hidden h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#F5F5F0] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/[0.08] bg-[#0B0B0E] px-4 py-4">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = activeView === item.view;
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => handleNav(item.view)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#D4AF37]/15 text-[#D4AF37]'
                      : 'text-[#F5F5F0]/80 hover:bg-white/[0.04]'
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.08] pt-3">
              <button
                type="button"
                onClick={onToggleLang}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#F5F5F0]/80 cursor-pointer"
              >
                <Globe className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>{lang === 'ar' ? 'English (LTR)' : 'العربية (RTL)'}</span>
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    onSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#F5F5F0]/80 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{t(lang, 'signOut')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
