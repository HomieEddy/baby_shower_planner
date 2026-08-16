// AI-assisted thank-you drafts (with template fallback) and delivery.

import type { GiftLog, EventSettings, Guest } from '../types';
import { fromRecord, pb } from './client';
import { getGiftById } from './gifts';

function buildFallbackDraft(gift: GiftLog, settings: Partial<EventSettings>): string {
  const parents = settings.parentsNames?.trim() || 'the expecting parents';
  const baby = settings.babyName?.trim();
  const babyLine = baby
    ? `as we prepare to welcome ${baby}`
    : 'as we prepare to welcome our little one';
  return `Dear ${gift.guest_name},\n\nThank you so much for the wonderful ${gift.gift_description}! Your thoughtfulness and generosity mean the world to us ${babyLine}. We are so lucky to have you in our lives!\n\nWith love and appreciation,\n${parents}`;
}

export async function generateThankYouDraft(gift: GiftLog, settings: Partial<EventSettings>): Promise<string> {
  const fallback = buildFallbackDraft(gift, settings);
  const apiKey = process.env.THANKYOU_AI_API_KEY;
  if (!apiKey) return fallback;
  try {
    const baseUrl = process.env.THANKYOU_AI_BASE_URL || 'https://opencode.ai/zen/go/v1';
    const model = process.env.THANKYOU_MODEL || 'deepseek-v4-flash';
    const prompt = [
      'Write a warm, short thank-you note (under 120 words) for a baby shower gift.',
      `From: ${settings.parentsNames?.trim() || 'the expecting parents'}`,
      settings.babyName?.trim() ? `Celebrating the upcoming arrival of baby ${settings.babyName.trim()}.` : '',
      `To: ${gift.guest_name}`,
      `Gift received: ${gift.gift_description}${gift.category ? ` (category: ${gift.category})` : ''}`,
      'Plain text only, no markdown, no subject line. Start with "Dear <name>," and end with a warm sign-off.',
    ].filter(Boolean).join('\n');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });
    if (!response.ok) {
      console.error(`[THANKYOU-AI] API ${response.status}: ${await response.text()}`);
      return fallback;
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || fallback;
  } catch (err) {
    console.error('[THANKYOU-AI] Draft generation failed:', err);
    return fallback;
  }
}

export async function sendGiftThankYou(
  giftId: string,
  channel: 'email' | 'text' | 'both',
  text: string
): Promise<{ sent: string[]; failed: string[] }> {
  const gift = await getGiftById(giftId);
  const records = await pb.collection('guests').getFullList();
  const guestRecord = gift.guest_id
    ? records.find((r) => r.id === gift.guest_id)
    : records.find((r) => r.name === gift.guest_name);
  if (!guestRecord) throw new Error('GUEST_NOT_FOUND');
  const guest = fromRecord<Guest>(guestRecord);

  const sent: string[] = [];
  const failed: string[] = [];
  if ((channel === 'email' || channel === 'both') && guest.email) {
    const { sendThankYouEmail } = await import('../lib/email');
    if (await sendThankYouEmail(guest, text)) sent.push('email');
    else failed.push('email');
  }
  if ((channel === 'text' || channel === 'both') && guest.phone) {
    const { sendThankYouSms } = await import('../lib/sms');
    if (await sendThankYouSms(guest, text)) sent.push('text');
    else failed.push('text');
  }
  if (sent.length === 0 && failed.length === 0) {
    throw new Error(channel === 'email' || channel === 'both' ? 'NO_EMAIL' : 'NO_PHONE');
  }
  const now = new Date().toISOString().split('T')[0];
  await pb.collection('gifts').update(giftId, { thank_you_sent: true, thank_you_date: now });
  return { sent, failed };
}