import type { Locale } from './constants';
import type { Plan, PlanLimits } from './plans';
import type { ProjectRole, StaffRole } from './roles';

// Firestore document shapes (PRD section 8), shared by the web app and functions. Timestamps
// are typed structurally so both the web SDK's and the Admin SDK's Timestamp fit.

export interface TimestampLike {
  toMillis(): number;
  toDate(): Date;
}

export interface Address {
  street: string;
  postalCode: string;
  city: string;
}

export interface CompanySettings {
  digestTime: string;
  reminderTime: string;
  crewCanSendPricedCards: boolean;
  requirePhoneCheck: boolean;
}

export interface CompanyUsage {
  activeProjects: number;
  serviceClients: number;
  staff: number;
  smsThisMonth: number;
}

export interface Company<T = TimestampLike> {
  name: string;
  orgNumber: string | null;
  logoPath: string | null;
  accentColor: string;
  locale: Locale;
  timeZone: string;
  plan: Plan;
  compedUntil: T | null;
  limits: PlanLimits;
  usage: CompanyUsage;
  referredBy: { code: string; companyId: string; clientUid: string } | null;
  settings: CompanySettings;
  createdAt: T;
  updatedAt: T;
}

export interface StaffMember<T = TimestampLike> {
  role: StaffRole;
  name: string;
  email: string | null;
  phone: string | null;
  joinedAt: T;
  notify: { push: boolean; email: boolean; quietHours: { start: string; end: string } };
  createdAt: T;
  updatedAt: T;
}

export interface UserDoc<T = TimestampLike> {
  kind: 'staff' | 'client';
  name: string;
  phoneE164: string | null;
  email: string | null;
  locale: Locale;
  companyId?: string | null;
  createdAt: T;
  updatedAt: T;
}

export type ProjectKind = 'project' | 'service';
export type ProjectStatus = 'active' | 'completed' | 'archived';

/** The firm's branding, copied onto each project so clients never read company documents. */
export interface Branding {
  name: string;
  logoUrl: string | null;
  accentColor: string;
  showSitelineFooter: boolean;
}

export interface ProjectTotals {
  approvedExtraWorkOre: number;
  openDecisions: number;
  unansweredQuestions: number;
}

export interface Project<T = TimestampLike> {
  companyId: string;
  kind: ProjectKind;
  /** The subject for service clients, such as "Maths with Elsa". */
  title: string;
  address: Address | null;
  schedule: { rrule: string; durationMinutes: number; skipDates: string[] } | null;
  status: ProjectStatus;
  /** Calendar dates as YYYY-MM-DD. */
  startDate: string | null;
  endDate: string | null;
  branding: Branding;
  roles: Record<string, ProjectRole>;
  clientUids: string[];
  crewUids: string[];
  totals: ProjectTotals;
  nextVisitId: string | null;
  lastPostAt: T | null;
  completedAt: T | null;
  createdAt: T;
  updatedAt: T;
}

export type NotifyChannel = 'sms' | 'email' | 'push';

export interface ProjectMember<T = TimestampLike> {
  role: ProjectRole;
  name: string;
  phoneMasked: string | null;
  /** Set when a client first opens their link; staff are joined when assigned. */
  joinedAt: T | null;
  lastSeenAt: T | null;
  notify: { instant: boolean; digest: boolean; channel: NotifyChannel };
  phoneVerifiedAt: T | null;
  /** The client's current invite link, for the People tab. Never contains the token. */
  invite: { sentAt: T; revokedAt: T | null } | null;
  createdAt: T;
}

export type PostType =
  'update' | 'question' | 'milestone' | 'decision' | 'condition' | 'visit_report' | 'system';

export type AuthorRole = StaffRole | 'client' | 'system';

export type MediaTag = 'before' | 'after' | 'hidden_work' | 'condition';

export interface Media {
  path: string;
  thumbPath: string;
  width: number;
  height: number;
  tags: MediaTag[];
}

export interface Post<T = TimestampLike> {
  type: PostType;
  authorUid: string;
  authorName: string;
  authorRole: AuthorRole;
  text: string;
  media: Media[];
  visibility: 'all';
  milestone: { stage: number | null; stageCount: number | null } | null;
  commentCount: number;
  unanswered: boolean;
  createdAt: T;
  editedAt: T | null;
  deletedAt: T | null;
}

export interface Comment<T = TimestampLike> {
  authorUid: string;
  authorName: string;
  authorRole: AuthorRole;
  text: string;
  media: Media[];
  createdAt: T;
  editedAt: T | null;
  deletedAt: T | null;
}

export interface Invite<T = TimestampLike> {
  kind: 'client' | 'staff';
  projectId: string | null;
  companyId: string;
  role: ProjectRole | StaffRole;
  /** The invited user, for client invites. */
  uid: string | null;
  name: string;
  phoneE164: string | null;
  email: string | null;
  createdBy: string;
  createdAt: T;
  expiresAt: T | null;
  revokedAt: T | null;
  redeemCount: number;
  lastRedeemedAt: T | null;
}

export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'suppressed';

export interface OutboxMessage<T = TimestampLike> {
  channel: NotifyChannel;
  to: { uid: string | null; phone: string | null; email: string | null };
  template: string;
  params: Record<string, string>;
  locale: Locale;
  companyId: string | null;
  projectId: string | null;
  dedupeKey: string;
  sendAfter: T;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: T | null;
  providerMessageId: string | null;
  error: string | null;
  createdAt: T;
  updatedAt: T;
}
