import { readFileSync } from 'fs';
import path from 'path';
import { parseCheckinCode } from '../checkinCode';

const BAR = '3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';

describe('parseCheckinCode: the two forms the server writes', () => {
  it('reads the deep link a new code gets (POST qrcodes)', () => {
    expect(
      parseCheckinCode(`clubfindr://checkin?barId=${BAR}&qrId=12&type=entrance&barName=Club%20Tilki`)
    ).toEqual({ kind: 'checkin', code: { barId: BAR, qrId: '12', qrType: 'entrance' } });
  });

  it('reads the web address every listed code gets (GET qrcodes; KNOWN_ISSUES 84)', () => {
    expect(parseCheckinCode(`https://clubfindr.com/redirect?barId=${BAR}&qrId=12&type=table`)).toEqual({
      kind: 'checkin',
      code: { barId: BAR, qrId: '12', qrType: 'table' },
    });
  });

  it('reads the www host too', () => {
    expect(parseCheckinCode(`https://www.clubfindr.com/redirect?barId=${BAR}&qrId=7`)).toEqual({
      kind: 'checkin',
      code: { barId: BAR, qrId: '7' },
    });
  });

  it('is not thrown by case, a trailing slash, surrounding space, a fragment or parameter order', () => {
    const variants = [
      `CLUBFINDR://CHECKIN?barId=${BAR}&qrId=12`,
      `HTTPS://WWW.CLUBFINDR.COM/redirect/?barId=${BAR}&qrId=12`,
      `  clubfindr://checkin/?qrId=12&barId=${BAR}\n`,
      `https://clubfindr.com/redirect?barId=${BAR}&qrId=12#top`,
    ];
    for (const data of variants) {
      expect(parseCheckinCode(data)).toEqual({ kind: 'checkin', code: { barId: BAR, qrId: '12' } });
    }
  });

  it('leaves out a type it does not know, which the check-in does not need', () => {
    expect(parseCheckinCode(`clubfindr://checkin?barId=${BAR}&qrId=12&type=undefined`)).toEqual({
      kind: 'checkin',
      code: { barId: BAR, qrId: '12' },
    });
  });

  it('takes the first of a repeated parameter', () => {
    const result = parseCheckinCode(`clubfindr://checkin?barId=${BAR}&qrId=12&qrId=99`);
    expect(result).toEqual({ kind: 'checkin', code: { barId: BAR, qrId: '12' } });
  });
});

describe('parseCheckinCode: refusals', () => {
  it.each([
    ['a web page', 'https://example.com/menu'],
    ['another page on our site', `https://clubfindr.com/clubs?barId=${BAR}&qrId=12`],
    ['a look-alike host', `https://clubfindr.com.evil.example/redirect?barId=${BAR}&qrId=12`],
    ['a subdomain we do not use', `https://app.clubfindr.com/redirect?barId=${BAR}&qrId=12`],
    ['plain http', `http://clubfindr.com/redirect?barId=${BAR}&qrId=12`],
    ['another deep link of ours', `clubfindr://venue?barId=${BAR}&qrId=12`],
    ['a Wi-Fi code', 'WIFI:T:WPA;S:Bar;P:secret;;'],
    ['plain text', 'hello'],
    ['an empty scan', ''],
    ['a non-string', undefined],
  ])('does not take %s for a Tilki code', (_label, data) => {
    expect(parseCheckinCode(data)).toEqual({ kind: 'not-tilki' });
  });

  it.each([
    ['no query at all', 'clubfindr://checkin'],
    ['no qrId', `clubfindr://checkin?barId=${BAR}`],
    ['no barId', 'https://clubfindr.com/redirect?qrId=12'],
    ['a barId that is not a uuid', 'clubfindr://checkin?barId=42&qrId=12'],
    ['a barId of "null"', 'https://clubfindr.com/redirect?barId=null&qrId=12'],
    ['a qrId that is not a number', `clubfindr://checkin?barId=${BAR}&qrId=abc`],
    ['a qrId of 0', `clubfindr://checkin?barId=${BAR}&qrId=0`],
    ['a qrId past 32 bits', `clubfindr://checkin?barId=${BAR}&qrId=2147483648`],
    ['a malformed escape', `clubfindr://checkin?barId=${BAR}&qrId=%E0%A4%A`],
  ])('calls a code of ours with %s incomplete', (_label, data) => {
    expect(parseCheckinCode(data)).toEqual({ kind: 'incomplete' });
  });
});

describe('parseCheckinCode against the server', () => {
  // The forms the server writes: if it ever writes another, this fails rather than the scan
  const route = readFileSync(
    path.resolve('..', 'clubfindr', 'src', 'routes', 'api', 'mobile', 'bars', '[barId]', 'qrcodes', '+server.ts'),
    'utf8'
  );
  const templates = [...route.matchAll(/qrValue:\s*`([^`]+)`/g)].map((match) => match[1]);

  it('finds both qrValue templates in the qrcodes route', () => {
    expect(templates).toHaveLength(2);
  });

  it.each(templates.map((template) => [template]))('accepts what %s produces', (template) => {
    const value = template
      .replace(/\$\{\s*encodeURIComponent\([\s\S]*?\)\s*\}/g, 'Club%20Tilki')
      .replace(/\$\{\s*barId\s*\}/g, BAR)
      .replace(/\$\{\s*(?:newQRId|row\.id)\s*\}/g, '12')
      .replace(/\$\{\s*(?:type|row\.type)\s*\}/g, 'entrance');
    expect(value).not.toContain('${');
    expect(parseCheckinCode(value)).toEqual({
      kind: 'checkin',
      code: { barId: BAR, qrId: '12', qrType: 'entrance' },
    });
  });
});
