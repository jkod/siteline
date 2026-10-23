import { homeUrl } from './home-url';

describe('homeUrl', () => {
  const none = { cid: null, crole: null, isClient: false, isDemo: false };

  it('sends signed-out people to the login page', () => {
    expect(homeUrl(false, none)).toBe('/login');
  });

  it('sends staff to the staff app, clients to their home and others to onboarding', () => {
    expect(homeUrl(true, { cid: 'c1', crole: 'crew', isClient: false, isDemo: false })).toBe(
      '/app',
    );
    expect(homeUrl(true, { ...none, isClient: true })).toBe('/c');
    expect(homeUrl(true, none)).toBe('/onboarding');
  });
});
