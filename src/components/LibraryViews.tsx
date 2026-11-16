import { useMemo, useState } from 'react';
import { Bookmark, LogIn, Search, Trash2 } from 'lucide-react';
import { GENRE_LABELS, t } from '../lib/i18n';
import type { AppLanguage, Film, UserProfile } from '../types/cinema';
import { FilmPosterCard } from './FilmPosterCard';
import originalsStageImage from '../assets/images/cinema_originals_stage_1794735693345.jpg';

type LibraryFilter =
  | 'all'
  | 'latest'
  | 'released'
  | 'coming_soon'
  | 'originals'
  | 'military'
  | 'historical'
  | 'drama'
  | 'action';

export function LibraryPage({
  films,
  lang,
  onSelectFilm,
}: {
  films: Film[];
  lang: AppLanguage;
  onSelectFilm: (film: Film) => void;
}) {
  const [filter, setFilter] = useState<LibraryFilter>('all');

  const tabs: { id: LibraryFilter; label: string }[] = [
    { id: 'all', label: t(lang, 'allFilms') },
    { id: 'latest', label: t(lang, 'latestReleases') },
    { id: 'released', label: t(lang, 'releasedFilms') },
    { id: 'coming_soon', label: t(lang, 'comingSoonSection') },
    { id: 'originals', label: t(lang, 'originalsSection') },
    { id: 'military', label: t(lang, 'militaryFilms') },
    { id: 'historical', label: t(lang, 'historicalFilms') },
    { id: 'drama', label: t(lang, 'dramaFilms') },
    { id: 'action', label: t(lang, 'actionThrillerFilms') },
  ];

  const filtered = useMemo(() => {
    switch (filter) {
      case 'latest':
        return [...films].sort((a, b) => b.year - a.year || a.sortOrder - b.sortOrder);
      case 'released':
        return films.filter((f) => f.status === 'released');
      case 'coming_soon':
        return films.filter((f) => f.status !== 'released');
      case 'originals':
        return films.filter((f) => f.isOriginal);
      case 'military':
        return films.filter((f) => f.genre === 'military');
      case 'historical':
        return films.filter((f) => f.genre === 'historical');
      case 'drama':
        return films.filter((f) => f.genre === 'drama');
      case 'action':
        return films.filter((f) => f.genre === 'action' || f.genre === 'thriller');
      default:
        return films;
    }
  }, [films, filter]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
      <div className="mb-8 space-y-2 border-b border-white/[0.08] pb-6">
        <p className="text-xs tracking-[0.2em] text-[#D4AF37]">AZ FILMS ARCHIVE</p>
        <h1 className="text-3xl font-bold text-[#F5F5F0] sm:text-4xl">{t(lang, 'navLibrary')}</h1>
      </div>

      {/* Interactive Filter Segmented Bar */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#D4AF37] text-[#050505] font-semibold'
                  : 'border border-white/10 bg-[#0B0B0E] text-[#F5F5F0]/75 hover:border-white/25 hover:text-[#F5F5F0]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-12 text-center text-sm text-[#F5F5F0]/55">
          {lang === 'ar' ? 'لا توجد أفلام ضمن هذا التصنيف حاليًا.' : 'No films currently listed under this category.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:gap-6">
          {filtered.map((film) => (
            <FilmPosterCard key={film.id} film={film} lang={lang} onSelect={onSelectFilm} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OriginalsPage({
  films,
  lang,
  onSelectFilm,
}: {
  films: Film[];
  lang: AppLanguage;
  onSelectFilm: (film: Film) => void;
}) {
  const originals = films.filter((f) => f.isOriginal);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/[0.08] bg-[#050505]">
        <img
          src={originalsStageImage}
          alt="AZ ORIGINALS Studio"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-[#050505]/40" />
        <div className="relative z-10 mx-auto max-w-[1440px] px-4 py-20 sm:px-8 lg:py-28">
          <div className="max-w-2xl space-y-4">
            <p className="font-cinema-display text-sm tracking-[0.26em] text-[#D4AF37]">
              AZ ORIGINALS
            </p>
            <h1 className="text-3xl font-bold text-[#F5F5F0] sm:text-5xl text-balance">
              {lang === 'ar' ? 'الإنتاجات السينمائية الأصلية' : 'Original Motion Pictures'}
            </h1>
            <p className="text-sm leading-relaxed text-[#F5F5F0]/75 sm:text-base">
              {lang === 'ar'
                ? 'أعمال سينمائية أصلية منتجة ومملوكة حصريًا لعالم AZ FILMS برؤية إخراجية مستقلة وهوية بصرية خاصة.'
                : 'Signature motion pictures produced exclusively within the AZ FILMS studio with independent creative direction.'}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:gap-6">
          {originals.map((film) => (
            <FilmPosterCard key={film.id} film={film} lang={lang} onSelect={onSelectFilm} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ComingSoonPage({
  films,
  lang,
  onSelectFilm,
}: {
  films: Film[];
  lang: AppLanguage;
  onSelectFilm: (film: Film) => void;
}) {
  const upcoming = films.filter((f) => f.status !== 'released');

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
      <div className="mb-10 space-y-2 border-b border-white/[0.08] pb-6">
        <p className="text-xs tracking-[0.2em] text-[#D4AF37]">UPCOMING RELEASES</p>
        <h1 className="text-3xl font-bold text-[#F5F5F0] sm:text-4xl">
          {t(lang, 'comingSoonSection')}
        </h1>
      </div>

      {upcoming.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-12 text-center text-sm text-[#F5F5F0]/55">
          {lang === 'ar' ? 'لا توجد أعمال قادمة مجدولة حاليًا.' : 'No upcoming releases scheduled at this time.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {upcoming.map((film) => {
            const primaryTitle = lang === 'ar' ? film.titleAr : film.titleEn;
            const secondaryTitle =
              film.titleAr !== film.titleEn ? (lang === 'ar' ? film.titleEn : film.titleAr) : '';
            const synopsis =
              lang === 'ar'
                ? film.synopsisAr || film.synopsisEn || ''
                : film.synopsisEn || film.synopsisAr || '';
            const genreLabel = GENRE_LABELS[film.genre]?.[lang] || film.genre;

            return (
              <div
                key={film.id}
                className="flex flex-col sm:flex-row gap-6 rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-5 transition-colors hover:border-[#D4AF37]/35"
              >
                <div className="w-full sm:w-44 shrink-0">
                  <FilmPosterCard film={film} lang={lang} onSelect={onSelectFilm} />
                </div>
                <div className="flex flex-1 flex-col justify-between gap-4 py-1">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#D4AF37]">
                      <span>{t(lang, 'comingSoonSection')}</span>
                      {film.releaseDate && (
                        <>
                          <span aria-hidden="true" className="text-[#F5F5F0]/30">·</span>
                          <span className="tabular-nums text-[#F5F5F0]/75">{film.releaseDate}</span>
                        </>
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-[#F5F5F0]">{primaryTitle}</h2>
                      {secondaryTitle && (
                        <p className="font-cinema-display text-sm tracking-[0.14em] text-[#D4AF37]/85 mt-0.5">
                          {secondaryTitle}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-[#F5F5F0]/55">
                      {genreLabel} · <span className="tabular-nums">{film.year}</span>
                    </p>
                    {synopsis && (
                      <p className="text-sm leading-relaxed text-[#F5F5F0]/75 line-clamp-3">
                        {synopsis}
                      </p>
                    )}
                  </div>

                  {/* Strictly NO Watch Film button on unreleased works */}
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
                    <span className="text-xs text-[#F5F5F0]/45">{t(lang, 'comingSoonNotice')}</span>
                    <button
                      type="button"
                      onClick={() => onSelectFilm(film)}
                      className="text-xs font-semibold text-[#D4AF37] hover:text-[#E6C65B] cursor-pointer"
                    >
                      {t(lang, 'viewDetails')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SearchPage({
  films,
  lang,
  onSelectFilm,
}: {
  films: Film[];
  lang: AppLanguage;
  onSelectFilm: (film: Film) => void;
}) {
  const [queryText, setQueryText] = useState('');

  const results = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return films;
    return films.filter((f) => {
      const genreAr = GENRE_LABELS[f.genre]?.ar.toLowerCase() || '';
      const genreEn = GENRE_LABELS[f.genre]?.en.toLowerCase() || '';
      return (
        f.titleAr.toLowerCase().includes(q) ||
        f.titleEn.toLowerCase().includes(q) ||
        String(f.year).includes(q) ||
        genreAr.includes(q) ||
        genreEn.includes(q) ||
        f.genre.toLowerCase().includes(q)
      );
    });
  }, [films, queryText]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-2xl mb-12 space-y-4">
        <h1 className="text-2xl font-bold text-[#F5F5F0] sm:text-3xl text-center">
          {t(lang, 'navSearch')}
        </h1>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-4 h-5 w-5 text-[#D4AF37]" />
          <input
            type="search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder={t(lang, 'searchPlaceholder')}
            autoFocus
            className="h-14 w-full rounded-xl border border-white/15 bg-[#0B0B0E] ps-12 pe-4 text-sm text-[#F5F5F0] placeholder:text-[#F5F5F0]/40 focus:border-[#D4AF37] focus:outline-none"
          />
        </div>
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-12 text-center text-sm text-[#F5F5F0]/55">
          {t(lang, 'searchNoResults')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:gap-6">
          {results.map((film) => (
            <FilmPosterCard key={film.id} film={film} lang={lang} onSelect={onSelectFilm} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MyListPage({
  films,
  watchlistIds,
  user,
  lang,
  onSelectFilm,
  onRemoveFromList,
  onSignIn,
}: {
  films: Film[];
  watchlistIds: string[];
  user: UserProfile | null;
  lang: AppLanguage;
  onSelectFilm: (film: Film) => void;
  onRemoveFromList: (film: Film) => void;
  onSignIn: () => void;
}) {
  const savedFilms = films.filter((f) => watchlistIds.includes(f.id));

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
      <div className="mb-8 space-y-2 border-b border-white/[0.08] pb-6">
        <p className="text-xs tracking-[0.2em] text-[#D4AF37]">PERSONAL COLLECTION</p>
        <h1 className="text-3xl font-bold text-[#F5F5F0] sm:text-4xl">{t(lang, 'navMyList')}</h1>
      </div>

      {!user ? (
        <div className="mx-auto max-w-lg rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-10 text-center space-y-5">
          <Bookmark className="mx-auto h-8 w-8 text-[#D4AF37]" />
          <p className="text-sm leading-relaxed text-[#F5F5F0]/75">{t(lang, 'myListSignInPrompt')}</p>
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#D4AF37] px-6 text-sm font-semibold text-[#050505] hover:bg-[#E6C65B] cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            <span>{t(lang, 'signIn')}</span>
          </button>
        </div>
      ) : savedFilms.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-12 text-center text-sm text-[#F5F5F0]/55">
          {t(lang, 'myListEmpty')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:gap-6">
          {savedFilms.map((film) => (
            <div key={film.id} className="flex flex-col gap-2">
              <FilmPosterCard film={film} lang={lang} onSelect={onSelectFilm} />
              <button
                type="button"
                onClick={() => onRemoveFromList(film)}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#0B0B0E] text-xs text-[#F5F5F0]/65 hover:border-red-500/40 hover:text-red-400 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{lang === 'ar' ? 'إزالة من القائمة' : 'Remove'}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
