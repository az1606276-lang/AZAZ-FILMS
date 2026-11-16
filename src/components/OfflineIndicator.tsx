import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import type { AppLanguage } from '../types/cinema';

export function OfflineIndicator({ lang }: { lang: AppLanguage }) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-5 start-5 z-50 flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#121216] px-3.5 py-2 text-xs font-medium text-[#D4AF37] shadow-2xl">
      <WifiOff className="h-3.5 w-3.5" />
      <span>
        {lang === 'ar'
          ? 'لا يوجد اتصال بالإنترنت — يتم عرض البيانات المحفوظة'
          : 'Offline — showing cached data'}
      </span>
    </div>
  );
}
