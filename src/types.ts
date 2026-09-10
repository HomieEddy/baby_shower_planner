export type Language = 'EN' | 'FR';

export type DeliveryChannel = 'email' | 'text' | 'both' | 'none';

export interface AttendeeInfo {
  name: string;
  contact?: string; // email or phone number
  magic_token?: string;
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  delivery_channel?: DeliveryChannel;
  code: string; // 4-digit reservation code (e.g. "2026")
  max_party_size: number;
  rsvp_status: 'Pending' | 'Attending' | 'Declined';
  attending_party_size: number;
  attendee_names?: string[]; // Individual full names of all attending party members
  attendee_details?: AttendeeInfo[]; // Detailed attendee list with optional contact info
  dietary_restrictions: string;
  language_pref: Language;
  magic_token: string;
  token_used: boolean;
  created_at: string;
  table_id?: string; // Assigned table ID
  is_read_only?: boolean; // True if this invite is read-only (confirmed by main guest)
  confirmed_by_guest_name?: string; // Main guest name who confirmed attendance
  main_guest_id?: string; // ID of primary guest
  checked_in?: boolean;
  checked_in_at?: string;
  /** Names of party members (excluding the primary guest) who checked in */
  checked_in_names?: string[];
  /** Guest who created this invitation (guest-to-guest invites) */
  invited_by_guest_id?: string;
  /** Denormalized inviter name — survives the inviter being deleted */
  invited_by_guest_name?: string;
  /** Optional note from the inviter to the host */
  guest_note?: string;
  /** Host approval of a self-registration via the universal link. Missing/empty = approved (legacy/host-added). */
  approval_status?: 'pending' | 'approved' | 'rejected';
}

// A lightweight share record for the universal registration link: created when
// a guest invites someone, before that person registers. Becomes `registered`
// (via registered_guest_id) once the invitee self-registers through the link.
export interface GuestInvite {
  id: string;
  inviter_guest_id: string;
  inviter_guest_name: string;
  invitee_name: string;
  /** email or phone, used for dedupe only — delivery is manual (copy/share). */
  contact?: string;
  note?: string;
  /** Guest id once the invitee self-registers through this share link. */
  registered_guest_id?: string;
  created_at: string;
}

// A share link plus the guest it produced (once registered), for the guest's
// "your invitations" list.
export interface GuestInviteView extends GuestInvite {
  invite_url: string;
  invite_message: string;
  registered_guest?: Guest;
}

export interface GuestbookEntry {
  id: string;
  guest_name: string;
  message: string;
  photo_url?: string;
  /** False when the host hid the entry (moderation) */
  visible?: boolean;
  created_at: string;
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
  /** Venue room shape — 'circle'/'ellipse' render a curved boundary; defaults to 'rectangle' for existing data */
  roomShape?: 'rectangle' | 'circle' | 'ellipse';
  tables: TableElement[];
  landmarks: LandmarkElement[];
  updatedAt: string;
}

export interface ScheduleItem {
  id: string;
  time: string;
  titleEn: string;
  titleFr: string;
  descEn?: string;
  descFr?: string;
}

export interface CustomTheme {
  fontFamily: string;
  bg: string;
  ink: string;
  accent: string;
}

export interface EventSettings {
  babyName: string;
  parentsNames: string;
  date: string;
  time: string;
  venueName: string;
  venueAddress: string;
  registryUrl: string;
  /** RSVP deadline (YYYY-MM-DD) shown in invitation messages */
  rsvpDeadline?: string;
  showScheduleTime?: boolean;
  schedule?: ScheduleItem[];
  themeId?: string;
  customTheme?: CustomTheme;
  /** ISO datetimes for the guest content window (guestbook + photo uploads) */
  contentOpenAt?: string;
  contentCloseAt?: string;
  /** Agenda reminder delivery: host contact + channel toggles */
  hostEmail?: string;
  hostPhone?: string;
  reminderChannels?: { email: boolean; sms: boolean };
  /** How long before a task's due time the reminder fires ('1h'|'6h'|'1d'|'2d'|'1w') */
  reminderAdvance?: string;
  /** Language for host-facing reminder templates (EN default) */
  language?: Language;
}

export type AgendaStatus = 'todo' | 'in_progress' | 'done';

export interface AgendaTask {
  id: string;
  title: string;
  description?: string;
  /** YYYY-MM-DD */
  due_date?: string;
  /** HH:mm (24h) */
  due_time?: string;
  status: AgendaStatus;
  /** Ordering within the kanban column */
  position: number;
  reminder_sent: boolean;
  created_at: string;
}

export type AlertType = 'DATE_CHANGE' | 'VENUE_CHANGE' | 'CANCELLATION' | 'CUSTOM' | 'REMINDER';

export interface EventAlert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  created_at: string;
  active: boolean;
  notified_guests_count: number;
  target_audience?: 'ALL' | 'PENDING' | 'ATTENDING';
}

export interface AddGuestPayload {
  name: string;
  email?: string;
  phone?: string;
  delivery_channel?: DeliveryChannel;
  max_party_size?: number;
  language_pref: Language;
}

// Self-registration through the universal link. The registrant confirms their
// own guestlist up front; approval just unlocks the record (no second RSVP).
export interface RegisterGuestPayload {
  name: string;
  email?: string;
  phone?: string;
  language_pref: Language;
  /** Full guest list including the registrant (index 0). */
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

export interface EventPhoto {
  id: string;
  url: string;
  filename: string;
  caption?: string;
  uploader_name?: string;
  table_name?: string;
  table_id?: string;
  /** Reservation code of the uploading guest (per-guest quota) */
  reservation_code?: string;
  /** Stored file size in bytes (per-guest quota) */
  file_size?: number;
  /** False when the host hid the photo (moderation) */
  visible?: boolean;
  created_at: string;
}

export interface AddGuestbookPayload {
  guest_name: string;
  message: string;
  photo_url?: string;
}

export interface GiftLog {
  id: string;
  guest_name: string;
  guest_id?: string;
  gift_description: string;
  category?: 'Clothing' | 'Nursery' | 'Toys' | 'Feeding' | 'Diapering' | 'Other';
  thank_you_sent: boolean;
  thank_you_date?: string;
  created_at: string;
}

