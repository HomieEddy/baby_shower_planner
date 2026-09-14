// AI-assisted thank-you drafts (with template fallback) and delivery.

import type { GiftLog, EventSettings, Guest, Language } from '../types';
import { fromRecord, pb } from './client';
import { getGiftById } from './gifts';
import { DomainError } from '../lib/errors';
import { composeThankYou } from '../lib/compose';
import { notifyChannels, type Channel } from './notify';

function buildFallbackDraft(gift: GiftLog, settings: Partial<EventSettings>, language: Language): string {
  const parents = settings.parentsNames?.trim() || (language === 'EN' ? 'the expecting parents' : 'les futurs parents');
  const baby = settings.babyName?.trim();
  if (language === 'EN') {
    const babyLine = baby
      ? `as we prepare to welcome ${baby}`
      : 'as we prepare to welcome our little one';
    return `Dear ${gift.guest_name},\n\nThank you so much for the wonderful ${gift.gift_description}! Your thoughtfulness and generosity mean the world to us ${babyLine}. We are so lucky to have you in our lives!\n\nWith love and appreciation,\n${parents}`;
  }
  const babyLine = baby
    ? `alors que nous nous préparons à accueillir ${baby}`
    : 'alors que nous nous préparons à accueillir notre petit ange';
  return `Cher/Chère ${gift.guest_name},\n\nUn grand merci pour le magnifique ${gift.gift_description} ! Votre gentillesse et votre générosité nous touchent énormément ${babyLine}. Nous avons tant de chance de vous avoir dans nos vies !\n\nAvec amour et reconnaissance,\n${parents}`;
}

// The gift's guest language drives the draft language (falls back to French).
async function resolveGiftLanguage(gift: GiftLog): Promise<Language> {
  try {
    const records = await pb.collection('guests').getFullList();
    const rec = gift.guest_id
      ? records.find((r) => r.id === gift.guest_id)
      : records.find((r) => r.name === gift.guest_name);
    return rec?.language_pref === 'EN' ? 'EN' : 'FR';
  } catch {
    return 'FR';
  }
}

export async function generateThankYouDraft(gift: GiftLog, settings: Partial<EventSettings>): Promise<string> {
  const language = await resolveGiftLanguage(gift);
  const fallback = buildFallbackDraft(gift, settings, language);
  const apiKey = process.env.THANKYOU_AI_API_KEY;
  if (!apiKey) return fallback;
  try {
    const baseUrl = process.env.THANKYOU_AI_BASE_URL || 'https://opencode.ai/zen/go/v1';
    const model = process.env.THANKYOU_MODEL || 'deepseek-v4-flash';
    const prompt = language === 'EN'
      ? [
        'Write a warm, short thank-you note (under 120 words) for a baby shower gift.',
        `From: ${settings.parentsNames?.trim() || 'the expecting parents'}`,
        settings.babyName?.trim() ? `Celebrating the upcoming arrival of baby ${settings.babyName.trim()}.` : '',
        `To: ${gift.guest_name}`,
        `Gift received: ${gift.gift_description}${gift.category ? ` (category: ${gift.category})` : ''}`,
        'Write in English. Plain text only, no markdown, no subject line. Start with "Dear <name>," and end with a warm sign-off.',
      ].filter(Boolean).join('\n')
      : [
        'Rédigez un mot de remerciement chaleureux et court (moins de 120 mots) pour un cadeau de baby shower.',
        `De la part de : ${settings.parentsNames?.trim() || 'les futurs parents'}`,
        settings.babyName?.trim() ? `En célébration de l'arrivée prochaine de bébé ${settings.babyName.trim()}.` : '',
        `Pour : ${gift.guest_name}`,
        `Cadeau reçu : ${gift.gift_description}${gift.category ? ` (catégorie : ${gift.category})` : ''}`,
        "Rédigez en français. Texte brut uniquement, sans markdown, sans objet. Commencez par « Cher/Chère <nom>, » et terminez par une formule chaleureuse.",
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
  if (!guestRecord) throw new DomainError('GUEST_NOT_FOUND');
  const guest = fromRecord<Guest>(guestRecord);

  const channels: Channel[] = [];
  if (channel === 'email' || channel === 'both') channels.push('email');
  if (channel === 'text' || channel === 'both') channels.push('text');
  const { sent, failed } = await notifyChannels(guest, composeThankYou(guest, text, guest.language_pref), channels);
  if (sent.length === 0 && failed.length === 0) {
    throw new DomainError(channel === 'email' || channel === 'both' ? 'NO_EMAIL' : 'NO_PHONE');
  }
  const now = new Date().toISOString().split('T')[0];
  await pb.collection('gifts').update(giftId, { thank_you_sent: true, thank_you_date: now });
  return { sent, failed };
}