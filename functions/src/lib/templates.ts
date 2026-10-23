import { gsm7Length, type Locale, SMS_SINGLE_LENGTH, toGsm7 } from '@siteline/shared';

// Message templates (PRD section 6). Text messages stay within 160 GSM-7 characters: names are
// shortened when needed, and characters outside GSM-7 are replaced.

export type TemplateName =
  | 'clientInvite'
  | 'clientSignIn'
  | 'paymentFailed'
  | 'handoverReady'
  | 'aftercareReminder'
  | 'bookingRequest'
  | 'staffInvite'
  | 'clientQuestion'
  | 'clientComment'
  | 'staffReply'
  | 'newLinkRequested'
  | 'decisionSent'
  | 'decisionChanged'
  | 'decisionWithdrawn'
  | 'decisionAnswered'
  | 'visitChanged'
  | 'visitCancelled'
  | 'visitReminderClient'
  | 'visitReminderStaff'
  | 'visitReport'
  | 'visitChangeRequested'
  | 'visitChangeDeclined'
  | 'digest'
  | 'newUpdate'
  | 'activity'
  | 'smsBudgetReached';

type Params = Record<string, string>;

interface Rendered {
  sms: string;
  subject: string;
  text: string;
}

type Copy = (p: Params) => Rendered;

// The invite card in the digest email (F20); texts stay short, so they leave it out.
const invite = {
  sv: (p: Params) =>
    p['inviteLink']
      ? `\n\nFår du annat gjort hemma? Bjud in dem till Siteline: ${p['inviteLink']}`
      : '',
  en: (p: Params) =>
    p['inviteLink']
      ? `\n\nGetting other work done at home? Invite them to Siteline: ${p['inviteLink']}`
      : '',
};

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
  clientSignIn: {
    sv: (p) => ({
      sms: `Din inloggningslänk till Siteline: ${p['link']} Den fungerar en gång i 30 minuter.`,
      subject: 'Din inloggningslänk till Siteline',
      text: `Logga in på Siteline med den här länken:\n${p['link']}\n\nDen fungerar en gång i 30 minuter. Bad du inte om den kan du strunta i det här meddelandet.`,
    }),
    en: (p) => ({
      sms: `Your Siteline sign-in link: ${p['link']} It works once, for 30 minutes.`,
      subject: 'Your Siteline sign-in link',
      text: `Sign in to Siteline with this link:\n${p['link']}\n\nIt works once, for 30 minutes. If you didn't ask for it, you can ignore this message.`,
    }),
  },
  handoverReady: {
    sv: (p) => ({
      sms: `Ditt överlämningspaket från ${p['firm']} är klart: ${p['link']}`,
      subject: `Ditt överlämningspaket från ${p['firm']} är klart`,
      text: `${p['firm']} har gjort klart överlämningspaketet för ${p['project']}: sammanfattning, material, garantier och alla godkända tillägg.\n\nLadda ner det här:\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `Your handover pack from ${p['firm']} is ready: ${p['link']}`,
      subject: `Your handover pack from ${p['firm']} is ready`,
      text: `${p['firm']} has finished the handover pack for ${p['project']}: summary, materials, warranties and every approved extra.\n\nDownload it here:\n${p['link']}${footer.en(p)}`,
    }),
  },
  aftercareReminder: {
    sv: (p) => ({
      sms: `Påminnelse från ${p['firm']}: ${p['title']}. Boka ${p['firm']} igen: ${p['link']}`,
      subject: `Påminnelse från ${p['firm']}: ${p['title']}`,
      text: `${p['title']}\n\n${p['note'] ? `${p['note']}\n\n` : ''}Boka ${p['firm']} igen:\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `Reminder from ${p['firm']}: ${p['title']}. Book ${p['firm']} again: ${p['link']}`,
      subject: `Reminder from ${p['firm']}: ${p['title']}`,
      text: `${p['title']}\n\n${p['note'] ? `${p['note']}\n\n` : ''}Book ${p['firm']} again:\n${p['link']}${footer.en(p)}`,
    }),
  },
  bookingRequest: {
    sv: (p) => ({
      sms: `${p['client']} vill boka igen (${p['project']}): ${p['link']}`,
      subject: `${p['client']} vill boka igen`,
      text: `${p['client']} vill boka er igen, från projektet ${p['project']}.\n\nSe förfrågan i Siteline:\n${p['link']}`,
    }),
    en: (p) => ({
      sms: `${p['client']} wants to book again (${p['project']}): ${p['link']}`,
      subject: `${p['client']} wants to book again`,
      text: `${p['client']} wants to book you again, from the project ${p['project']}.\n\nSee the request in Siteline:\n${p['link']}`,
    }),
  },
  paymentFailed: {
    sv: (p) => ({
      sms: `Betalningen för Siteline gick inte igenom. Uppdatera kortet här: ${p['link']}`,
      subject: 'Betalningen för Siteline gick inte igenom',
      text: `Vi kunde inte dra betalningen för ert Siteline-abonnemang. Uppdatera kortet här, så fortsätter allt som vanligt:\n${p['link']}`,
    }),
    en: (p) => ({
      sms: `Your Siteline payment didn't go through. Update your card here: ${p['link']}`,
      subject: "Your Siteline payment didn't go through",
      text: `We couldn't take the payment for your Siteline plan. Update your card here and everything carries on as usual:\n${p['link']}`,
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
  decisionSent: {
    sv: (p) => ({
      sms: `${p['firm']} behöver ditt svar: ${p['title']}${p['price'] ? `, ${p['price']}` : ''}. Svara här: ${p['link']}`,
      subject: `${p['firm']} behöver ditt svar: ${p['title']}`,
      text: `${p['firm']} behöver ditt svar på ${p['project']}:\n\n${p['title']}${p['price'] ? `, ${p['price']}` : ''}\n\nSvara här: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} needs your answer: ${p['title']}${p['price'] ? `, ${p['price']}` : ''}. Answer here: ${p['link']}`,
      subject: `${p['firm']} needs your answer: ${p['title']}`,
      text: `${p['firm']} needs your answer on ${p['project']}:\n\n${p['title']}${p['price'] ? `, ${p['price']}` : ''}\n\nAnswer here: ${p['link']}${footer.en(p)}`,
    }),
  },
  decisionChanged: {
    sv: (p) => ({
      sms: `${p['firm']} har ändrat ett beslut: ${p['title']}${p['price'] ? `, ${p['price']}` : ''}. Svara här: ${p['link']}`,
      subject: `${p['firm']} har ändrat ett beslut: ${p['title']}`,
      text: `${p['firm']} har ändrat ett beslut på ${p['project']}. Den tidigare versionen gäller inte längre.\n\nSvara här: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} changed a decision: ${p['title']}${p['price'] ? `, ${p['price']}` : ''}. Answer here: ${p['link']}`,
      subject: `${p['firm']} changed a decision: ${p['title']}`,
      text: `${p['firm']} changed a decision on ${p['project']}. The earlier version no longer applies.\n\nAnswer here: ${p['link']}${footer.en(p)}`,
    }),
  },
  decisionWithdrawn: {
    sv: (p) => ({
      sms: `${p['firm']} har dragit tillbaka ett beslut: ${p['title']}. ${p['link']}`,
      subject: `${p['firm']} har dragit tillbaka ett beslut`,
      text: `${p['firm']} har dragit tillbaka beslutet ${p['title']} på ${p['project']}. Du behöver inte svara.\n\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} withdrew a decision: ${p['title']}. ${p['link']}`,
      subject: `${p['firm']} withdrew a decision`,
      text: `${p['firm']} withdrew the decision ${p['title']} on ${p['project']}. You don't need to answer.\n\n${p['link']}${footer.en(p)}`,
    }),
  },
  decisionAnswered: {
    sv: (p) => ({
      sms: `${p['client']} har ${p['outcome']}: ${p['title']}. ${p['link']}`,
      subject: `${p['client']} har ${p['outcome']}: ${p['title']}`,
      text: `${p['client']} har ${p['outcome']} ${p['title']} på ${p['project']}.\n\nSe beslutet: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['client']} ${p['outcome']}: ${p['title']}. ${p['link']}`,
      subject: `${p['client']} ${p['outcome']}: ${p['title']}`,
      text: `${p['client']} ${p['outcome']} ${p['title']} on ${p['project']}.\n\nSee the decision: ${p['link']}${footer.en(p)}`,
    }),
  },
  visitChanged: {
    sv: (p) => ({
      sms: `${p['firm']}: nästa besök är ${p['when']}. ${p['link']}`,
      subject: `${p['firm']}: nästa besök är ${p['when']}`,
      text: `${p['firm']} har bokat eller flyttat besöket på ${p['project']} till ${p['when']}.\n\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']}: the next visit is ${p['when']}. ${p['link']}`,
      subject: `${p['firm']}: the next visit is ${p['when']}`,
      text: `${p['firm']} booked or moved the visit for ${p['project']} to ${p['when']}.\n\n${p['link']}${footer.en(p)}`,
    }),
  },
  visitCancelled: {
    sv: (p) => ({
      sms: `${p['firm']} har ställt in besöket ${p['when']}. ${p['link']}`,
      subject: `${p['firm']} har ställt in besöket ${p['when']}`,
      text: `${p['firm']} har ställt in besöket ${p['when']} för ${p['project']}.\n\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} cancelled the visit on ${p['when']}. ${p['link']}`,
      subject: `${p['firm']} cancelled the visit on ${p['when']}`,
      text: `${p['firm']} cancelled the visit on ${p['when']} for ${p['project']}.\n\n${p['link']}${footer.en(p)}`,
    }),
  },
  visitReminderClient: {
    sv: (p) => ({
      sms: `Påminnelse: ${p['firm']} kommer imorgon kl. ${p['time']}.${p['items'] ? ` Kvar på din lista: ${p['items']}.` : ''} ${p['link']}`,
      subject: `Påminnelse: ${p['firm']} kommer imorgon kl. ${p['time']}`,
      text: `${p['firm']} kommer imorgon kl. ${p['time']}.${p['items'] ? `\n\nKvar på din lista: ${p['items']}` : ''}\n\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `Reminder: ${p['firm']} is coming tomorrow at ${p['time']}.${p['items'] ? ` Left on your list: ${p['items']}.` : ''} ${p['link']}`,
      subject: `Reminder: ${p['firm']} is coming tomorrow at ${p['time']}`,
      text: `${p['firm']} is coming tomorrow at ${p['time']}.${p['items'] ? `\n\nLeft on your list: ${p['items']}` : ''}\n\n${p['link']}${footer.en(p)}`,
    }),
  },
  visitReminderStaff: {
    sv: (p) => ({
      sms: `Imorgon kl. ${p['time']}: ${p['project']}.${p['items'] ? ` Kvar: ${p['items']}.` : ''} ${p['link']}`,
      subject: `Imorgon kl. ${p['time']}: ${p['project']}`,
      text: `Besök imorgon kl. ${p['time']}: ${p['project']}.${p['items'] ? `\n\nKvar på företagets lista: ${p['items']}` : ''}\n\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `Tomorrow at ${p['time']}: ${p['project']}.${p['items'] ? ` Left: ${p['items']}.` : ''} ${p['link']}`,
      subject: `Tomorrow at ${p['time']}: ${p['project']}`,
      text: `Visit tomorrow at ${p['time']}: ${p['project']}.${p['items'] ? `\n\nLeft on the company's list: ${p['items']}` : ''}\n\n${p['link']}${footer.en(p)}`,
    }),
  },
  visitReport: {
    sv: (p) => ({
      sms: `${p['firm']} har skickat en rapport från besöket ${p['date']}: ${p['link']}`,
      subject: `Rapport från besöket ${p['date']}`,
      text: `${p['firm']} har skickat en rapport från besöket ${p['date']} (${p['project']}).\n\nLäs den här: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} sent a report from the visit on ${p['date']}: ${p['link']}`,
      subject: `Report from the visit on ${p['date']}`,
      text: `${p['firm']} sent a report from the visit on ${p['date']} (${p['project']}).\n\nRead it here: ${p['link']}${footer.en(p)}`,
    }),
  },
  visitChangeRequested: {
    sv: (p) => ({
      sms: `${p['client']} vill ${p['action']} besöket ${p['when']}: ${p['link']}`,
      subject: `${p['client']} vill ${p['action']} besöket ${p['when']}`,
      text: `${p['client']} vill ${p['action']} besöket ${p['when']} (${p['project']}).${p['note'] ? `\n\n"${p['note']}"` : ''}\n\nSvara här: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['client']} wants to ${p['action']} the visit on ${p['when']}: ${p['link']}`,
      subject: `${p['client']} wants to ${p['action']} the visit on ${p['when']}`,
      text: `${p['client']} wants to ${p['action']} the visit on ${p['when']} (${p['project']}).${p['note'] ? `\n\n"${p['note']}"` : ''}\n\nAnswer here: ${p['link']}${footer.en(p)}`,
    }),
  },
  visitChangeDeclined: {
    sv: (p) => ({
      sms: `${p['firm']} kunde inte ändra besöket ${p['when']}. Det blir som planerat. ${p['link']}`,
      subject: `Besöket ${p['when']} blir som planerat`,
      text: `${p['firm']} kunde inte ändra besöket ${p['when']}. Det blir som planerat.\n\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} couldn't change the visit on ${p['when']}. It goes ahead as planned. ${p['link']}`,
      subject: `The visit on ${p['when']} goes ahead as planned`,
      text: `${p['firm']} couldn't change the visit on ${p['when']}. It goes ahead as planned.\n\n${p['link']}${footer.en(p)}`,
    }),
  },
  digest: {
    sv: (p) => ({
      sms: `Idag på ${p['project']}: ${p['summary']}. Se dem här: ${p['link']}`,
      subject: `Idag på ${p['project']}: ${p['summary']}`,
      text: `Idag på ${p['project']}: ${p['summary']}.\n\nSe dem här: ${p['link']}${invite.sv(p)}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `Today on ${p['project']}: ${p['summary']}. See them here: ${p['link']}`,
      subject: `Today on ${p['project']}: ${p['summary']}`,
      text: `Today on ${p['project']}: ${p['summary']}.\n\nSee them here: ${p['link']}${invite.en(p)}${footer.en(p)}`,
    }),
  },
  newUpdate: {
    sv: (p) => ({
      sms: `Ny uppdatering från ${p['firm']} om ${p['project']}: ${p['link']}`,
      subject: `Ny uppdatering om ${p['project']}`,
      text: `${p['firm']} har publicerat en uppdatering om ${p['project']}.\n\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `New update from ${p['firm']} on ${p['project']}: ${p['link']}`,
      subject: `New update on ${p['project']}`,
      text: `${p['firm']} posted an update on ${p['project']}.\n\n${p['link']}${footer.en(p)}`,
    }),
  },
  activity: {
    sv: (p) => ({
      sms: `${p['count']} fler händelser i ${p['project']}: ${p['link']}`,
      subject: `${p['count']} fler händelser i ${p['project']}`,
      text: `Det har hänt ${p['count']} saker till i ${p['project']} de senaste minuterna.\n\n${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['count']} more updates on ${p['project']}: ${p['link']}`,
      subject: `${p['count']} more updates on ${p['project']}`,
      text: `${p['count']} more things happened on ${p['project']} in the last few minutes.\n\n${p['link']}${footer.en(p)}`,
    }),
  },
  smsBudgetReached: {
    sv: (p) => ({
      sms: `Månadens sms är slut för ${p['firm']}. Meddelanden skickas nu som e-post. ${p['link']}`,
      subject: `Månadens sms är slut för ${p['firm']}`,
      text: `${p['firm']} har använt alla ${p['limit']} sms som ingår i abonnemanget den här månaden. Meddelanden skickas nu som e-post när det går, tills månaden är slut.\n\nSe ditt abonnemang: ${p['link']}${footer.sv(p)}`,
    }),
    en: (p) => ({
      sms: `${p['firm']} has used this month's text messages. Messages now go by email. ${p['link']}`,
      subject: `${p['firm']} has used this month's text messages`,
      text: `${p['firm']} has used all ${p['limit']} text messages in its plan this month. Messages now go by email where possible, until the month ends.\n\nSee your plan: ${p['link']}${footer.en(p)}`,
    }),
  },
};

/** Params that may be shortened, longest first, to fit a text message. */
const SHORTENABLE = ['items', 'title', 'project', 'firm', 'client', 'firstName'];

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
