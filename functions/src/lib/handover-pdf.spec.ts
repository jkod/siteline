import { readFileSync } from 'node:fs';

import { assetPath } from './assets';
import { type HandoverContent, renderHandoverPdf } from './handover-pdf';

const jpeg = (name: string) => ({
  dataUrl: `data:image/jpeg;base64,${readFileSync(assetPath(`photos/${name}.jpg`)).toString('base64')}`,
});

function content(overrides: Partial<HandoverContent> = {}): HandoverContent {
  const at = new Date('2026-11-20T10:00:00Z');
  return {
    locale: 'sv',
    firm: { name: 'Ek & Lind Snickeri', accentColor: '#127A69', logo: null },
    project: {
      title: 'Köksrenovering Lindqvist',
      address: 'Tallvägen 4, 133 34 Saltsjöbaden',
      startDate: '2026-10-12',
      endDate: '2026-11-20',
      clients: ['Anna Lindqvist'],
    },
    generatedAt: at,
    version: 1,
    summary: 'Köket är klart. Bänkskivan är oljad och luckorna justerade.',
    milestones: [{ name: 'Rivning klar', at }],
    beforeAfter: [
      { before: jpeg('rivning-display'), after: jpeg('skap1-display'), caption: 'Diskbänken' },
    ],
    materials: [
      {
        name: 'Bänkskiva ek',
        brand: 'Nordic Wood',
        colourCode: 'Natur',
        supplier: 'Byggmax',
        warrantyYears: 5,
      },
    ],
    extras: [
      { title: 'Byt rutten golvbjälke', approvedBy: 'Anna Lindqvist', at, priceOre: 650_000 },
    ],
    extrasTotalOre: 650_000,
    hiddenWork: [{ photo: jpeg('el-thumb'), text: 'Nya uttag', at }],
    conditions: [],
    careNotes: 'Olja bänkskivan två gånger om året.',
    attachments: ['Skötselråd bänkskiva.pdf'],
    inviteLink: 'https://app.example/c?invite=1',
    ...overrides,
  };
}

describe('renderHandoverPdf', () => {
  it('makes a PDF in Swedish and English', async () => {
    for (const locale of ['sv', 'en'] as const) {
      const pdf = await renderHandoverPdf(content({ locale }));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(20_000);
    }
  });

  it('handles a project with 200 photos well within a minute (PRD F9)', async () => {
    const started = Date.now();
    const at = new Date('2026-11-01T08:00:00Z');
    const photos = ['bjalke', 'el', 'kakel', 'rivning', 'skap1', 'skap2'].map((n) =>
      jpeg(`${n}-thumb`),
    );
    const pdf = await renderHandoverPdf(
      content({
        hiddenWork: Array.from({ length: 200 }, (_, i) => ({
          photo: photos[i % 6]!,
          text: `Bild ${i + 1}`,
          at,
        })),
      }),
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 60_000);
});
