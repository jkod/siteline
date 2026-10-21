import { fitWithin } from './photos';

describe('fitWithin', () => {
  it('scales the longest side down to the maximum', () => {
    expect(fitWithin(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3024, 4032, 640)).toEqual({ width: 480, height: 640 });
  });

  it('never scales up', () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });
});
