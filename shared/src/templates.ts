import type { ReportTemplate, Trade } from './model';

/** Default visit report templates, editable per company (PRD 4.4). */
export const DEFAULT_TEMPLATES: Record<Trade, ReportTemplate> = {
  tutoring: {
    name: 'Läxhjälp',
    trade: 'tutoring',
    items: [
      { id: 'topics', label: 'Gick igenom dagens moment' },
      { id: 'homework', label: 'Gick igenom läxan' },
      { id: 'practice', label: 'Gav övning till nästa gång' },
    ],
    fields: { rating: true, note: true, flags: false, nextTime: true },
  },
  gardening: {
    name: 'Trädgård',
    trade: 'gardening',
    items: [
      { id: 'mowing', label: 'Gräsklippning' },
      { id: 'hedges', label: 'Häckklippning' },
      { id: 'weeding', label: 'Rensning' },
      { id: 'leaves', label: 'Lövkrattning' },
      { id: 'other', label: 'Övrigt' },
    ],
    fields: { rating: false, note: true, flags: true, nextTime: true },
  },
  other: {
    name: 'Besök',
    trade: 'other',
    items: [{ id: 'done', label: 'Utfört enligt plan' }],
    fields: { rating: false, note: true, flags: true, nextTime: true },
  },
};
