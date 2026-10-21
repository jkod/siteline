import { backoffMs } from './delivery';

describe('backoffMs', () => {
  it('waits 5, 20 and 45 minutes', () => {
    expect([1, 2, 3].map((n) => backoffMs(n) / 60_000)).toEqual([5, 20, 45]);
  });
});
