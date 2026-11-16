import { AudioWaveform, Clapperboard, Maximize2 } from 'lucide-react';
import type { AppLanguage, Film } from '../types/cinema';
import type { CinemaAudioPreset } from '../services/cinemaAudioEngine';

export interface PlayerLaunchPreset {
  colorGrade?: 'original' | 'imax_70mm' | 'teal_orange' | 'noir_1941' | 'grain_35mm' | 'nordic_cold';
  aspectMode?: '16_9' | 'scope_239' | 'imax_full';
  audioPreset?: CinemaAudioPreset;
  theaterDim?: boolean;
}

interface StudioTechnologyStripProps {
  featuredFilm: Film | null;
  lang: AppLanguage;
  onLaunchWithPreset: (film: Film, preset: PlayerLaunchPreset) => void;
  onInspectFilm?: (film: Film) => void;
}

export function StudioTechnologyStrip({
  featuredFilm,
  lang,
  onLaunchWithPreset,
  onInspectFilm,
}: StudioTechnologyStripProps) {
  if (!featuredFilm) return null;

  const canPlay =
    featuredFilm.status === 'released' && Boolean(featuredFilm.videoUrl && featuredFilm.videoUrl.trim());

  const cards = [
    {
      id: 'soundstage',
      icon: AudioWaveform,
      title: lang === 'ar' ? 'مسرح الصوت IMAX' : 'IMAX Acoustic Mastering',
      desc:
        lang === 'ar'
          ? 'معالجة صوتية فورية داخل المشغل بأوضاع IMAX ووضوح الحوار والمسرح الليلي.'
          : 'Live in-browser multi-band cinema EQ with IMAX Sub-Harmonic, Dialogue Focus, and Midnight Theatre.',
      actionLabel: lang === 'ar' ? 'جرّب صوت IMAX' : 'Launch IMAX Audio',
      onClick: () =>
        canPlay
          ? onLaunchWithPreset(featuredFilm, { audioPreset: 'imax', theaterDim: true })
          : onInspectFilm?.(featuredFilm),
    },
    {
      id: 'scope',
      icon: Maximize2,
      title: lang === 'ar' ? 'عرض Panavision 2.39:1' : '2.39:1 Scope & Colorist',
      desc:
        lang === 'ar'
          ? 'ستائر عرض عريض 2.39:1 وستة تدرجات لونية سينمائية حية وإطفاء أنوار القاعة.'
          : 'Motorized 2.39:1 anamorphic framing, 6 studio color grades, and volumetric lights-off mode.',
      actionLabel: lang === 'ar' ? 'شغّل 2.39:1 الآن' : 'Watch in 2.39:1',
      onClick: () =>
        canPlay
          ? onLaunchWithPreset(featuredFilm, {
              aspectMode: 'scope_239',
              colorGrade: 'imax_70mm',
              theaterDim: true,
            })
          : onInspectFilm?.(featuredFilm),
    },
    {
      id: 'director',
      icon: Clapperboard,
      title: lang === 'ar' ? 'دراسة الكادر 24fps' : '24fps Frame Study',
      desc:
        lang === 'ar'
          ? 'تنقّل إطاراً بإطار، تكرار مشهد A–B، معاينة التمرير الحية، وحفظ اللقطة بدقة 4K 3840px.'
          : 'True 24fps frame stepping, A–B scene loop, live timeline frame preview, and 4K 3840px still export.',
      actionLabel: lang === 'ar' ? 'افتح قاعة المخرج' : 'Open Director Deck',
      onClick: () =>
        canPlay
          ? onLaunchWithPreset(featuredFilm, { colorGrade: 'teal_orange' })
          : onInspectFilm?.(featuredFilm),
    },
  ];

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-[#F5F5F0] sm:text-2xl">
            {lang === 'ar' ? 'تقنيات العرض الفائقة' : 'Signature Projection Suite'}
          </h2>
          <p className="text-xs text-[#F5F5F0]/55 sm:text-sm">
            {lang === 'ar'
              ? 'إعدادات عرض سينمائية متقدمة تعمل لحظياً على أحدث أفلام الاستوديو'
              : 'Real-time mastering controls engineered for private cinema screening'}
          </p>
        </div>
        <span className="text-xs tracking-[0.14em] text-[#D4AF37]/85">
          4K MASTER · 2.39:1 SCOPE · 24FPS
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="group flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#0B0B0E] p-6 transition-colors duration-200 hover:border-[#D4AF37]/45"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-[#D4AF37]">
                  <Icon className="h-5 w-5 shrink-0" />
                  <h3 className="text-base font-bold text-[#F5F5F0]">{card.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-[#F5F5F0]/70">{card.desc}</p>
              </div>
              <div className="pt-5">
                <button
                  type="button"
                  onClick={card.onClick}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 text-xs font-semibold text-[#D4AF37] transition-colors hover:bg-[#D4AF37] hover:text-[#050505] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>{card.actionLabel}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
