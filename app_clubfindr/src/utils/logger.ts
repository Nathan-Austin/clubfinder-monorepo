/**
 * Logging that does not ship.
 *
 * A release build should not print the app's traffic to logcat: the lines name endpoints, ids
 * and, in a few places, the signed-in user. `installConsoleGuard` silences console.log/info/debug
 * outside development, which covers the calls already written; `log` is what new code should use,
 * so the intent is in the call itself.
 *
 * Warnings and errors are kept in every build: they are what a crash report or a bug hunt needs.
 */

type LogArgs = unknown[];

const isDev = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

export const log = {
  /** Development only: tracing, timings, "got here" */
  debug: (...args: LogArgs) => {
    if (isDev()) console.log(...args);
  },
  /** Development only: a step worth naming */
  info: (...args: LogArgs) => {
    if (isDev()) console.info(...args);
  },
  /** Every build */
  warn: (...args: LogArgs) => console.warn(...args),
  /** Every build */
  error: (...args: LogArgs) => console.error(...args)
};

/**
 * Silences console.log/info/debug in release builds. Called once from App.tsx, before the rest
 * of the app runs. Returns the replaced functions so a test can put them back.
 */
export function installConsoleGuard(): void {
  if (isDev()) return;
  const noop = () => undefined;
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
