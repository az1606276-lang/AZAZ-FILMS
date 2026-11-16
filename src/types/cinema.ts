export type FilmGenre = 'military' | 'historical' | 'drama' | 'action' | 'thriller' | 'other';

export type FilmStatus = 'released' | 'coming_soon' | 'post_production';

export type UserRole = 'admin' | 'viewer';

export type AppLanguage = 'ar' | 'en';

export type AppView =
  | 'home'
  | 'library'
  | 'originals'
  | 'coming_soon'
  | 'my_list'
  | 'search'
  | 'film_details'
  | 'admin';

export interface CastMember {
  name: string;
  role: string;
}

export interface VideoQuality {
  label: string;
  url: string;
}

export interface Film {
  id: string;
  titleAr: string;
  titleEn: string;
  year: number;
  releaseDate?: string;
  genre: FilmGenre;
  duration?: string;
  durationSeconds?: number;
  status: FilmStatus;
  isOriginal: boolean;
  isFeatured: boolean;
  isVisible: boolean;
  sortOrder: number;
  synopsisAr?: string;
  synopsisEn?: string;
  director?: string;
  producers?: string;
  cast?: CastMember[];
  posterUrl?: string;
  backdropUrl?: string;
  stillUrls?: string[];
  trailerUrl?: string;
  videoUrl?: string;
  videoQualities?: VideoQuality[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WatchlistItem {
  filmId: string;
  userId: string;
  addedAt?: unknown;
}

export interface AnalyticsSession {
  visitorId: string;
  visitCount: number;
  firstSeenAt: Date;
  lastActiveAt: Date;
  lastPath?: string;
  updatedAt: Date;
}

export interface AnalyticsVisit {
  visitId: string;
  visitorId: string;
  isReturning: boolean;
  dateKey: string;
  createdAt: Date;
}

export interface AnalyticsView {
  viewId: string;
  filmId: string;
  visitorId: string;
  dateKey: string;
  watchedSeconds: number;
  durationSeconds?: number;
  completed: boolean;
  startedAt: Date;
  completedAt?: Date;
  updatedAt: Date;
}

export type AnalyticsRangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface FilmAnalyticsSummary {
  filmId: string;
  titleAr: string;
  titleEn: string;
  totalViews: number;
  uniqueViewers: number;
  todayViews: number;
  avgWatchSeconds: number;
  completedCount: number;
  completionRate: number;
  lastWatchedAt?: Date;
  dailySeries: { dateKey: string; views: number; completed: number }[];
}

export interface AnalyticsDashboardReport {
  totalVisitors: number;
  todayVisitors: number;
  weekVisitors: number;
  monthVisitors: number;
  uniqueVisitors: number;
  returningVisits: number;
  activeNowEstimated: number;
  totalViews: number;
  todayViews: number;
  weekViews: number;
  monthViews: number;
  totalPlayStarts: number;
  completedViews: number;
  avgWatchSeconds: number;
  overallCompletionRate: number;
  topFilm: FilmAnalyticsSummary | null;
  recentlyWatchedFilms: FilmAnalyticsSummary[];
  visitorTrafficSeries: { dateKey: string; visitors: number; returning: number }[];
  filmViewsSeries: { dateKey: string; views: number; completed: number }[];
  filmRankings: FilmAnalyticsSummary[];
}

export type SiteAccessMode = 'open' | 'maintenance' | 'closed';

export interface SiteSettings {
  accessMode: SiteAccessMode;
  statusTitleAr: string;
  statusTitleEn: string;
  statusMessageAr: string;
  statusMessageEn: string;
  announcementEnabled: boolean;
  announcementAr: string;
  announcementEn: string;
  instagramUrl: string;
  onlyShowReadyFilms?: boolean;
  countdownEnabled?: boolean;
  countdownTargetIso?: string;
  countdownTitleAr?: string;
  countdownTitleEn?: string;
  pollEnabled?: boolean;
  pollId?: string;
  pollQuestionAr?: string;
  pollQuestionEn?: string;
  pollOptionAAr?: string;
  pollOptionAEn?: string;
  pollOptionBAr?: string;
  pollOptionBEn?: string;
  updatedAt?: unknown;
}

export type PollOption = 'A' | 'B';

export interface PollSummary {
  countA: number;
  countB: number;
  userChoice: PollOption | null;
}

export interface FilmComment {
  commentId: string;
  filmId: string;
  visitorId: string;
  authorName: string;
  text: string;
  createdAt: Date;
}

