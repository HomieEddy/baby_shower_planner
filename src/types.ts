// Shared domain types. The runtime source of truth is src/lib/domain.ts (Zod
// schemas); this barrel keeps the existing `types` import path stable.

export type {
  Language,
  DeliveryChannel,
  AttendeeInfo,
  ScheduleItem,
  CustomTheme,
  SeatOccupant,
  TableElement,
  LandmarkElement,
  FloorMapData,
  Guest,
  GuestInvite,
  GuestInviteView,
  GuestbookEntry,
  EventSettings,
  AgendaStatus,
  AgendaTask,
  AlertType,
  EventAlert,
  EventPhoto,
  GiftLog,
  AddGuestPayload,
  RegisterGuestPayload,
  SubmitRsvpPayload,
  AddGuestbookPayload,
} from './lib/domain';
