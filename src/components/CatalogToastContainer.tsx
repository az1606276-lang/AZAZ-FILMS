import { Film as FilmIcon, Sparkles, X } from 'lucide-react';
import type { AppLanguage, Film } from '../types/cinema';

export interface CatalogToastItem {
  id: string;
  type: 'added' | 'released';
  film: Film;
}

interface CatalogToastContainerProps {
  toasts: CatalogToastItem[];
  lang: AppLanguage;
  onDismiss: (id: string) => void;
  onSelectFilm: (film: Film) => void;
}

export function CatalogToastContainer({
  toasts,
  lang,
  onDismiss,
  onSelectFilm,
}: CatalogToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-5 end-5 z-50 flex w-[calc(100vw-2.5rem)] max-w-sm flex-col gap-2.5"
    >
      {toasts.map((item) => {
        const title =
          lang === 'ar'
            ? item.film.titleAr || item.film.titleEn
            : item.film.titleEn || item.film.titleAr;
        const badgeLabel =
          item.type === 'released'
            ? lang === 'ar'
              ? 'متاح للمشاهدة الآن'
              : 'Now Released'
            : lang === 'ar'
              ? 'إضافة جديدة للكتالوج'
              : 'Added to Catalog';
        const actionLabel = lang === 'ar' ? 'عرض الفيلم' : 'View Film';

        return (
          <div
            key={item.id}
            role="status"
            className="flex items-start gap-3 rounded-xl border border-[#D4AF37]/45 bg-[#121216]/95 p-3.5 text-[#F5F5F0] shadow-2xl backdrop-blur-md transition-all duration-300"
          >
            {item.film.posterUrl ? (
              <img
                src={item.film.posterUrl}
                alt={title}
                referrerPolicy="no-referrer"
                className="h-12 w-9 shrink-0 rounded border border-white/10 object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]">
                {item.type === 'released' ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <FilmIcon className="h-4 w-4" />
                )}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#D4AF37]">
                {item.type === 'released' ? (
                  <Sparkles className="h-3 w-3 shrink-0" />
                ) : (
                  <FilmIcon className="h-3 w-3 shrink-0" />
                )}
                <span>{badgeLabel}</span>
              </div>
              <p className="truncate text-sm font-semibold text-[#F5F5F0]">{title}</p>
              <button
                type="button"
                onClick={() => {
                  onSelectFilm(item.film);
                  onDismiss(item.id);
                }}
                className="inline-flex items-center text-xs font-medium text-[#D4AF37] hover:text-[#E6C65B] hover:underline cursor-pointer"
              >
                {actionLabel}
              </button>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label={lang === 'ar' ? 'إغلاق الإشعار' : 'Dismiss notification'}
              className="shrink-0 rounded-md p-1 text-[#F5F5F0]/50 hover:bg-white/[0.06] hover:text-[#F5F5F0] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
