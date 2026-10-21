import { errorMessageKey } from './errors';

describe('errorMessageKey', () => {
  it('maps known Auth and callable codes to translation keys', () => {
    expect(errorMessageKey({ code: 'auth/invalid-email' })).toBe('errors.auth.invalid-email');
    expect(errorMessageKey({ code: 'functions/failed-precondition' })).toBe(
      'errors.functions.failed-precondition',
    );
  });

  it('stays quiet when the person closed the Google popup', () => {
    expect(errorMessageKey({ code: 'auth/popup-closed-by-user' })).toBeNull();
  });

  it('falls back to a general message', () => {
    expect(errorMessageKey(new Error('boom'))).toBe('errors.unknown');
    expect(errorMessageKey({ code: 'auth/something-new' })).toBe('errors.unknown');
  });
});
