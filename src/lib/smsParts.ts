// What a guest actually receives by SMS, without the Twilio transport, so the
// admin preview and the sender share one rule. The full text is folded to GSM-7
// and split into standalone texts of up to 160 characters; nothing is cut off.

import { renderSms, type MessageContent } from './compose';
import { foldToGsm, splitSms } from './gsm7';

export const smsText = (content: MessageContent): string =>
  foldToGsm(renderSms(content, Number.POSITIVE_INFINITY));

export const smsParts = (content: MessageContent): string[] => splitSms(smsText(content));
