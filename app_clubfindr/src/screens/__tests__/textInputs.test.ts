/**
 * Every TextInput states its own text and placeholder colours, and e-mail fields do not
 * autocorrect (KNOWN_ISSUES 69).
 *
 * Without an explicit `color` the Android theme picks the text colour, and on the owner's phone
 * (2026-11-16) it picked white on the login screen's white field, so nothing typed could be seen.
 * A keyboard that autocorrects can change an address as it is typed.
 *
 * A source check, like the web app's no-sql-from-strings.test.ts: none of this shows up in a
 * test renderer, only on a device with the wrong theme.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

// Jest runs from the app's root (package.json); __dirname is not a global the lint knows
const SRC = path.resolve('src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return name.endsWith('.tsx') ? [full] : [];
  });
}

/** The props text of every `<TextInput ... />`, with its line. */
function textInputs(source: string) {
  const found: { props: string; line: number }[] = [];
  const re = /<TextInput\b([\s\S]*?)\/>/g;
  for (let m; (m = re.exec(source));) {
    found.push({ props: m[1], line: source.slice(0, m.index).split('\n').length });
  }
  return found;
}

/** The body of `name: { ... }` inside StyleSheet.create, or undefined. */
function styleBody(source: string, name: string): string | undefined {
  const m = new RegExp(`\\n\\s*${name}:\\s*\\{([^}]*)\\}`).exec(source);
  return m?.[1];
}

const isEmailField = (props: string) =>
  /keyboardType=["']email-address["']/.test(props) || /textContentType=["']emailAddress["']/.test(props);

const files = sourceFiles(SRC);
const inputs = files.flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  return textInputs(source).map((input) => ({
    ...input,
    source,
    where: `${path.relative(SRC, file)}:${input.line}`
  }));
});

describe('TextInput colours and e-mail fields', () => {
  it('finds the inputs (the check is not vacuous)', () => {
    expect(inputs.length).toBeGreaterThan(20);
  });

  it('every TextInput sets placeholderTextColor', () => {
    expect(inputs.filter((i) => !/placeholderTextColor=/.test(i.props)).map((i) => i.where)).toEqual([]);
  });

  it("every TextInput's base style sets an explicit text colour", () => {
    const missing = inputs
      .filter((i) => {
        // The first style named: `style={styles.x}` or `style={[styles.x, ...]}`
        const name = /style=\{\[?\s*styles\.(\w+)/.exec(i.props)?.[1];
        if (!name) return true;
        const body = styleBody(i.source, name);
        return !body || !/(^|[\s,])color:/.test(body);
      })
      .map((i) => i.where);
    expect(missing).toEqual([]);
  });

  it('e-mail fields turn autocorrect and capitalisation off', () => {
    const emails = inputs.filter((i) => isEmailField(i.props));
    expect(emails.length).toBeGreaterThan(3);
    expect(
      emails
        .filter((i) => !/autoCorrect=\{false\}/.test(i.props) || !/autoCapitalize=["']none["']/.test(i.props))
        .map((i) => i.where)
    ).toEqual([]);
  });
});
