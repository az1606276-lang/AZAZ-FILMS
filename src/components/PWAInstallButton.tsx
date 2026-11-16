import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { AppLanguage } from '../types/cinema';

export function PWAInstallButton({ lang }: { lang: AppLanguage }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 text-xs font-medium text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/20 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label={lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-2.5 sm:px-3 text-xs font-medium text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/20 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{lang === 'ar' ? 'تثبيت' : 'Install'}</span>
        </button>

        {showIOSGuide && (
          <div
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-[#0B0B0E] p-6 text-start shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-[#D4AF37]">
                  {lang === 'ar' ? 'تثبيت AZ FILMS على الآيفون' : 'Install AZ FILMS on iPhone'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#F5F5F0]/70 hover:text-[#F5F5F0] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="space-y-3 text-sm leading-relaxed text-[#F5F5F0]/85">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/20 text-xs font-bold text-[#D4AF37]">
                    1
                  </span>
                  <span>
                    {lang === 'ar'
                      ? 'افتح الرابط في متصفح Safari، ثم اضغط على زر المشاركة (Share)'
                      : 'Open in Safari and tap the Share button'}
                    <Share className="inline mx-1.5 h-4 w-4 text-[#D4AF37]" />
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/20 text-xs font-bold text-[#D4AF37]">
                    2
                  </span>
                  <span>
                    {lang === 'ar'
                      ? 'مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).'
                      : 'Scroll down and tap "Add to Home Screen".'}
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="h-10 w-full rounded-lg bg-[#D4AF37] text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
              >
                {lang === 'ar' ? 'فهمت' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
