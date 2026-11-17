import { captureQrPng, qrPngBase64, qrShareFilePath, type QrSvgRef } from '../qrShare';

// A 1x1 PNG, as Android's SvgView.toDataURL returns it: bare base64, no data: prefix
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const refCallingBackWith = (value: unknown): QrSvgRef => ({
  toDataURL: (callback) => callback(value as string),
});

describe('qrPngBase64', () => {
  it('takes the bare base64 Android calls back with (KNOWN_ISSUES 83: split(",")[1] was undefined)', () => {
    expect(qrPngBase64(PNG)).toBe(PNG);
  });

  it('strips a data URL prefix', () => {
    expect(qrPngBase64(`data:image/png;base64,${PNG}`)).toBe(PNG);
  });

  it.each([
    ['undefined (iOS calls back with nothing on failure)', undefined],
    ['null', null],
    ['an empty string', ''],
    ['an empty data URL', 'data:image/png;base64,'],
    ['text that is not base64', 'not a png!'],
    ['a number', 42],
  ])('refuses %s', (_label, value) => {
    expect(() => qrPngBase64(value)).toThrow('The QR code could not be captured');
  });
});

describe('captureQrPng', () => {
  it('resolves with the PNG base64', async () => {
    await expect(captureQrPng(refCallingBackWith(PNG))).resolves.toBe(PNG);
  });

  it('rejects when the QR code is not on screen', async () => {
    await expect(captureQrPng(null)).rejects.toThrow('not on screen');
    await expect(captureQrPng(undefined)).rejects.toThrow('not on screen');
  });

  it('rejects when the callback brings no image', async () => {
    await expect(captureQrPng(refCallingBackWith(undefined))).rejects.toThrow('could not be captured');
  });

  it('rejects when toDataURL throws', async () => {
    const ref: QrSvgRef = {
      toDataURL: () => {
        throw new Error('native module missing');
      },
    };
    await expect(captureQrPng(ref)).rejects.toThrow('native module missing');
  });

  it('waits for a callback that comes later', async () => {
    let callBack: (value: string) => void = () => undefined;
    const ref: QrSvgRef = { toDataURL: (callback) => (callBack = callback) };
    const capture = captureQrPng(ref);
    callBack(PNG);
    await expect(capture).resolves.toBe(PNG);
  });
});

describe('qrShareFilePath', () => {
  it('puts the file in the cache directory, with or without a trailing slash', () => {
    expect(qrShareFilePath('file:///cache/', 'abc-123')).toBe('file:///cache/qrcode-abc-123.png');
    expect(qrShareFilePath('file:///cache', 'abc-123')).toBe('file:///cache/qrcode-abc-123.png');
  });

  it('keeps the id from reaching outside the cache directory', () => {
    expect(qrShareFilePath('file:///cache/', '../../x')).toBe('file:///cache/qrcode-______x.png');
  });

  it('refuses a missing cache directory', () => {
    expect(() => qrShareFilePath(null, 'abc')).toThrow('No cache directory');
  });
});
