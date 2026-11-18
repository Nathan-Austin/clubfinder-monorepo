import { isValidTelephone } from '../telephone';

// The app's rule must match the server's (barValidators.isValidTelephone: 7-15 digits,
// formatting ignored). The old US-shaped check refused a +49 mobile, so Bar Registration
// could not get past step 2 (DEVICE_CHECKLIST 2026-11-18).

describe('isValidTelephone', () => {
  it.each([
    '+49 151 23456789', // German mobile, 13 digits: the case that failed on the device
    '+44 20 7946 0958',
    '(030) 1234567',
    '030 1234 567',
    '+1 212 555 0123',
    '1234567' // 7 digits, the server's minimum
  ])('accepts %s, as the server does', (phone) => {
    expect(isValidTelephone(phone)).toBe(true);
  });

  it.each([
    '123456', // 6 digits: under the server's minimum
    '+49 1234 5678 9012 3456', // 16 digits: over the maximum
    '', // nothing
    'call me' // no digits at all
  ])('refuses %s, as the server does', (phone) => {
    expect(isValidTelephone(phone)).toBe(false);
  });
});
