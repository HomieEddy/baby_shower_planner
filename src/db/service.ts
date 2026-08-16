// Barrel: the complete data layer. Feature modules live in this directory.

export { pb } from './client';
export { initPocketBase, wipeDatabaseData } from './schema';
export {
  addGuest,
  batchImportGuests,
  deleteGuest,
  getAllGuests,
  getGuestByCode,
  getGuestById,
  getGuestByToken,
  inviteMessageFor,
  updateGuest,
} from './guests';
export {
  getInvitesByGuest,
  inviteGuest,
  isRsvpClosed,
  removeInvite,
  resetTokenUsage,
  submitRsvp,
  updateGuestContact,
} from './rsvp';
export type { GuestContactPayload, GuestInviteResult } from './rsvp';
export {
  addGuestbookEntry,
  deleteGuestbookEntry,
  getAllGuestbookEntries,
  setGuestbookEntryVisibility,
} from './guestbook';
export { getGuestContentLock, getSettings, updateSettings } from './settings';
export type { GuestContentLock } from './settings';
export { createAlert, deleteAlert, getAlerts } from './alerts';
export { assignGuestToTable, getFloorMap, shareFloorPlanEmail, updateFloorMap } from './floorMap';
export { addPhotosBatch, deletePhoto, getAllPhotos, getGuestPhotoUsage, setPhotoVisibility } from './photos';
export { addGift, deleteGift, getGiftById, getGifts, toggleGiftThankYou } from './gifts';
export { generateThankYouDraft, sendGiftThankYou } from './thankyou';
export {
  addAgendaTask,
  deleteAgendaTask,
  getAgendaTasks,
  getTasksDueForReminder,
  markAgendaTaskReminded,
  reorderAgendaTasks,
  runAgendaReminderSweep,
  updateAgendaTask,
} from './agenda';
export { checkInGuest, getCheckInStats, selfCheckIn, undoCheckIn } from './checkin';
export type { SelfCheckInResult } from './checkin';
export { sendInvitations, sendReminders } from './notify';
export { getSeatingRoster } from './roster';