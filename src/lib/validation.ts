import { z } from 'zod';
import {
  AgendaTaskSchema as Agenda,
  GiftSchema as Gift,
  GuestSchema as Guest,
  GuestbookSchema as Guestbook,
  SettingsSchema as Settings,
} from './domain';

// Form and payload schemas, derived from the domain schemas in lib/domain.ts so
// a field added there flows to every form without a second declaration. These
// add the input-only concerns the stored shape deliberately omits: defaults,
// format/length rules, and looser optionality.

// Plain predicates so routes/pages can validate a single value without
// re-declaring the format the schemas above already express.
export const isValidEmail = (email: string): boolean => z.string().email().safeParse(email).success;
export const isValidCode = (code: string): boolean => /^\d{4}$/.test(code);

export const GuestRsvpSchema = Guest.pick({
  rsvp_status: true,
  attending_party_size: true,
  dietary_restrictions: true,
  attendee_details: true,
  attendee_names: true,
}).extend({
  rsvp_status: z.enum(['Attending', 'Declined']),
  attending_party_size: z.coerce.number().min(1).max(20).optional(),
  dietary_restrictions: z.string().optional(),
});

export const GuestImportSchema = Guest.pick({
  name: true,
  email: true,
  phone: true,
  delivery_channel: true,
  max_party_size: true,
  language_pref: true,
}).extend({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  max_party_size: z.number().min(1).default(1),
  delivery_channel: z.enum(['email', 'text', 'both', 'none']).default('email'),
  language_pref: z.enum(['EN', 'FR']).default('FR'),
});

// Covers the whole domain (so no guest field is silently stripped on update)
// with the form's editable fields kept required.
export const EditGuestSchema = Guest.partial().extend({
  name: z.string().min(1, 'Name is required'),
  email: z.string().optional().or(z.literal('')),
  delivery_channel: z.enum(['email', 'text', 'both', 'none']),
  max_party_size: z.number().min(1).max(20),
  attending_party_size: z.number().min(0).max(20),
  rsvp_status: z.enum(['Pending', 'Attending', 'Declined']),
});

export const GuestbookEntrySchema = Guestbook.pick({
  guest_name: true,
  message: true,
  photo_url: true,
}).extend({
  guest_name: z.string().min(1, 'Guest name is required').max(80, 'Guest name is too long'),
  message: z.string().min(1, 'Message is required').max(2000, 'Message is too long'),
});

export const GiftLogSchema = Gift.pick({
  guest_name: true,
  guest_id: true,
  gift_description: true,
  category: true,
}).extend({
  guest_name: z.string().min(1, 'Guest name is required'),
  gift_description: z.string().min(1, 'Gift description is required'),
  category: z.enum(['Nursery', 'Clothing', 'Toys', 'Feeding', 'Diapering', 'Other']).default('Nursery'),
});

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').or(z.literal('')).optional();
const optionalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)').or(z.literal('')).optional();

export const AgendaTaskSchema = Agenda.pick({
  title: true,
  description: true,
  due_date: true,
  due_time: true,
  status: true,
}).extend({
  title: z.string().min(1, 'Task title is required'),
  due_date: optionalDate,
  due_time: optionalTime,
});

export const AgendaReorderSchema = z.array(z.object({
  id: z.string().min(1),
  status: z.enum(['todo', 'in_progress', 'done']),
  position: z.number().int().min(0),
}));

export const ReminderSettingsSchema = Settings.pick({
  hostEmail: true,
  hostPhone: true,
  reminderChannels: true,
  reminderAdvance: true,
  language: true,
}).extend({
  hostEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
});
