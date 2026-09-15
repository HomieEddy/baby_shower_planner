// The single source of truth for the domain shapes: one Zod schema per
// collection, from which the TS types are inferred. The PocketBase field defs
// are derived from these same schemas in src/db/collectionDefs.ts (server-only,
// so this module stays client-safe).
//
// Domain schemas describe the *stored* shape and carry no defaults — form and
// payload schemas in lib/validation.ts add defaults on top.

import { z } from 'zod';

export type Language = 'EN' | 'FR';
export type DeliveryChannel = 'email' | 'text' | 'both' | 'none';

const LanguageEnum = z.enum(['EN', 'FR']);
const DeliveryChannelEnum = z.enum(['email', 'text', 'both', 'none']);

// ─── Nested shapes ─────────────────────────────────────────────────

const AttendeeInfoSchema = z.object({
  name: z.string(),
  contact: z.string().optional(),
  // Per-member dietary restriction/allergy (party-level string is legacy).
  dietary: z.string().optional(),
  magic_token: z.string().optional(),
});
export type AttendeeInfo = z.infer<typeof AttendeeInfoSchema>;
// Reusable nested shape for payload schemas (validation.ts).
export { AttendeeInfoSchema };

const ScheduleItemSchema = z.object({
  id: z.string(),
  time: z.string(),
  titleEn: z.string(),
  titleFr: z.string(),
  descEn: z.string().optional(),
  descFr: z.string().optional(),
});
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

const CustomThemeSchema = z.object({
  fontFamily: z.string(),
  bg: z.string(),
  ink: z.string(),
  accent: z.string(),
});
export type CustomTheme = z.infer<typeof CustomThemeSchema>;

// Seating structure stays hand-written: it travels as a JSON blob and is shaped
// by lib/tableAssignment, not by a flat collection schema.
export interface SeatOccupant {
  guestId: string;
  attendeeIndex: number;
}

export interface TableElement {
  id: string;
  name: string;
  shape: 'circle' | 'rectangle' | 'square';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  capacity: number;
  assignedGuestIds: string[];
  seats?: (SeatOccupant | null)[];
  color?: string;
}

export interface LandmarkElement {
  id: string;
  name: string;
  type: 'entrance' | 'stage' | 'gifts' | 'dessert' | 'bar' | 'dj' | 'restroom' | 'food' | 'custom';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  icon?: string;
}

export interface FloorMapData {
  id: string;
  canvasWidth: number;
  canvasHeight: number;
  roomShape?: 'rectangle' | 'circle' | 'ellipse';
  tables: TableElement[];
  landmarks: LandmarkElement[];
  updatedAt: string;
}

// ─── Collection schemas ────────────────────────────────────────────

export const GuestSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  delivery_channel: DeliveryChannelEnum.optional(),
  code: z.string(),
  max_party_size: z.number(),
  rsvp_status: z.enum(['Pending', 'Attending', 'Declined']),
  attending_party_size: z.number(),
  attendee_names: z.array(z.string()).optional(),
  attendee_details: z.array(AttendeeInfoSchema).optional(),
  dietary_restrictions: z.string(),
  language_pref: LanguageEnum,
  magic_token: z.string(),
  token_used: z.boolean(),
  created_at: z.string(),
  table_id: z.string().optional(),
  is_read_only: z.boolean().optional(),
  confirmed_by_guest_name: z.string().optional(),
  main_guest_id: z.string().optional(),
  checked_in: z.boolean().optional(),
  checked_in_at: z.string().optional(),
  checked_in_names: z.array(z.string()).optional(),
  invited_by_guest_id: z.string().optional(),
  invited_by_guest_name: z.string().optional(),
  guest_note: z.string().optional(),
  approval_status: z.enum(['pending', 'approved', 'rejected']).optional(),
});
export type Guest = z.infer<typeof GuestSchema> & { id: string };

export const InviteSchema = z.object({
  inviter_guest_id: z.string(),
  inviter_guest_name: z.string(),
  invitee_name: z.string(),
  contact: z.string().optional(),
  note: z.string().optional(),
  registered_guest_id: z.string().optional(),
  created_at: z.string(),
});
export type GuestInvite = z.infer<typeof InviteSchema> & { id: string };

// A share link plus the guest it produced (once registered).
export interface GuestInviteView extends GuestInvite {
  invite_url: string;
  invite_message: string;
  registered_guest?: Guest;
}

export const GuestbookSchema = z.object({
  guest_name: z.string(),
  message: z.string(),
  photo_url: z.string().optional(),
  // Guest ownership + table grouping (set when written from a table QR).
  reservation_code: z.string().optional(),
  table_name: z.string().optional(),
  table_id: z.string().optional(),
  visible: z.boolean().optional(),
  created_at: z.string(),
});
export type GuestbookEntry = z.infer<typeof GuestbookSchema> & { id: string };

export const SettingsSchema = z.object({
  babyName: z.string(),
  parentsNames: z.string(),
  date: z.string(),
  time: z.string(),
  venueName: z.string(),
  venueAddress: z.string(),
  registryUrl: z.url(),
  rsvpDeadline: z.string().optional(),
  showScheduleTime: z.boolean().optional(),
  schedule: z.array(ScheduleItemSchema).optional(),
  themeId: z.string().optional(),
  customTheme: CustomThemeSchema.optional(),
  contentOpenAt: z.string().optional(),
  contentCloseAt: z.string().optional(),
  invitationTemplateFr: z.string().optional(),
  invitationTemplateEn: z.string().optional(),
  hostEmail: z.string().optional(),
  hostPhone: z.string().optional(),
  reminderChannels: z.object({ email: z.boolean(), sms: z.boolean() }).optional(),
  reminderAdvance: z.enum(['1h', '6h', '1d', '2d', '1w']).optional(),
  language: LanguageEnum.optional(),
});
export type EventSettings = z.infer<typeof SettingsSchema>;

export const AlertSchema = z.object({
  type: z.enum(['DATE_CHANGE', 'VENUE_CHANGE', 'CANCELLATION', 'CUSTOM', 'REMINDER']),
  title: z.string(),
  message: z.string(),
  active: z.boolean(),
  notified_guests_count: z.number(),
  target_audience: z.enum(['ALL', 'PENDING', 'ATTENDING']).optional(),
  created_at: z.string(),
});
export type AlertType = z.infer<typeof AlertSchema>['type'];
export type EventAlert = z.infer<typeof AlertSchema> & { id: string };

export const PhotoSchema = z.object({
  url: z.string(),
  filename: z.string(),
  caption: z.string().optional(),
  uploader_name: z.string().optional(),
  table_name: z.string().optional(),
  table_id: z.string().optional(),
  reservation_code: z.string().optional(),
  file_size: z.number().optional(),
  visible: z.boolean().optional(),
  created_at: z.string(),
});
export type EventPhoto = z.infer<typeof PhotoSchema> & { id: string };

export const GiftSchema = z.object({
  guest_name: z.string(),
  guest_id: z.string().optional(),
  gift_description: z.string(),
  category: z.enum(['Clothing', 'Nursery', 'Toys', 'Feeding', 'Diapering', 'Other']).optional(),
  thank_you_sent: z.boolean(),
  thank_you_date: z.string().optional(),
  created_at: z.string(),
});
export type GiftLog = z.infer<typeof GiftSchema> & { id: string };

export const AgendaTaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  due_date: z.string().optional(),
  due_time: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']),
  position: z.number(),
  reminder_sent: z.boolean(),
  created_at: z.string(),
});
export type AgendaStatus = z.infer<typeof AgendaTaskSchema>['status'];
export type AgendaTask = z.infer<typeof AgendaTaskSchema> & { id: string };

// floor_maps: tables/landmarks are opaque JSON here (their shape is Domain
// structural, owned by lib/tableAssignment), so the inferred type is not used.
export const FloorMapSchema = z.object({
  canvasWidth: z.number(),
  canvasHeight: z.number(),
  roomShape: z.enum(['rectangle', 'circle', 'ellipse']).optional(),
  tables: z.unknown(),
  landmarks: z.unknown(),
  updatedAt: z.string(),
});

// ─── Payload shapes (input, not stored) ────────────────────────────

export interface AddGuestPayload {
  name: string;
  email?: string;
  phone?: string;
  delivery_channel?: DeliveryChannel;
  max_party_size?: number;
  language_pref: Language;
  // Host-registered "going" guests: created already Attending, no invitation.
  rsvp_status?: 'Attending';
  // Names of the additional party members (primary guest is `name`).
  attendee_names?: string[];
  // Full party (primary first) with each member's contact/dietary.
  attendee_details?: AttendeeInfo[];
}

export interface RegisterGuestPayload {
  name: string;
  email?: string;
  phone?: string;
  language_pref: Language;
  attendee_names?: string[];
  attendee_details?: AttendeeInfo[];
  dietary_restrictions?: string;
}

export interface SubmitRsvpPayload {
  rsvp_status: 'Attending' | 'Declined';
  attending_party_size?: number;
  attendee_names?: string[];
  attendee_details?: AttendeeInfo[];
  dietary_restrictions: string;
}

export interface AddGuestbookPayload {
  guest_name: string;
  message: string;
  photo_url?: string;
  reservation_code?: string;
  table_name?: string;
  table_id?: string;
}
