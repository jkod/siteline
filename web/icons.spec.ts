import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The generated icon file must match web/icons.config.json: run `npm run icons` after editing it.

const dir = new URL('.', import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(dir, 'icons.config.json'), 'utf8')) as {
  style: string;
  weight: number;
  fill: boolean;
  icons: string[];
};
const generated = readFileSync(join(dir, 'src/app/shared/ui/icons.generated.ts'), 'utf8');

describe('icons', () => {
  it('are generated for the configured style, weight and fill', () => {
    expect(generated).toContain(
      `Material Symbols ${config.style}, weight ${config.weight}${config.fill ? ', filled' : ''}.`,
    );
  });

  it('include exactly the configured icons', () => {
    // Prettier may move long paths onto their own line, so match the key alone.
    const names = [...generated.matchAll(/^ {2}'?([a-z0-9_]+)'?:/gm)].map((m) => m[1]);
    expect(names).toEqual(config.icons);
  });

  it('cover every icon the app uses', () => {
    const used = new Set<string>();
    const walk = (path: string): void => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const full = join(path, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|html)$/.test(entry.name)) {
          for (const m of readFileSync(full, 'utf8').matchAll(/<sl-icon name="([a-z0-9_]+)"/g))
            used.add(m[1]!);
        }
      }
    };
    walk(join(dir, 'src/app'));
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((name) => !config.icons.includes(name))).toEqual([]);
  });
});
