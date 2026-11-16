import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { AppLanguage } from '../types/cinema';

interface CountdownTimerProps {
  targetIso: string;
  titleAr?: string;
  titleEn?: string;
  lang: AppLanguage;
  variant?: 'banner' | 'centered';
}

interface TimeParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calcRemaining(targetMs: number): TimeParts | null {
  const diff = targetMs - Date.now();
  if (!isFinite(targetMs) || diff <= 0) return null;
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds };
}

export function CountdownTimer({
  targetIso,
  titleAr,
  titleEn,
  lang,
  variant = 'banner',
}: CountdownTimerProps) {
  const targetMs = targetIso ? new Date(targetIso).getTime() : NaN;
  const [parts, setParts] = useState<TimeParts | null>(() => calcRemaining(targetMs));

  useEffect(() => {
    setParts(calcRemaining(targetMs));
    if (!isFinite(targetMs)) return;
    const timer = window.setInterval(() => {
      setParts(calcRemaining(targetMs));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [targetMs]);

  if (!parts) return null;

  const heading =
    lang === 'ar'
      ? titleAr || 'العرض الأول للعمل القادم خلال'
      : titleEn || 'Next Premiere Arriving In';

  const boxes = [
    { value: parts.days, label: lang === 'ar' ? 'يوم' : 'DAYS' },
    { value: parts.hours, label: lang === 'ar' ? 'ساعة' : 'HRS' },
    { value: parts.minutes, label: lang === 'ar' ? 'دقيقة' : 'MIN' },
    { value: parts.seconds, label: lang === 'ar' ? 'ثانية' : 'SEC' },
  ];

  if (variant === 'centered') {
    return (
      <div className="mt-8 w-full max-w-md space-y-3">
        <div className="flex items-center justify-center gap-2 text-xs font-medium tracking-[0.14em] text-[#D4AF37]">
          <Clock className="h-3.5 w-3.5" />
          <span>{heading}</span>
        </div>
        <div className="grid grid-cols-4 gap-2.5" dir="ltr">
          {boxes.map((b) => (
            <div
              key={b.label}
              className="rounded-xl border border-[#D4AF37]/30 bg-[#0B0B0E]/90 py-3 px-2 text-center"
            >
              <div className="tabular-nums text-2xl font-bold text-[#F5F5F0]">
                {String(b.value).padStart(2, '0')}
              </div>
              <div className="mt-0.5 text-[10px] tracking-[0.14em] text-[#D4AF37]/80">
                {b.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-8">
      <div className="flex flex-col gap-4 rounded-xl border border-[#D4AF37]/25 bg-gradient-to-r from-[#0B0B0E] via-[#12100A] to-[#0B0B0E] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#D4AF37]">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] tracking-[0.16em] text-[#D4AF37]">PREMIERE COUNTDOWN</p>
            <h2 className="text-sm font-bold text-[#F5F5F0] sm:text-base">{heading}</h2>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:gap-3" dir="ltr">
          {boxes.map((b) => (
            <div
              key={b.label}
              className="min-w-[60px] rounded-lg border border-white/10 bg-[#050505] px-2.5 py-2 text-center"
            >
              <div className="tabular-nums text-lg font-bold text-[#D4AF37]">
                {String(b.value).padStart(2, '0')}
              </div>
              <div className="text-[9px] tracking-[0.14em] text-[#F5F5F0]/55">{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
