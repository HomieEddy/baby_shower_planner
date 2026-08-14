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
  rsvp_status: z.enum(['Pending', 'Attending', 'Declined']),
});

export const GuestContactSchema = z.object({
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  delivery_channel: z.enum(['none', 'email', 'text', 'both']),
});

export const GuestInviteSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact: z.string().optional(),
  channel: z.enum(['link-only', 'email', 'text', 'both']),
  note: z.string().optional(),
});

export const GuestbookEntrySchema = z.object({
  guest_name: z.string().min(1, 'Guest name is required'),
  message: z.string().min(1, 'Message is required'),
  photo_url: z.string().optional(),
});

export const GiftLogSchema = z.object({
  guest_name: z.string().min(1, 'Guest name is required'),
  guest_id: z.string().optional(),
  gift_description: z.string().min(1, 'Gift description is required'),
  category: z.enum(['Nursery', 'Clothing', 'Toys', 'Feeding', 'Diapering', 'Other']).default('Nursery'),
});
