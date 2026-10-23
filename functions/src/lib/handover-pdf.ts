import pdfmake from 'pdfmake';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatMoney, INTL_LOCALE, type Locale, type Material, TIME_ZONE } from '@siteline/shared';

import { assetPath } from './assets';

/** Everything the pack shows, gathered by generateHandover (PRD F9). */
export interface HandoverContent {
  locale: Locale;
  firm: { name: string; accentColor: string; logo: Image | null };
  project: {
    title: string;
    address: string | null;
    startDate: string | null;
    endDate: string | null;
    clients: string[];
  };
  generatedAt: Date;
  version: number;
  summary: string;
  milestones: { name: string; at: Date }[];
  beforeAfter: { before: Image; after: Image; caption: string }[];
  materials: Material[];
  extras: { title: string; approvedBy: string; at: Date; priceOre: number }[];
  extrasTotalOre: number;
  hiddenWork: { photo: Image; text: string; at: Date }[];
  conditions: {
    at: Date;
    items: { photo: Image; note: string; location: string }[];
    acknowledgedBy: string | null;
    acknowledgedAt: Date | null;
  }[];
  careNotes: string;
  attachments: string[];
  inviteLink: string;
}

/** A JPEG or PNG as a data URL, or an SVG's markup (for logos). */
export type Image = { dataUrl: string } | { svg: string };

const TEXT = {
  sv: {
    handover: 'Överlämning',
    client: 'Kund',
    period: 'Period',
    generated: 'Skapad',
    version: 'Version',
    summary: 'Sammanfattning',
    milestones: 'Milstolpar',
    beforeAfter: 'Före och efter',
    before: 'Före',
    after: 'Efter',
    materials: 'Material och produkter',
    material: 'Produkt',
    brand: 'Märke',
    colour: 'Färgkod',
    supplier: 'Leverantör',
    warranty: 'Garanti',
    years: (n: number) => `${n} år`,
    extras: 'Godkända tillägg',
    extra: 'Tillägg',
    approvedBy: 'Godkänt av',
    when: 'När',
    price: 'Pris inkl. moms',
    total: 'Totalt',
    noExtras: 'Inga tillägg godkändes i projektet.',
    hiddenWork: 'Dolda konstruktioner',
    hiddenWorkIntro: 'Bilder på rör, el, tätskikt och isolering innan de täcktes.',
    condition: 'Skick vid start',
    acknowledged: (name: string, when: string) => `Bekräftat av ${name} ${when}`,
    notAcknowledged: 'Inte bekräftat av kunden.',
    care: 'Garanti och skötsel',
    attachments: 'Bilagor',
    attachmentsIntro: 'Finns att ladda ner i projektet i Siteline.',
    invite: 'Får du annat gjort hemma? Bjud in dem till Siteline:',
    page: (n: number, of: number) => `Sida ${n} av ${of}`,
  },
  en: {
    handover: 'Handover',
    client: 'Client',
    period: 'Period',
    generated: 'Created',
    version: 'Version',
    summary: 'Summary',
    milestones: 'Milestones',
    beforeAfter: 'Before and after',
    before: 'Before',
    after: 'After',
    materials: 'Materials and products',
    material: 'Product',
    brand: 'Brand',
    colour: 'Colour code',
    supplier: 'Supplier',
    warranty: 'Warranty',
    years: (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`,
    extras: 'Approved extras',
    extra: 'Extra',
    approvedBy: 'Approved by',
    when: 'When',
    price: 'Price incl. VAT',
    total: 'Total',
    noExtras: 'No extras were approved on this project.',
    hiddenWork: 'Hidden work',
    hiddenWorkIntro:
      'Photos of pipes, wiring, waterproofing and insulation before they were covered.',
    condition: 'Condition at the start',
    acknowledged: (name: string, when: string) => `Acknowledged by ${name} ${when}`,
    notAcknowledged: 'Not acknowledged by the client.',
    care: 'Warranty and care',
    attachments: 'Attachments',
    attachmentsIntro: 'Available to download from the project in Siteline.',
    invite: 'Getting other work done at home? Invite them to Siteline:',
    page: (n: number, of: number) => `Page ${n} of ${of}`,
  },
};

let fontsReady = false;

/** Siteline's fonts, embedded so the pack looks like the app; no remote files are fetched. */
function setUpFonts(): void {
  if (fontsReady) return;
  const body = { normal: 'manrope-latin-400-normal.woff', bold: 'manrope-latin-700-normal.woff' };
  const display = 'bricolage-grotesque-latin-800-normal.woff';
  const font = (file: string) => assetPath(`fonts/${file}`);
  pdfmake.setFonts({
    Manrope: {
      normal: font(body.normal),
      bold: font(body.bold),
      italics: font(body.normal),
      bolditalics: font(body.bold),
    },
    Bricolage: {
      normal: font(display),
      bold: font(display),
      italics: font(display),
      bolditalics: font(display),
    },
  });
  pdfmake.setUrlAccessPolicy(() => false);
  const fontsDir = assetPath('fonts/manrope-latin-400-normal.woff').replace(/[^/]+$/, '');
  pdfmake.setLocalAccessPolicy((path: string) => path.startsWith(fontsDir));
  fontsReady = true;
}

function image(img: Image, fit: [number, number]): Content {
  return 'svg' in img ? { svg: img.svg, fit } : { image: img.dataUrl, fit };
}

/** Builds the branded handover PDF (PRD F9): cover, then one section per part with content. */
export async function renderHandoverPdf(c: HandoverContent): Promise<Buffer> {
  setUpFonts();
  const t = TEXT[c.locale];
  const date = (d: Date) =>
    new Intl.DateTimeFormat(INTL_LOCALE[c.locale], {
      timeZone: TIME_ZONE,
      dateStyle: 'medium',
    }).format(d);
  const dateTime = (d: Date) =>
    new Intl.DateTimeFormat(INTL_LOCALE[c.locale], {
      timeZone: TIME_ZONE,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  const money = (ore: number) => formatMoney(ore, c.locale, { plain: true });
  // Sections flow on from each other; the first one after the cover starts a new page.
  let firstSection = true;
  const heading = (text: string): Content => {
    const node: Content = {
      text,
      style: 'h2',
      headlineLevel: 1,
      ...(firstSection ? { pageBreak: 'before' as const } : {}),
    };
    firstSection = false;
    return node;
  };
  const content: Content[] = [];

  // Cover.
  if (c.firm.logo)
    content.push({
      ...(image(c.firm.logo, [160, 80]) as object),
      margin: [0, 0, 0, 24],
    } as Content);
  content.push(
    { text: c.firm.name, style: 'firm' },
    { canvas: [{ type: 'rect', x: 0, y: 8, w: 515, h: 6, color: c.firm.accentColor }] },
    { text: t.handover, style: 'kicker', margin: [0, 32, 0, 4] },
    { text: c.project.title, style: 'h1' },
    ...(c.project.address ? [{ text: c.project.address, style: 'muted' } as Content] : []),
    {
      margin: [0, 24, 0, 0],
      table: {
        widths: [120, '*'],
        body: [
          ...(c.project.clients.length ? [[t.client, c.project.clients.join(', ')]] : []),
          ...(c.project.startDate
            ? [[t.period, `${c.project.startDate} – ${c.project.endDate ?? ''}`]]
            : []),
          [t.generated, date(c.generatedAt)],
          [t.version, String(c.version)],
        ],
      },
      layout: 'noBorders',
    },
  );

  if (c.summary) content.push(heading(t.summary), { text: c.summary, style: 'body' });

  if (c.milestones.length) {
    content.push(heading(t.milestones), {
      ul: c.milestones.map((m) => ({ text: [{ text: m.name, bold: true }, `  ${date(m.at)}`] })),
      style: 'body',
    });
  }

  if (c.beforeAfter.length) {
    content.push(heading(t.beforeAfter));
    for (const pair of c.beforeAfter) {
      content.push({
        unbreakable: true,
        margin: [0, 0, 0, 16],
        stack: [
          {
            columns: [
              { stack: [{ text: t.before, style: 'label' }, image(pair.before, [250, 190])] },
              { stack: [{ text: t.after, style: 'label' }, image(pair.after, [250, 190])] },
            ],
            columnGap: 15,
          },
          ...(pair.caption
            ? [{ text: pair.caption, style: 'muted', margin: [0, 4, 0, 0] } as Content]
            : []),
        ],
      });
    }
  }

  if (c.materials.length) {
    const header: TableCell[] = [t.material, t.brand, t.colour, t.supplier, t.warranty].map(
      (text) => ({
        text,
        style: 'th',
      }),
    );
    content.push(heading(t.materials), {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: [
          header,
          ...c.materials.map((m) => [
            m.name,
            m.brand,
            m.colourCode,
            m.supplier,
            m.warrantyYears === null ? '' : t.years(m.warrantyYears),
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      style: 'table',
    });
  }

  // Every approved extra, with who approved it and when; the total matches the Decisions tab.
  content.push(heading(t.extras));
  if (c.extras.length) {
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto'],
        body: [
          [t.extra, t.approvedBy, t.when, t.price].map((text) => ({ text, style: 'th' })),
          ...c.extras.map((e) => [
            e.title,
            e.approvedBy,
            dateTime(e.at),
            { text: money(e.priceOre), alignment: 'right' as const },
          ]),
          [
            { text: t.total, bold: true },
            '',
            '',
            { text: money(c.extrasTotalOre), bold: true, alignment: 'right' as const },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
      style: 'table',
    });
  } else {
    content.push({ text: t.noExtras, style: 'body' });
  }

  if (c.hiddenWork.length) {
    content.push(heading(t.hiddenWork), {
      text: t.hiddenWorkIntro,
      style: 'muted',
      margin: [0, 0, 0, 12],
    });
    content.push(
      ...grid(
        c.hiddenWork.map((h) => ({
          photo: h.photo,
          caption: `${date(h.at)}${h.text ? ` · ${h.text}` : ''}`,
        })),
      ),
    );
  }

  for (const report of c.conditions) {
    content.push(heading(`${t.condition} · ${date(report.at)}`));
    content.push(
      ...grid(
        report.items.map((i) => ({
          photo: i.photo,
          caption: i.location ? `${i.note} · ${i.location}` : i.note,
        })),
      ),
      {
        text:
          report.acknowledgedBy && report.acknowledgedAt
            ? t.acknowledged(report.acknowledgedBy, dateTime(report.acknowledgedAt))
            : t.notAcknowledged,
        style: 'body',
        margin: [0, 8, 0, 0],
      },
    );
  }

  if (c.careNotes) content.push(heading(t.care), { text: c.careNotes, style: 'body' });

  if (c.attachments.length) {
    content.push(
      heading(t.attachments),
      { text: t.attachmentsIntro, style: 'muted' },
      {
        ul: c.attachments,
        style: 'body',
      },
    );
  }

  // The invite card (PRD F20).
  content.push({
    margin: [0, 32, 0, 0],
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: [t.invite, ' ', { text: c.inviteLink, link: c.inviteLink, color: '#0B5C4E' }],
            margin: [12, 10, 12, 10],
          },
        ],
      ],
    },
    layout: { fillColor: () => '#F1EEE7', hLineWidth: () => 0, vLineWidth: () => 0 },
  });

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 56],
    info: { title: `${t.handover}: ${c.project.title}`, author: c.firm.name, creator: 'Siteline' },
    defaultStyle: { font: 'Manrope', fontSize: 10.5, lineHeight: 1.3, color: '#1C1F26' },
    styles: {
      firm: { font: 'Bricolage', fontSize: 16 },
      kicker: { fontSize: 10, bold: true, color: '#5B5F68', characterSpacing: 1 },
      h1: { font: 'Bricolage', fontSize: 28, margin: [0, 0, 0, 8] },
      h2: { font: 'Bricolage', fontSize: 18, margin: [0, 24, 0, 10] },
      label: { fontSize: 9, bold: true, color: '#5B5F68', margin: [0, 0, 0, 4] },
      body: { margin: [0, 0, 0, 8] },
      muted: { color: '#5B5F68' },
      th: { bold: true, fontSize: 9.5 },
      table: { margin: [0, 0, 0, 8] },
    },
    footer: (page, pages) => ({
      columns: [
        { text: `${c.firm.name} · ${c.project.title}`, style: 'muted', fontSize: 8.5 },
        { text: t.page(page, pages), alignment: 'right', style: 'muted', fontSize: 8.5 },
      ],
      margin: [40, 20, 40, 0],
    }),
    content,
    // A heading never ends a page on its own.
    pageBreakBefore: (node, following) =>
      node.headlineLevel === 1 && following.getFollowingNodesOnPage().length === 0,
  };
  return pdfmake.createPdf(doc).getBuffer();
}

/** Photos three to a row, each with a caption. */
function grid(items: { photo: Image; caption: string }[]): Content[] {
  const rows: Content[] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push({
      columns: items.slice(i, i + 3).map((item) => ({
        width: 165,
        stack: [
          image(item.photo, [165, 124]),
          { text: item.caption, fontSize: 8.5, margin: [0, 3, 0, 0] },
        ],
      })),
      columnGap: 10,
      margin: [0, 0, 0, 12],
      unbreakable: true,
    });
  }
  return rows;
}
