import { doc, getDocFromServer, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { SiteAccessMode, SiteSettings } from '../types/cinema';

const SETTINGS_COLLECTION = 'site_settings';
const SETTINGS_DOC_ID = 'platform';

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  accessMode: 'open',
  statusTitleAr: 'المنصة قيد التحديث والصيانة',
  statusTitleEn: 'Platform Under Maintenance',
  statusMessageAr:
    'نقوم حاليًا بتحديث مكتبة AZ FILMS وإضافة أعمال جديدة. نعود إليكم قريبًا بتجربة مشاهدة أفضل.',
  statusMessageEn:
    'We are currently updating the AZ FILMS library and preparing new releases. We will be back shortly.',
  announcementEnabled: false,
  announcementAr: '',
  announcementEn: '',
  instagramUrl: '',
  onlyShowReadyFilms: false,
  countdownEnabled: false,
  countdownTargetIso: '',
  countdownTitleAr: 'العرض الأول للعمل القادم خلال',
  countdownTitleEn: 'Next Premiere Arriving In',
  pollEnabled: true,
  pollId: 'poll-v1',
  pollQuestionAr: 'أي نوع عمل تتمنى أن يكون إنتاج AZ FILMS القادم؟',
  pollQuestionEn: 'Which genre should AZ FILMS produce next?',
  pollOptionAAr: 'ملحمة تاريخية — عالم الماضي والأرض',
  pollOptionAEn: 'Historical Epic — Heritage & Memory',
  pollOptionBAr: 'عمل أمني وأكشن — مهمة سرية جديدة',
  pollOptionBEn: 'Tactical Action — New Covert Mission',
};

function normalizeSiteSettings(raw: Record<string, unknown> | undefined): SiteSettings {
  if (!raw) return { ...DEFAULT_SITE_SETTINGS };
  const mode = raw.accessMode;
  const accessMode: SiteAccessMode =
    mode === 'maintenance' || mode === 'closed' || mode === 'open' ? mode : 'open';

  return {
    accessMode,
    statusTitleAr:
      typeof raw.statusTitleAr === 'string' && raw.statusTitleAr.trim()
        ? raw.statusTitleAr
        : DEFAULT_SITE_SETTINGS.statusTitleAr,
    statusTitleEn:
      typeof raw.statusTitleEn === 'string' && raw.statusTitleEn.trim()
        ? raw.statusTitleEn
        : DEFAULT_SITE_SETTINGS.statusTitleEn,
    statusMessageAr:
      typeof raw.statusMessageAr === 'string' && raw.statusMessageAr.trim()
        ? raw.statusMessageAr
        : DEFAULT_SITE_SETTINGS.statusMessageAr,
    statusMessageEn:
      typeof raw.statusMessageEn === 'string' && raw.statusMessageEn.trim()
        ? raw.statusMessageEn
        : DEFAULT_SITE_SETTINGS.statusMessageEn,
    announcementEnabled: Boolean(raw.announcementEnabled),
    announcementAr: typeof raw.announcementAr === 'string' ? raw.announcementAr : '',
    announcementEn: typeof raw.announcementEn === 'string' ? raw.announcementEn : '',
    instagramUrl: typeof raw.instagramUrl === 'string' ? raw.instagramUrl : '',
    onlyShowReadyFilms: Boolean(raw.onlyShowReadyFilms),
    countdownEnabled: Boolean(raw.countdownEnabled),
    countdownTargetIso: typeof raw.countdownTargetIso === 'string' ? raw.countdownTargetIso : '',
    countdownTitleAr:
      typeof raw.countdownTitleAr === 'string' && raw.countdownTitleAr.trim()
        ? raw.countdownTitleAr
        : DEFAULT_SITE_SETTINGS.countdownTitleAr,
    countdownTitleEn:
      typeof raw.countdownTitleEn === 'string' && raw.countdownTitleEn.trim()
        ? raw.countdownTitleEn
        : DEFAULT_SITE_SETTINGS.countdownTitleEn,
    pollEnabled:
      typeof raw.pollEnabled === 'boolean'
        ? raw.pollEnabled
        : DEFAULT_SITE_SETTINGS.pollEnabled,
    pollId:
      typeof raw.pollId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(raw.pollId)
        ? raw.pollId
        : DEFAULT_SITE_SETTINGS.pollId,
    pollQuestionAr:
      typeof raw.pollQuestionAr === 'string' && raw.pollQuestionAr.trim()
        ? raw.pollQuestionAr
        : DEFAULT_SITE_SETTINGS.pollQuestionAr,
    pollQuestionEn:
      typeof raw.pollQuestionEn === 'string' && raw.pollQuestionEn.trim()
        ? raw.pollQuestionEn
        : DEFAULT_SITE_SETTINGS.pollQuestionEn,
    pollOptionAAr:
      typeof raw.pollOptionAAr === 'string' && raw.pollOptionAAr.trim()
        ? raw.pollOptionAAr
        : DEFAULT_SITE_SETTINGS.pollOptionAAr,
    pollOptionAEn:
      typeof raw.pollOptionAEn === 'string' && raw.pollOptionAEn.trim()
        ? raw.pollOptionAEn
        : DEFAULT_SITE_SETTINGS.pollOptionAEn,
    pollOptionBAr:
      typeof raw.pollOptionBAr === 'string' && raw.pollOptionBAr.trim()
        ? raw.pollOptionBAr
        : DEFAULT_SITE_SETTINGS.pollOptionBAr,
    pollOptionBEn:
      typeof raw.pollOptionBEn === 'string' && raw.pollOptionBEn.trim()
        ? raw.pollOptionBEn
        : DEFAULT_SITE_SETTINGS.pollOptionBEn,
    updatedAt: raw.updatedAt,
  };
}

export function subscribeSiteSettings(onUpdate: (settings: SiteSettings) => void): Unsubscribe {
  const ref = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  let cancelled = false;
  let lastServerSync = 0;

  const refreshFromServer = () => {
    const now = Date.now();
    if (now - lastServerSync < 10000) return;
    lastServerSync = now;
    getDocFromServer(ref)
      .then((serverSnap) => {
        if (cancelled) return;
        if (!serverSnap.exists()) {
          onUpdate({ ...DEFAULT_SITE_SETTINGS });
          return;
        }
        onUpdate(normalizeSiteSettings(serverSnap.data() as Record<string, unknown>));
      })
      .catch(() => {
        // Realtime listener still provides active snapshot
      });
  };

  refreshFromServer();

  const onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      refreshFromServer();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
  }

  const unsubSnapshot = onSnapshot(
    ref,
    (snap) => {
      if (snap.metadata.fromCache) {
        refreshFromServer();
      }
      if (!snap.exists()) {
        onUpdate({ ...DEFAULT_SITE_SETTINGS });
        return;
      }
      onUpdate(normalizeSiteSettings(snap.data() as Record<string, unknown>));
    },
    (error) => {
      console.warn('Site settings read fallback:', error);
      onUpdate({ ...DEFAULT_SITE_SETTINGS });
    }
  );

  return () => {
    cancelled = true;
    unsubSnapshot();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

export async function saveSiteSettings(next: Omit<SiteSettings, 'updatedAt'>): Promise<void> {
  const ref = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  const accessMode: SiteAccessMode =
    next.accessMode === 'maintenance' || next.accessMode === 'closed' ? next.accessMode : 'open';

  const payload = {
    accessMode,
    statusTitleAr: (next.statusTitleAr || DEFAULT_SITE_SETTINGS.statusTitleAr).trim().slice(0, 140),
    statusTitleEn: (next.statusTitleEn || DEFAULT_SITE_SETTINGS.statusTitleEn).trim().slice(0, 140),
    statusMessageAr: (next.statusMessageAr || DEFAULT_SITE_SETTINGS.statusMessageAr).trim().slice(0, 1000),
    statusMessageEn: (next.statusMessageEn || DEFAULT_SITE_SETTINGS.statusMessageEn).trim().slice(0, 1000),
    announcementEnabled: Boolean(next.announcementEnabled),
    announcementAr: (next.announcementAr || '').trim().slice(0, 240),
    announcementEn: (next.announcementEn || '').trim().slice(0, 240),
    instagramUrl: (next.instagramUrl || '').trim().slice(0, 300),
    onlyShowReadyFilms: Boolean(next.onlyShowReadyFilms),
    countdownEnabled: Boolean(next.countdownEnabled),
    countdownTargetIso: (next.countdownTargetIso || '').trim().slice(0, 40),
    countdownTitleAr: (next.countdownTitleAr || DEFAULT_SITE_SETTINGS.countdownTitleAr || '').trim().slice(0, 140),
    countdownTitleEn: (next.countdownTitleEn || DEFAULT_SITE_SETTINGS.countdownTitleEn || '').trim().slice(0, 140),
    pollEnabled: next.pollEnabled !== false,
    pollId:
      next.pollId && /^[a-zA-Z0-9_-]{1,64}$/.test(next.pollId.trim())
        ? next.pollId.trim()
        : 'poll-v1',
    pollQuestionAr: (next.pollQuestionAr || DEFAULT_SITE_SETTINGS.pollQuestionAr || '').trim().slice(0, 180),
    pollQuestionEn: (next.pollQuestionEn || DEFAULT_SITE_SETTINGS.pollQuestionEn || '').trim().slice(0, 180),
    pollOptionAAr: (next.pollOptionAAr || DEFAULT_SITE_SETTINGS.pollOptionAAr || '').trim().slice(0, 120),
    pollOptionAEn: (next.pollOptionAEn || DEFAULT_SITE_SETTINGS.pollOptionAEn || '').trim().slice(0, 120),
    pollOptionBAr: (next.pollOptionBAr || DEFAULT_SITE_SETTINGS.pollOptionBAr || '').trim().slice(0, 120),
    pollOptionBEn: (next.pollOptionBEn || DEFAULT_SITE_SETTINGS.pollOptionBEn || '').trim().slice(0, 120),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${SETTINGS_COLLECTION}/${SETTINGS_DOC_ID}`);
  }
}
