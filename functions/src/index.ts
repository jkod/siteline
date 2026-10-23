import './lib/global-options';

export {
  createCheckoutSession,
  createPortalSession,
  devBilling,
  stripeWebhook,
} from './callables/billing';
export { inviteClient, removeClient, resendInvite, revokeInvite } from './callables/clients';
export { createCompany } from './callables/company';
export {
  deleteDecisionDraft,
  exportDecisionsCsv,
  respondToDecision,
  reviseDecision,
  saveDecisionDraft,
  sendDecision,
  setApprovalRule,
  withdrawDecision,
} from './callables/decisions';
export { startDemo } from './callables/demo';
export {
  acknowledgeCondition,
  deleteReminder,
  generateHandover,
  postConditionReport,
  requestBooking,
  resolveBooking,
  saveHandover,
  saveReminder,
} from './callables/handover';
export { redeemInvite, requestClientSignIn, requestNewLink } from './callables/links';
export { logClientError } from './callables/log-client-error';
export { deleteMyAccount, deleteMyData, deleteProject, leaveProject } from './callables/privacy';
export { assignCrew, createProject, setProjectStatus } from './callables/projects';
export { createReferral, openReferral } from './callables/referrals';
export { acceptStaffInvite, inviteStaff, removeStaff, setStaffRole } from './callables/staff';
export {
  createServiceClient,
  postVisitReport,
  requestVisitChange,
  respondVisitChange,
  setPhotoConsent,
  updateSchedule,
} from './callables/visits';
export { discardVoiceDraft, draftFromVoice } from './callables/voice';
export {
  aggregateMetricsJob as aggregateMetrics,
  purgeDemosJob as purgeDemos,
  purgeVoiceAudioJob as purgeVoiceAudio,
  sendAftercareRemindersJob as sendAftercareReminders,
} from './scheduled/maintenance';
export {
  generateVisitsJob as generateVisits,
  sendDigestsJob as sendDigests,
  sendVisitRemindersJob as sendVisitReminders,
} from './scheduled/notifications';
export { outboxSweeper } from './scheduled/outbox-sweeper';
export { onCommentWritten } from './triggers/comments';
export { onCompanyWritten } from './triggers/company';
export { onOutboxCreated } from './triggers/outbox';
export { onPostWritten } from './triggers/posts';
export { onVisitWritten } from './triggers/visits';
