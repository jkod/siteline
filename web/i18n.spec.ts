import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Every user-facing string goes through a translation (PRD section 13). This checks that
// Swedish and English have the same keys, and that every static key used in the app exists.

const dir = new URL('.', import.meta.url).pathname;
const load = (lang: string) =>
  JSON.parse(readFileSync(join(dir, 'public/i18n', `${lang}.json`), 'utf8'));

function flatten(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, v]) =>
    v && typeof v === 'object'
      ? flatten(v as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function sources(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

const sv = flatten(load('sv'));
const en = flatten(load('en'));

describe('translations', () => {
  it('have the same keys in Swedish and English', () => {
    expect(sv.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !sv.includes(k))).toEqual([]);
  });

  it('have no empty Swedish strings except deliberate blanks', () => {
    const svData = load('sv');
    const empty = sv.filter((key) => key.split('.').reduce((d, k) => d[k], svData) === '');
    expect(empty.every((key) => key.startsWith('projectStatus.active'))).toBe(true);
  });

  it('cover every static key used in the app', () => {
    const groups = new Set(sv.map((k) => k.replace(/\.(one|other)$/, '')));
    const known = new Set([...sv, ...groups]);
    const prefixes =
      /^(common|pages|login|loginFinish|onboarding|errors|dev|feed|composer|people|staffHome|newProject|project|projectStatus|planLimit|placeholders|milestone|companySettings|brandPreview|team|me|billing|redeem|linkExpired|clientHome|client|install|offline|address|status|roles|plans|staff|language|placeholder|decisions|visits|checklist|report|serviceClient|trades|weekdays|weekdaysShort|today|clientSettings|feedStyle|voice|todo|invite|referral|legal|clientLogin|try|demo|switcher|approvalRule|deleteProject|privacy|handover|aftercare|booking|condition|push)\./;
    const used = new Set<string>();
    for (const file of sources(join(dir, 'src/app'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(
        /'([a-zA-Z]+(?:\.[a-zA-Z0-9_-]+)+)'/g,
      )) {
        if (prefixes.test(match[1]!) && !match[1]!.endsWith('.')) used.add(match[1]!);
      }
    }
    expect([...used].filter((key) => !known.has(key))).toEqual([]);
  });
});
