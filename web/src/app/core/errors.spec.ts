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

describe('errorMessageKey with callable reasons', () => {
  it('uses the specific reason when the callable gives a known one', () => {
    expect(errorMessageKey({ code: 'functions/failed-precondition', message: 'plan_limit' })).toBe(
      'errors.reasons.plan_limit',
    );
  });

  it('ignores the HTTP status the Functions SDK appends to the message', () => {
    expect(errorMessageKey({ code: 'functions/not-found', message: 'invalid_link [404]' })).toBe(
      'errors.reasons.invalid_link',
    );
  });

  it('falls back to the code for unknown messages', () => {
    expect(errorMessageKey({ code: 'functions/failed-precondition', message: 'something' })).toBe(
      'errors.functions.failed-precondition',
    );
  });
});
