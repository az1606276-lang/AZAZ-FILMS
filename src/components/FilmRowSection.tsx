import { FilmPosterCard } from './FilmPosterCard';
import type { AppLanguage, Film } from '../types/cinema';

interface FilmRowSectionProps {
  title: string;
  subtitle?: string;
  films: Film[];
  lang: AppLanguage;
  onSelectFilm: (film: Film) => void;
  actionLabel?: string;
  onAction?: () => void;
}

export function FilmRowSection({
  title,
  subtitle,
  films,
  lang,
  onSelectFilm,
  actionLabel,
  onAction,
}: FilmRowSectionProps) {
  if (films.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8">
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-white/[0.06] pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#F5F5F0] sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-[#F5F5F0]/55 sm:text-sm">{subtitle}</p>}
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-medium text-[#D4AF37] hover:text-[#E6C65B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:gap-6">
        {films.map((film) => (
          <FilmPosterCard key={film.id} film={film} lang={lang} onSelect={onSelectFilm} />
        ))}
      </div>
    </section>
  );
}
