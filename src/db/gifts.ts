// Gift log CRUD.

import type { GiftLog } from '../types';
import { fromRecord, pb } from './client';

export async function getGifts(): Promise<GiftLog[]> {
  const records = await pb.collection('gifts').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<GiftLog>(r));
}

export async function addGift(payload: Omit<GiftLog, 'id' | 'created_at' | 'thank_you_sent'>): Promise<GiftLog> {
  const r = await pb.collection('gifts').create({
    guest_name: payload.guest_name, guest_id: payload.guest_id || '',
    gift_description: payload.gift_description, category: payload.category || 'Other',
    thank_you_sent: false, created_at: new Date().toISOString(),
  });
  return fromRecord<GiftLog>(r);
}

export async function toggleGiftThankYou(id: string): Promise<GiftLog | undefined> {
  try {
    const r = await pb.collection('gifts').getOne(id);
    const now = new Date().toISOString().split('T')[0];
    const updated = await pb.collection('gifts').update(id, {
      thank_you_sent: !r.thank_you_sent,
      thank_you_date: !r.thank_you_sent ? now : null,
    });
    return fromRecord<GiftLog>(updated);
  } catch { return undefined; }
}

export async function deleteGift(id: string): Promise<void> {
  await pb.collection('gifts').delete(id);
}

export async function getGiftById(id: string): Promise<GiftLog> {
  const r = await pb.collection('gifts').getOne(id);
  return fromRecord<GiftLog>(r);
}