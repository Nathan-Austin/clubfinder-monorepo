/**
 * Every screen paints its own background, and every colour literal is a real colour
 * (KNOWN_ISSUES 85).
 *
 * The app's screens are styled dark (light text on #121212), but `NavigationContainer` gets no
 * theme, so React Navigation's light default sits behind any screen that does not set a
 * background. QRCodeGeneratorScreen did not: its white text was on light grey on the owner's phone
 * (2026-11-16). It also had `'#40000'`, five digits, which is no colour at all.
 *
 * A source check, like textInputs.test.ts: a test renderer shows neither, only a device does.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

// Jest runs from the app's root (package.json); __dirname is not a global the lint knows
const SRC = path.resolve('src');
const SCREENS = path.join(SRC, 'screens');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** The body of `name: { ... }` inside StyleSheet.create, or undefined. */
function styleBody(source: string, name: string): string | undefined {
  const m = new RegExp(`\\n\\s*${name}:\\s*\\{([^}]*)\\}`).exec(source.slice(source.indexOf('StyleSheet.create')));
  return m?.[1];
}

const screens = readdirSync(SCREENS)
  .filter((name) => name.endsWith('Screen.tsx'))
  .map((name) => ({ name, source: readFileSync(path.join(SCREENS, name), 'utf8') }));

describe('screen backgrounds', () => {
  it('finds the screens', () => {
    // 20 on 2026-11-17; a sanity floor, so a moved folder cannot make this pass on nothing
    expect(screens.length).toBeGreaterThanOrEqual(15);
    expect(screens.map((s) => s.name)).toContain('QRCodeGeneratorScreen.tsx');
  });

  it.each(screens.map((s) => [s.name, s.source]))(
    '%s gives its root container a background',
    (_name, source) => {
      const container = styleBody(source, 'container');
      expect(container).toBeDefined();
      expect(container).toMatch(/backgroundColor\s*:/);
    }
  );

  it('the QR code screen is dark, with a dark loading state too', () => {
    const source = screens.find((s) => s.name === 'QRCodeGeneratorScreen.tsx')!.source;
    expect(styleBody(source, 'container')).toContain("backgroundColor: '#121212'");
    expect(styleBody(source, 'loadingContainer')).toContain("backgroundColor: '#121212'");
  });
});

describe('colour literals', () => {
  it('every hex colour has 3, 4, 6 or 8 digits', () => {
    const bad: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/['"`](#[0-9A-Fa-f]+)['"`]/g)) {
        if (![3, 4, 6, 8].includes(m[1].length - 1)) {
          const line = source.slice(0, m.index).split('\n').length;
          bad.push(`${path.relative(SRC, file)}:${line} ${m[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
