/**
 * Logs name no credentials and no personal data.
 *
 * A release build silences console.log (utils/logger), but a confirmation code or a token in a
 * development log still reaches logcat on a shared device, and console.error is kept in every
 * build. The same check the web app runs (clubfindr/src/lib/server/no-personal-data-in-logs.test.ts):
 * the literal text of each call is dropped, and what is left - the values actually logged - must
 * not name any of these.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const SRC = path.resolve('src');

const PERSONAL =
  /\b(email|generalEmail|password|newPassword|currentPassword|token|authToken|accessToken|refreshToken|sessionId|confirmationCode|confirmation_code|credentials|userJson|barData)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/**
 * The values each console.* or log.* (utils/logger) call logs: its arguments with the literal text removed, but the
 * expressions inside `${...}` kept, since those are values.
 */
export function loggedValues(source: string): { args: string; line: number }[] {
  const calls: { args: string; line: number }[] = [];
  // log.* too: the app's own calls go through utils/logger (step 10 moved 132 console.log calls there)
  const start = /\b(?:console|log)\.(log|info|warn|error|debug)\(/g;
  for (let match; (match = start.exec(source)); ) {
    let i = start.lastIndex;
    let depth = 1;
    let kept = '';
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === "'" || c === '"') {
        const quote = c;
        i++;
        while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1;
        i++;
        continue;
      }
      if (c === '`') {
        i++;
        while (i < source.length && source[i] !== '`') {
          if (source[i] === '\\') {
            i += 2;
            continue;
          }
          if (source[i] === '$' && source[i + 1] === '{') {
            // keep the expression, which is a value
            let braces = 1;
            i += 2;
            const from = i;
            while (i < source.length && braces > 0) {
              if (source[i] === '{') braces++;
              else if (source[i] === '}') braces--;
              if (braces > 0) i++;
            }
            kept += ` ${source.slice(from, i)} `;
            i++;
            continue;
          }
          i++;
        }
        i++;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (depth > 0) kept += c;
      i++;
    }
    calls.push({ args: kept, line: source.slice(0, match.index).split('\n').length });
  }
  return calls;
}

describe('console calls', () => {
  const files = sourceFiles(SRC);

  it('reads the app (the check is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => loggedValues(readFileSync(f, 'utf8')).length > 0)).toBe(true);
  });

  it('log no credentials and no personal data', () => {
    const offenders = files.flatMap((file) =>
      loggedValues(readFileSync(file, 'utf8'))
        .filter((call) => PERSONAL.test(call.args))
        .map((call) => `${path.relative(SRC, file)}:${call.line} logs ${call.args.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
