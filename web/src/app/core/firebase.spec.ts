import { withoutUndefined } from './firebase';

describe('withoutUndefined', () => {
  it('drops undefined values deeply and keeps null, arrays and other values', () => {
    expect(
      withoutUndefined({
        a: 1,
        b: undefined,
        c: null,
        d: { e: undefined, f: [1, { g: undefined }] },
      }),
    ).toEqual({
      a: 1,
      c: null,
      d: { f: [1, {}] },
    });
  });
});
