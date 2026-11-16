import { installConsoleGuard, log } from '../logger';

const dev = global as unknown as { __DEV__: boolean };

describe('log', () => {
  const spies = {
    log: jest.spyOn(console, 'log').mockImplementation(() => undefined),
    info: jest.spyOn(console, 'info').mockImplementation(() => undefined),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    error: jest.spyOn(console, 'error').mockImplementation(() => undefined)
  };
  const wasDev = dev.__DEV__;
  afterEach(() => {
    dev.__DEV__ = wasDev;
    jest.clearAllMocks();
  });

  it('keeps debug and info out of a release build', () => {
    dev.__DEV__ = false;
    log.debug('tracing');
    log.info('a step');
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
  });

  it('prints debug and info in development', () => {
    dev.__DEV__ = true;
    log.debug('tracing');
    expect(spies.log).toHaveBeenCalledWith('tracing');
  });

  it.each([false, true])('keeps warnings and errors with __DEV__=%s', (isDev) => {
    dev.__DEV__ = isDev;
    log.warn('careful');
    log.error('broken');
    expect(spies.warn).toHaveBeenCalledWith('careful');
    expect(spies.error).toHaveBeenCalledWith('broken');
  });
});

describe('installConsoleGuard', () => {
  const real = { log: console.log, info: console.info, debug: console.debug, error: console.error };
  const wasDev = (global as unknown as { __DEV__: boolean }).__DEV__;
  afterEach(() => {
    Object.assign(console, real);
    (global as unknown as { __DEV__: boolean }).__DEV__ = wasDev;
  });

  // The app has ~150 console.log calls naming endpoints, ids and the signed-in user
  it('silences console.log/info/debug in a release build, but not errors', () => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = false;
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    installConsoleGuard();
    expect(console.log).not.toBe(real.log);
    console.log('noise');
    console.error('kept');
    expect(error).toHaveBeenCalledWith('kept');
  });

  it('leaves development alone', () => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
    installConsoleGuard();
    expect(console.log).toBe(real.log);
  });
});
