import { redactPath } from './client-error';

describe('redactPath', () => {
  it.each([
    ['/p/9f8a7b6c5d4e', '/p/:token'],
    ['/r/AbC123?ref=x', '/r/:code'],
    ['/c/project1/decisions?tab=open#top', '/c/project1/decisions'],
    ['/login/finish?apiKey=k&oobCode=secret', '/login/finish'],
  ])('redacts %s to %s', (input, expected) => {
    expect(redactPath(input)).toBe(expected);
  });
});
