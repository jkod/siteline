import { gsm7Length, isGsm7 } from '@siteline/shared';

import { firstName, render, smsSenderName } from './templates';

const link = `https://app.siteline.se/p/${'x'.repeat(43)}`;

describe('render', () => {
  it('renders the PRD invite text in Swedish', () => {
    const { sms } = render('clientInvite', 'sv', {
      firstName: 'Anna',
      firm: 'Ek & Lind Snickeri',
      project: 'Köksrenovering Lindqvist',
      link,
    });
    expect(sms).toBe(
      `Hej Anna! Ek & Lind Snickeri delar uppdateringar om Köksrenovering Lindqvist här: ${link}`,
    );
    expect(isGsm7(sms)).toBe(true);
    expect(gsm7Length(sms)).toBeLessThanOrEqual(160);
  });

  it('shortens long names to keep a text within 160 GSM-7 characters', () => {
    const { sms } = render('clientInvite', 'sv', {
      firstName: 'Anna',
      firm: 'Stockholms Bygg och Renovering Aktiebolag',
      project: 'Totalrenovering av badrum, kök och hall på Tallvägen 4 i Saltsjöbaden',
      link,
    });
    expect(gsm7Length(sms)).toBeLessThanOrEqual(160);
    expect(sms.endsWith(link)).toBe(true);
    expect(sms).toContain('...');
  });

  it('replaces characters outside GSM-7 so texts never switch to Unicode', () => {
    const { sms } = render('staffReply', 'sv', {
      firm: 'Ek & Lind',
      project: 'Kök – etapp 2',
      link,
    });
    expect(isGsm7(sms)).toBe(true);
    expect(sms).toContain('Kök - etapp 2');
  });

  it('renders English and adds the settings link to emails', () => {
    const rendered = render('clientQuestion', 'en', {
      client: 'Anna Lindqvist',
      project: 'Kitchen',
      link,
      settingsLink: 'https://app/settings',
    });
    expect(rendered.subject).toBe('Anna Lindqvist asked a question about Kitchen');
    expect(rendered.text).toContain('Change your notifications: https://app/settings');
  });
});

describe('smsSenderName', () => {
  it.each([
    ['Ek & Lind', 'Ek och Lind'],
    ['Berg Mattehjälp', 'Berg'],
    ['Åkessons Måleri', 'Akessons'],
    ['VVS-Proffsen', 'VVSProffsen'],
    ['3D Bygg', 'Siteline'],
    ['AB', 'Siteline'],
  ])('uses %s → %s', (firm, expected) => {
    expect(smsSenderName(firm)).toBe(expected);
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName(' Anna  Lindqvist ')).toBe('Anna');
  });
});
