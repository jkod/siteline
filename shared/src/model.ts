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
  /** The month smsThisMonth counts, as YYYY-MM. */
  smsMonth?: string;
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

/** Newest first like a social feed, or newest at the bottom like a chat. */
export type FeedStyle = 'feed' | 'chat';

export interface UserDoc<T = TimestampLike> {
  kind: 'staff' | 'client';
  name: string;
  /** The person's choice of feed order; 'feed' when unset. */
  feedStyle?: FeedStyle;
  phoneE164: string | null;
  email: string | null;
  locale: Locale;
  companyId?: string | null;
  createdAt: T;
  updatedAt: T;
}

export type ProjectKind = 'project' | 'service';

/**
 * A service client's recurring visits (PRD F19). The rule's DTSTART is the first visit's
 * Stockholm wall-clock time written as UTC ("floating"); see schedule.ts.
 */
export interface Schedule {
  rrule: string;
  durationMinutes: number;
  /** YYYY-MM-DD dates with no visit, such as holidays. */
  skipDates: string[];
}
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
  schedule: Schedule | null;
  /** The report template for service clients. */
  templateId?: string | null;
  /** Tutoring: photos in reports only after a parent's recorded consent (PRD section 10). */
  photoConsentAt?: T | null;
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

export type DecisionKind = 'extra_work' | 'choice' | 'approval';
export type DecisionStatus =
  'draft' | 'sent' | 'approved' | 'declined' | 'withdrawn' | 'superseded';

export interface DecisionOption {
  id: string;
  label: string;
  mediaIndex?: number;
  priceDeltaOre?: number;
}

/** A decision card on a post (PRD section 8). Only functions write decision posts. */
export interface Decision<T = TimestampLike> {
  kind: DecisionKind;
  title: string;
  description?: string;
  /** Including VAT. */
  priceOre?: number;
  /** The labour and material split, for the ROT helper in phase 2. */
  labourOre?: number;
  materialOre?: number;
  vatRate: number;
  options?: DecisionOption[];
  respondBy?: T | null;
  status: DecisionStatus;
  version: number;
  supersedesPostId?: string | null;
  createdByUid: string;
  sentAt?: T | null;
  sentByUid?: string | null;
  decidedAt?: T | null;
  selectedOptionId?: string | null;
  approvalId?: string | null;
  /** The client who answered, for "Approved by Anna Lindqvist, 3 Oct 2026, 18:42". */
  decidedByName?: string | null;
  declineReason?: string | null;
}

export interface VisitReport {
  visitId: string;
  templateId: string;
  done: { itemId: string; label: string; checked: boolean }[];
  rating?: 'good' | 'ok' | 'hard' | null;
  note?: string;
  /** Things the client should know. */
  flags?: string[];
  /** Checklist items added for the next visit, and their text for showing the report. */
  nextTimeItemIds?: string[];
  nextTime?: string[];
}

/** Staff-only posts (decision drafts) are hidden from clients; partners come in phase 2. */
export type PostVisibility = 'all' | 'staff';

export interface Post<T = TimestampLike> {
  type: PostType;
  authorUid: string;
  authorName: string;
  authorRole: AuthorRole;
  text: string;
  media: Media[];
  visibility: PostVisibility;
  milestone: { stage: number | null; stageCount: number | null } | null;
  decision?: Decision<T> | null;
  report?: VisitReport | null;
  commentCount: number;
  unanswered: boolean;
  createdAt: T;
  editedAt: T | null;
  deletedAt: T | null;
}

export type ApprovalOutcome = 'approved' | 'declined' | 'chosen' | 'acknowledged';

/** Write-once evidence of a client's decision (PRD section 10). */
export interface Approval<T = TimestampLike> {
  postId: string;
  version: number;
  kind: 'decision' | 'condition';
  outcome: ApprovalOutcome;
  optionId: string | null;
  priceOre: number | null;
  reason: string | null;
  /** Exactly what the client saw and answered. */
  snapshot: Record<string, unknown>;
  snapshotSha256: string;
  actorUid: string;
  actorName: string;
  actorPhoneMasked: string | null;
  phoneVerified: boolean;
  createdAt: T;
}

export type VisitStatus = 'planned' | 'done' | 'cancelled';

export interface Visit<T = TimestampLike> {
  /** Copied from the project, so a company's visits can be listed together. */
  companyId: string;
  startAt: T;
  endAt: T | null;
  people: number | null;
  notes: string;
  status: VisitStatus;
  fromSchedule: boolean;
  reportPostId: string | null;
  createdAt: T;
  updatedAt: T;
}

export type ChecklistSide = 'client' | 'firm';

export interface ChecklistItem<T = TimestampLike> {
  text: string;
  side: ChecklistSide;
  /** The visit it belongs to; null means "next visit, not booked yet". */
  visitId: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: T;
  doneBy: string | null;
  doneByName: string | null;
  doneAt: T | null;
}

export interface VisitRequest<T = TimestampLike> {
  visitId: string;
  kind: 'move' | 'cancel';
  proposedStartAt: T | null;
  note: string;
  status: 'open' | 'accepted' | 'declined';
  createdBy: string;
  createdByName: string;
  resolvedBy: string | null;
  createdAt: T;
  resolvedAt: T | null;
}

export type Trade = 'tutoring' | 'gardening' | 'other';

export interface ReportTemplate {
  name: string;
  trade: Trade;
  items: { id: string; label: string }[];
  fields: { rating: boolean; note: boolean; flags: boolean; nextTime: boolean };
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
