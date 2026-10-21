import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('accepts in-app paths', () => {
    expect(safeReturnUrl('/app/settings/me')).toBe('/app/settings/me');
  });

  it.each([null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example'])(
    'rejects %s',
    (raw) => {
      expect(safeReturnUrl(raw)).toBeNull();
    },
  );
});
