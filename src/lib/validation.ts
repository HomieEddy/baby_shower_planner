import { z } from 'zod';

export const GuestRsvpSchema = z.object({
  rsvp_status: z.enum(['Attending', 'Declined']),
  attending_party_size: z.number().min(1).max(20),
  dietary_restrictions: z.string().optional(),
});

export const GuestImportSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  delivery_channel: z.enum(['email', 'text', 'both', 'none']).default('email'),
  max_party_size: z.number().min(1).default(1),
  language_pref: z.enum(['EN', 'FR']).default('FR'),
});

export const EditGuestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().optional().or(z.literal('')),
  phone: z.string().optional(),
  delivery_channel: z.enum(['email', 'text', 'both', 'none']),
  max_party_size: z.number().min(1).max(20),
  attending_party_size: z.number().min(0).max(20),
  rsvp_status: z.enum(['Pending', 'Attending', 'Declined']),
});

export const GuestbookEntrySchema = z.object({
  guest_name: z.string().min(1, 'Guest name is required').max(80, 'Guest name is too long'),
  message: z.string().min(1, 'Message is required').max(2000, 'Message is too long'),
  photo_url: z.string().optional(),
});

export const GiftLogSchema = z.object({
  guest_name: z.string().min(1, 'Guest name is required'),
  guest_id: z.string().optional(),
  gift_description: z.string().min(1, 'Gift description is required'),
  category: z.enum(['Nursery', 'Clothing', 'Toys', 'Feeding', 'Diapering', 'Other']).default('Nursery'),
});

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').or(z.literal('')).optional();
const optionalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)').or(z.literal('')).optional();

export const AgendaTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  due_date: optionalDate,
  due_time: optionalTime,
  status: z.enum(['todo', 'in_progress', 'done']),
});

export const AgendaReorderSchema = z.array(z.object({
  id: z.string().min(1),
  status: z.enum(['todo', 'in_progress', 'done']),
  position: z.number().int().min(0),
}));

export const ReminderSettingsSchema = z.object({
  hostEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  hostPhone: z.string().optional(),
  reminderChannels: z.object({ email: z.boolean(), sms: z.boolean() }).optional(),
  reminderAdvance: z.enum(['1h', '6h', '1d', '2d', '1w']).optional(),
  language: z.enum(['EN', 'FR']).optional(),
});
