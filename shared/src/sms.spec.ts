import { gsm7Length, isGsm7, toGsm7 } from './sms';

describe('GSM-7', () => {
  it('accepts Swedish letters', () => {
    expect(isGsm7('Hej Åsa! Köksrenovering på Tallvägen är klar.')).toBe(true);
  });

  it('rejects emoji, en dashes and non-breaking spaces', () => {
    expect(isGsm7('Klart 👍')).toBe(false);
    expect(isGsm7('09:00–11:00')).toBe(false);
    expect(isGsm7('6 500 kr')).toBe(false);
  });

  it('counts extension characters twice', () => {
    expect(gsm7Length('a€')).toBe(3);
  });

  it('replaces common non-GSM characters', () => {
    expect(toGsm7('09:00–11:00, 6 500 kr')).toBe('09:00-11:00, 6 500 kr');
    expect(isGsm7(toGsm7('“Klart” – nu…'))).toBe(true);
  });
});
