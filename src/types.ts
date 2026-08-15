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
}

export interface GuestbookEntry {
  id: string;
  guest_name: string;
  message: string;
  photo_url?: string;
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
  type: 'entrance' | 'stage' | 'gifts' | 'dessert' | 'photobooth' | 'bar' | 'dj' | 'restroom' | 'food' | 'custom';
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
  showScheduleTime?: boolean;
  schedule?: ScheduleItem[];
  themeId?: string;
  customTheme?: CustomTheme;
  /** ISO datetimes for the guest content window (guestbook + photo uploads) */
  contentOpenAt?: string;
  contentCloseAt?: string;
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
  created_at: string;
  likes?: number;
}

export interface AddGuestbookPayload {
  guest_name: string;
  message: string;
  photo_url?: string;
}

export interface BabyPrediction {
  id: string;
  guest_name: string;
  guest_id?: string;
  predicted_date: string; // e.g. "2026-09-18"
  predicted_weight_lbs: number; // e.g. 7.5
  predicted_hair_color: string; // e.g. "Brown", "Blonde", "Black"
  predicted_eye_color: string; // e.g. "Brown", "Blue", "Green", "Hazel"
  advice_for_parents: string;
  created_at: string;
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

