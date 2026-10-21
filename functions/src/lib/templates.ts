import { gsm7Length, type Locale, SMS_SINGLE_LENGTH, toGsm7 } from '@siteline/shared';

// Message templates (PRD section 6). Text messages stay within 160 GSM-7 characters: names are
// shortened when needed, and characters outside GSM-7 are replaced.

export type TemplateName =
  | 'clientInvite'
  | 'staffInvite'
  | 'clientQuestion'
  | 'clientComment'
  | 'staffReply'
  | 'newLinkRequested';

type Params = Record<string, string>;

interface Rendered {
  sms: string;
  subject: string;
  text: string;
}

type Copy = (p: Params) => Rendered;

const footer = {
  sv: (p: Params) => `\n\nÄndra dina aviseringar: ${p['settingsLink']}`,
  en: (p: Params) => `\n\nChange your notifications: ${p['settingsLink']}`,
};

const TEMPLATES: Record<TemplateName, Record<Locale, Copy>> = {
  clientInvite: {
    sv: (p) => ({
      sms: `Hej ${p['firstName']}! ${p['firm']} delar uppdateringar om ${p['project']} här: ${p['link']}`,
      subject: `${p['firm']} delar uppdateringar om ${p['project']}`,
      text: `Hej ${p['firstName']}!\n\n${p['firm']} delar uppdateringar om ${p['project']} här:\n${p['link']}`,
    }),
    en: (p) => ({
      sms: `Hi ${p['firstName']}! ${p['firm']} shares updates on ${p['project']} here: ${p['link']}`,
      subject: `${p['firm']} shares updates on ${p['project']}`,
      text: `Hi ${p['firstName']}!\n\n${p['firm']} shares updates on ${p['project']} here:\n${p['link']}`,
    }),
  },
  staffInvite: {
    sv: (p) => ({
      sms: `${p['firm']} har bjudit in dig till Siteline: ${p['link']}`,
      subject: `${p['firm']} har bjudit in dig till Siteline`,
      text: `Hej ${p['firstName']}!\n\n${p['inviter']} har bjudit in dig till ${p['firm']} på Siteline. Öppna länken för att gå med:\n${p['link']}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} invited you to Siteline: ${p['link']}`,
      subject: `${p['firm']} invited you to Siteline`,
      text: `Hi ${p['firstName']}!\n\n${p['inviter']} invited you to join ${p['firm']} on Siteline. Open the link to join:\n${p['link']}`,
    }),
  },
  clientQuestion: {
    sv: (p) => ({
      sms: `${p['client']} har ställt en fråga om ${p['project']}: ${p['link']}`,
      subject: `${p['client']} har ställt en fråga om ${p['project']}`,
      text: `${p['client']} har ställt en fråga om ${p['project']}.\n\nSvara här: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['client']} asked a question about ${p['project']}: ${p['link']}`,
      subject: `${p['client']} asked a question about ${p['project']}`,
      text: `${p['client']} asked a question about ${p['project']}.\n\nReply here: ${p['link']}${footer.en(p)}`,
    }),
  },
  clientComment: {
    sv: (p) => ({
      sms: `${p['client']} har kommenterat i ${p['project']}: ${p['link']}`,
      subject: `${p['client']} har kommenterat i ${p['project']}`,
      text: `${p['client']} har kommenterat i ${p['project']}.\n\nSe kommentaren: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['client']} commented on ${p['project']}: ${p['link']}`,
      subject: `${p['client']} commented on ${p['project']}`,
      text: `${p['client']} commented on ${p['project']}.\n\nSee the comment: ${p['link']}${footer.en(p)}`,
    }),
  },
  staffReply: {
    sv: (p) => ({
      sms: `${p['firm']} har svarat dig om ${p['project']}: ${p['link']}`,
      subject: `${p['firm']} har svarat dig om ${p['project']}`,
      text: `${p['firm']} har svarat dig om ${p['project']}.\n\nLäs svaret: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} replied to you about ${p['project']}: ${p['link']}`,
      subject: `${p['firm']} replied to you about ${p['project']}`,
      text: `${p['firm']} replied to you about ${p['project']}.\n\nRead the reply: ${p['link']}${footer.en(p)}`,
    }),
  },
  newLinkRequested: {
    sv: (p) => ({
      sms: `${p['client']} ber om en ny länk till ${p['project']}: ${p['link']}`,
      subject: `${p['client']} ber om en ny länk till ${p['project']}`,
      text: `${p['client']} försökte öppna ${p['project']} med en länk som inte längre fungerar och ber om en ny.\n\nSkicka en ny länk under Personer: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['client']} asked for a new link to ${p['project']}: ${p['link']}`,
      subject: `${p['client']} asked for a new link to ${p['project']}`,
      text: `${p['client']} tried to open ${p['project']} with a link that no longer works and asks for a new one.\n\nSend a new link under People: ${p['link']}${footer.en(p)}`,
    }),
  },
};

/** Params that may be shortened, longest first, to fit a text message. */
const SHORTENABLE = ['project', 'firm', 'client', 'firstName'];

export function render(template: TemplateName, locale: Locale, params: Params): Rendered {
  const copy = TEMPLATES[template][locale];
  const rendered = copy(params);
  return { ...rendered, sms: fitSms(copy, params) };
}

function fitSms(copy: Copy, params: Params): string {
  const clean = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, toGsm7(v)]));
  let sms = copy(clean).sms;
  const shortened = { ...clean };
  while (gsm7Length(sms) > SMS_SINGLE_LENGTH) {
    const key = SHORTENABLE.filter((k) => (shortened[k]?.length ?? 0) > 8).sort(
      (a, b) => shortened[b]!.length - shortened[a]!.length,
    )[0];
    if (!key) break;
    const value = shortened[key]!;
    shortened[key] =
      `${value.slice(0, Math.max(8, value.length - (gsm7Length(sms) - SMS_SINGLE_LENGTH) - 3)).trimEnd()}...`;
    sms = copy(shortened).sms;
  }
  return sms;
}

/**
 * The text message sender: the firm's name when it fits an alphanumeric sender ID (letters and
 * digits, starting with a letter, up to 11 characters), otherwise "Siteline" (PRD section 6).
 */
export function smsSenderName(firm: string): string {
  const ascii = firm
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'och')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^[A-Za-z][A-Za-z0-9 ]{2,10}$/.test(ascii)) return ascii;
  const firstWords = ascii.split(' ').reduce((acc, word) => {
    const next = acc ? `${acc} ${word}` : word;
    return next.length <= 11 ? next : acc;
  }, '');
  return /^[A-Za-z][A-Za-z0-9 ]{2,10}$/.test(firstWords) ? firstWords : 'Siteline';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
