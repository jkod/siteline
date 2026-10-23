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
  /** How many businesses this firm's clients have brought in (PRD F20). */
  referralSignups?: number;
  /** A "try Siteline" sandbox: nothing is ever sent, and it's deleted after a few days. */
  demo?: boolean;
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

/**
 * Who must approve a priced decision when a project has several clients: any one of them, or
 * all of them (the user's request; a couple can require both). Clients choose it.
 */
export type ApprovalRule = 'any' | 'all';

/** The firm's branding, copied onto each project so clients never read company documents. */
export interface Branding {
  name: string;
  logoUrl: string | null;
  accentColor: string;
  showSitelineFooter: boolean;
}

export interface ProjectTotals<T = TimestampLike> {
  approvedExtraWorkOre: number;
  openDecisions: number;
  unansweredQuestions: number;
  /** When the longest-waiting open decision was sent, for the Today list (F14). */
  oldestOpenDecisionAt?: T | null;
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
  /** Defaults to 'any'. Each decision keeps the rule it was sent under. */
  approvalRule?: ApprovalRule;
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
  totals: ProjectTotals<T>;
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
  /** Under "all must approve": every client who must approve, fixed when the card is sent. */
  requiredApproverUids?: string[] | null;
  /** Approvals so far under "all must approve", each with its own approval record. */
  approvals?: DecisionApproval<T>[];
}

export interface DecisionApproval<T = TimestampLike> {
  uid: string;
  name: string;
  optionId: string | null;
  approvalId: string;
  at: T;
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
  /** The voice recording a staff post was drafted from (PRD F5). */
  voiceId?: string | null;
  /** For system posts: what happened, shown as a translated line. */
  system?: { event: 'approval_rule'; rule: ApprovalRule } | null;
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
  /** A client's or staff member's invite, or a client's one-time sign-in link. */
  kind: 'client' | 'staff' | 'signin';
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

/** A voice recording on its way to a post (PRD F5). Audio is deleted on `deleteAfter`. */
export interface VoiceDraft<T = TimestampLike> {
  path: string;
  createdBy: string;
  postId: string | null;
  deleteAfter: T;
  createdAt: T;
}

/** The kinds of business a client can invite (PRD 4.5). */
export const BUSINESS_KINDS = ['renovation', 'garden', 'cleaning', 'tutoring', 'other'] as const;
export type BusinessKind = (typeof BUSINESS_KINDS)[number];

/** A client's invite to another business (PRD F20); functions only. */
export interface Referral<T = TimestampLike> {
  clientUid: string;
  /** Set only when the client chose to be named on the invite page. */
  firstName: string | null;
  sourceCompanyId: string;
  sourceProjectId: string;
  businessKind: BusinessKind;
  openedCount: number;
  signedUpCompanyId: string | null;
  firstPaidAt: T | null;
  rewardGrantedAt: T | null;
  createdAt: T;
}

/** First-party product metrics (PRD section 8). Props never hold names, numbers or text. */
export interface MetricEvent<T = TimestampLike> {
  name: MetricName;
  companyId: string | null;
  projectId: string | null;
  uid: string | null;
  role: AuthorRole | null;
  props: Record<string, string | number | boolean>;
  at: T;
}

/** Events the browser may record itself; the rest are written by functions. */
export const CLIENT_METRICS = [
  'invite_card_shown',
  'invite_shared',
  'feed_opened',
  'voice_draft_used',
  'voice_draft_discarded',
] as const;
export const SERVER_METRICS = [
  'invite_link_opened',
  'referral_signup',
  'first_payment',
  'post_published',
  'voice_draft_created',
  'decision_answered',
] as const;
export type MetricName = (typeof CLIENT_METRICS)[number] | (typeof SERVER_METRICS)[number];

/** Daily counts per company, rolled up from events each night. */
export interface DailyMetrics {
  companyId: string | null;
  /** YYYY-MM-DD in Stockholm time. */
  date: string;
  counts: Partial<Record<MetricName, number>>;
}
