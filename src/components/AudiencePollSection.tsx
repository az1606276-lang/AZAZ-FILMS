import { useEffect, useState } from 'react';
import { Check, Vote } from 'lucide-react';
import { submitPollVote, subscribePollResults } from '../services/pollService';
import type { AppLanguage, PollOption, PollSummary, SiteSettings } from '../types/cinema';

interface AudiencePollSectionProps {
  settings: SiteSettings;
  lang: AppLanguage;
}

export function AudiencePollSection({ settings, lang }: AudiencePollSectionProps) {
  const pollId = settings.pollId || 'poll-v1';
  const [summary, setSummary] = useState<PollSummary>({
    countA: 0,
    countB: 0,
    userChoice: null,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = subscribePollResults(pollId, setSummary);
    return () => unsub();
  }, [pollId]);

  if (!settings.pollEnabled) return null;

  const question =
    lang === 'ar'
      ? settings.pollQuestionAr || settings.pollQuestionEn
      : settings.pollQuestionEn || settings.pollQuestionAr;
  const labelA =
    lang === 'ar'
      ? settings.pollOptionAAr || settings.pollOptionAEn
      : settings.pollOptionAEn || settings.pollOptionAAr;
  const labelB =
    lang === 'ar'
      ? settings.pollOptionBAr || settings.pollOptionBEn
      : settings.pollOptionBEn || settings.pollOptionBAr;

  if (!question || !labelA || !labelB) return null;

  const totalVotes = summary.countA + summary.countB;
  const pctA = totalVotes > 0 ? Math.round((summary.countA / totalVotes) * 100) : 0;
  const pctB = totalVotes > 0 ? 100 - pctA : 0;
  const hasVoted = summary.userChoice !== null;

  const handleVote = async (option: PollOption) => {
    if (hasVoted || submitting) return;
    setSubmitting(true);
    setSummary((prev) => ({
      countA: prev.countA + (option === 'A' ? 1 : 0),
      countB: prev.countB + (option === 'B' ? 1 : 0),
      userChoice: option,
    }));
    await submitPollVote(pollId, option);
    setSubmitting(false);
  };

  const options: { key: PollOption; label: string; count: number; pct: number }[] = [
    { key: 'A', label: labelA, count: summary.countA, pct: pctA },
    { key: 'B', label: labelB, count: summary.countB, pct: pctB },
  ];

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
      <div className="rounded-2xl border border-[#D4AF37]/25 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.08),rgba(11,11,14,0.98)_70%)] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#D4AF37]">
              <Vote className="h-4 w-4" />
              <span>
                {lang === 'ar' ? 'تصويت الجمهور للمشروع القادم' : 'AUDIENCE GREENLIGHT POLL'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#F5F5F0] sm:text-2xl">{question}</h2>
          </div>

          <span className="text-xs tabular-nums text-[#F5F5F0]/55">
            {totalVotes}{' '}
            {lang === 'ar' ? (totalVotes === 1 ? 'صوت' : 'أصوات') : totalVotes === 1 ? 'vote' : 'votes'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {options.map((opt) => {
            const isSelected = summary.userChoice === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={hasVoted || submitting}
                onClick={() => handleVote(opt.key)}
                className={`group relative overflow-hidden rounded-xl border p-4 text-start transition-all duration-300 ${
                  isSelected
                    ? 'border-[#D4AF37] bg-[#14120B]'
                    : hasVoted
                      ? 'border-white/10 bg-[#050505]/70'
                      : 'border-white/15 bg-[#050505] hover:border-[#D4AF37]/60 cursor-pointer'
                }`}
              >
                {hasVoted && (
                  <div
                    className={`pointer-events-none absolute inset-y-0 start-0 transition-all duration-700 ${
                      isSelected ? 'bg-[#D4AF37]/20' : 'bg-white/[0.05]'
                    }`}
                    style={{ width: `${opt.pct}%` }}
                  />
                )}

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                        isSelected
                          ? 'border-[#D4AF37] bg-[#D4AF37] text-[#050505]'
                          : 'border-white/20 text-[#F5F5F0]/75 group-hover:border-[#D4AF37]/60 group-hover:text-[#D4AF37]'
                      }`}
                    >
                      {isSelected ? <Check className="h-4 w-4" /> : opt.key}
                    </span>
                    <span className="text-sm font-semibold text-[#F5F5F0] sm:text-base">
                      {opt.label}
                    </span>
                  </div>

                  {hasVoted ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[#D4AF37]">
                      {opt.pct}%
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-[#D4AF37]/80 opacity-0 group-hover:opacity-100 transition-opacity">
                      {lang === 'ar' ? 'صوّت' : 'Vote'}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {hasVoted && (
          <p className="text-xs text-[#D4AF37]/85">
            {lang === 'ar'
              ? 'شكراً لمشاركتك! تم تسجيل صوتك في استوديو AZ FILMS.'
              : 'Thank you! Your vote has been recorded by AZ FILMS Studio.'}
          </p>
        )}
      </div>
    </section>
  );
}
