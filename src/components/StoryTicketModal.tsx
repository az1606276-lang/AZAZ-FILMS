import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Share2, Sparkles, X } from 'lucide-react';
import { GENRE_LABELS } from '../lib/i18n';
import type { AppLanguage, Film } from '../types/cinema';

interface StoryTicketModalProps {
  film: Film;
  lang: AppLanguage;
  onClose: () => void;
}

const CANVAS_W = 1080;
const CANVAS_H = 1920;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2
): number {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  let y = startY;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lineHeight;
  }
  return y;
}

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src || !src.trim()) {
      resolve(null);
      return;
    }
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function StoryTicketModal({ film, lang, onClose }: StoryTicketModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [customNote, setCustomNote] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [rendering, setRendering] = useState(true);
  const [sharing, setSharing] = useState(false);

  const renderTicket = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setRendering(true);

    // 1. Deep Obsidian Cinema Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const radial = ctx.createRadialGradient(540, 620, 80, 540, 620, 920);
    radial.addColorStop(0, 'rgba(212, 175, 55, 0.18)');
    radial.addColorStop(0.55, 'rgba(212, 175, 55, 0.05)');
    radial.addColorStop(1, 'rgba(5, 5, 5, 1)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. Luxury Cinema Ticket Outer Card
    const cardX = 88;
    const cardY = 120;
    const cardW = CANVAS_W - cardX * 2;
    const cardH = CANVAS_H - cardY * 2;

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 36);
    ctx.fillStyle = '#0B0B0E';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
    ctx.stroke();
    ctx.restore();

    // Inner hairline frame
    ctx.save();
    drawRoundedRect(ctx, cardX + 20, cardY + 20, cardW - 40, cardH - 40, 26);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.stroke();
    ctx.restore();

    // Ticket notches (left & right at y = 1460)
    const notchY = 1460;
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(cardX, notchY, 26, 0, Math.PI * 2);
    ctx.arc(cardX + cardW, notchY, 26, 0, Math.PI * 2);
    ctx.fill();

    // Dashed tear line
    ctx.save();
    ctx.setLineDash([12, 12]);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cardX + 44, notchY);
    ctx.lineTo(cardX + cardW - 44, notchY);
    ctx.stroke();
    ctx.restore();

    // 3. Top Branding Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#D4AF37';
    ctx.font = '700 40px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('A Z   F I L M S', CANVAS_W / 2, cardY + 95);

    ctx.fillStyle = 'rgba(245, 245, 240, 0.55)';
    ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      film.isOriginal ? 'A Z   O R I G I N A L S   ·   P R E M I E R E   P A S S' : 'P R I V A T E   C I N E M A   P A S S',
      CANVAS_W / 2,
      cardY + 135
    );

    // 4. Poster Artwork Frame (2:3 centered)
    const posterW = 540;
    const posterH = 810;
    const posterX = (CANVAS_W - posterW) / 2;
    const posterY = cardY + 185;

    const posterImg = await loadImageSafe(film.posterUrl || film.backdropUrl || '');
    ctx.save();
    drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 24);
    ctx.clip();

    if (posterImg) {
      const imgRatio = posterImg.width / posterImg.height;
      const boxRatio = posterW / posterH;
      let drawW = posterW;
      let drawH = posterH;
      let dx = posterX;
      let dy = posterY;
      if (imgRatio > boxRatio) {
        drawW = posterH * imgRatio;
        dx = posterX - (drawW - posterW) / 2;
      } else {
        drawH = posterW / imgRatio;
        dy = posterY - (drawH - posterH) / 2;
      }
      ctx.drawImage(posterImg, dx, dy, drawW, drawH);

      const overlay = ctx.createLinearGradient(0, posterY + posterH - 180, 0, posterY + posterH);
      overlay.addColorStop(0, 'rgba(5,5,5,0)');
      overlay.addColorStop(1, 'rgba(5,5,5,0.75)');
      ctx.fillStyle = overlay;
      ctx.fillRect(posterX, posterY, posterW, posterH);
    } else {
      const fallbackGrad = ctx.createLinearGradient(posterX, posterY, posterX, posterY + posterH);
      fallbackGrad.addColorStop(0, '#181409');
      fallbackGrad.addColorStop(1, '#08080A');
      ctx.fillStyle = fallbackGrad;
      ctx.fillRect(posterX, posterY, posterW, posterH);
      ctx.fillStyle = '#D4AF37';
      ctx.font = '700 44px "Cairo", "Plus Jakarta Sans", sans-serif';
      ctx.fillText(film.titleAr || film.titleEn, CANVAS_W / 2, posterY + posterH / 2);
    }
    ctx.restore();

    // Poster gold border
    ctx.save();
    drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 24);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.stroke();
    ctx.restore();

    // 5. Film Titles & Metadata
    const titleY = posterY + posterH + 74;
    ctx.fillStyle = '#F5F5F0';
    ctx.font = '700 52px "Cairo", "Plus Jakarta Sans", sans-serif';
    const nextY = wrapCenteredText(
      ctx,
      film.titleAr || film.titleEn,
      CANVAS_W / 2,
      titleY,
      cardW - 120,
      62,
      2
    );

    if (film.titleEn && film.titleEn !== film.titleAr) {
      ctx.fillStyle = '#D4AF37';
      ctx.font = '600 30px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(film.titleEn.toUpperCase(), CANVAS_W / 2, nextY + 10);
    }

    const genreText = GENRE_LABELS[film.genre]?.[lang] || film.genre;
    const metaParts = [String(film.year), genreText];
    if (film.duration && film.duration !== '—') metaParts.push(film.duration);
    ctx.fillStyle = 'rgba(245, 245, 240, 0.65)';
    ctx.font = '500 26px "Cairo", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(metaParts.join('  ·  '), CANVAS_W / 2, notchY - 46);

    // 6. Ticket Stub Footer (Custom Note or Watch Prompt + Barcode)
    const noteText =
      customNote.trim() ||
      (lang === 'ar' ? 'تجربة سينمائية خاصة — شاهد العمل الآن' : 'A Private World of Cinema — Watch Now');
    ctx.fillStyle = customNote.trim() ? '#E6C65B' : 'rgba(245, 245, 240, 0.85)';
    ctx.font = '600 30px "Cairo", "Plus Jakarta Sans", sans-serif';
    wrapCenteredText(ctx, `“${noteText}”`, CANVAS_W / 2, notchY + 86, cardW - 140, 42, 2);

    // Minimalist ticket barcode bars
    const barBaseY = cardY + cardH - 150;
    const barCount = 38;
    const totalBarsW = 460;
    const startBarX = (CANVAS_W - totalBarsW) / 2;
    ctx.fillStyle = 'rgba(212, 175, 55, 0.55)';
    for (let i = 0; i < barCount; i++) {
      const seed = (film.id.charCodeAt(i % film.id.length) + i * 17) % 5;
      const bw = seed === 0 ? 8 : seed === 1 ? 4 : seed === 2 ? 6 : 3;
      const bx = startBarX + (i / barCount) * totalBarsW;
      ctx.fillRect(bx, barBaseY, bw, 46);
    }

    ctx.fillStyle = 'rgba(245, 245, 240, 0.45)';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText(window.location.host.toUpperCase(), CANVAS_W / 2, cardY + cardH - 54);

    try {
      setPreviewUrl(canvas.toDataURL('image/png'));
    } catch {
      setPreviewUrl('');
    }
    setRendering(false);
  }, [film, lang, customNote]);

  useEffect(() => {
    renderTicket();
  }, [renderTicket]);

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `az-films-${film.id}-story.png`;
    a.click();
  };

  const handleNativeShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSharing(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (blob && navigator.share) {
        const file = new File([blob], `az-films-${film.id}-story.png`, { type: 'image/png' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${film.titleAr} — AZ FILMS`,
          });
          setSharing(false);
          return;
        }
      }
      handleDownload();
    } catch {
      // Cancelled or unsupported; download fallback if not cancelled intentionally
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative my-auto w-full max-w-lg rounded-2xl border border-[#D4AF37]/30 bg-[#0B0B0E] p-5 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#D4AF37]">
            <Sparkles className="h-4 w-4" />
            <h2 className="text-base font-bold text-[#F5F5F0]">
              {lang === 'ar' ? 'بطاقة ستوري إنستغرام (9:16)' : 'Instagram Story Ticket (9:16)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#F5F5F0]/70 hover:text-[#D4AF37] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="mx-auto flex max-h-[54vh] w-full max-w-[280px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#050505]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Story ticket preview"
              className="h-auto max-h-[54vh] w-full object-contain"
            />
          ) : (
            <div className="aspect-[9/16] w-full flex items-center justify-center text-xs text-[#F5F5F0]/50">
              {rendering ? '...' : 'Preview ready'}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-[#F5F5F0]/65">
            {lang === 'ar'
              ? 'أضف انطباعك على البطاقة (اختياري):'
              : 'Add a short note on your ticket (optional):'}
          </label>
          <input
            type="text"
            maxLength={60}
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder={
              lang === 'ar'
                ? 'مثال: عمل سينمائي يستحق المشاهدة!'
                : 'e.g. A masterpiece worth watching!'
            }
            className="h-10 w-full rounded-lg border border-white/15 bg-[#050505] px-3 text-sm text-[#F5F5F0] placeholder:text-[#F5F5F0]/35 focus:border-[#D4AF37] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            disabled={!previewUrl || rendering}
            onClick={handleDownload}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 text-xs font-semibold text-[#050505] hover:bg-[#E6C65B] disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>{lang === 'ar' ? 'حفظ البطاقة (PNG)' : 'Save Image (PNG)'}</span>
          </button>

          <button
            type="button"
            disabled={!previewUrl || sharing}
            onClick={handleNativeShare}
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-4 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/20 disabled:opacity-50 cursor-pointer"
          >
            <Share2 className="h-4 w-4" />
            <span>{lang === 'ar' ? 'مشاركة مباشرة للستوري' : 'Share to Story'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
