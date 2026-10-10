/** @id CODE-PARSER-001 @implements REQ-PARSER-001 REQ-PARSER-002 REQ-PARSER-003 REQ-PARSER-004 REQ-PARSER-005 REQ-PARSER-006 REQ-PARSER-007 REQ-PARSER-008 */
export function parse(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  const tokens = [];
  let i = 0, line = 1, column = 1;
  const fail = (message, at = { line, column }) => {
    throw new SyntaxError(`${message} at line ${at.line}, column ${at.column}`);
  };
  const advance = () => {
    const c = source[i++];
    if (c === '\n') { line++; column = 1; } else column++;
    return c;
  };
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { advance(); continue; }
    if (c === '%' || source.startsWith('//', i)) {
      while (i < source.length && source[i] !== '\n') advance();
      continue;
    }
    const at = { line, column };
    if (c === '"' || c === "'") {
      const quote = advance();
      let value = '', closed = false;
      while (i < source.length) {
        const next = advance();
        if (next === quote) { closed = true; break; }
        if (next === '\\') {
          if (i >= source.length) fail('unterminated escape', at);
          const escaped = advance();
          const escapes = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" };
          if (!Object.hasOwn(escapes, escaped)) fail(`unknown escape \\${escaped}`, at);
          value += escapes[escaped];
        } else value += next;
      }
      if (!closed) fail('unterminated string', at);
      tokens.push({ type: 'string', value, ...at });
      continue;
    }
    const num = source.slice(i).match(/^[+-]?\d+(?:\.\d+)?/);
    if (num) {
      for (let k = 0; k < num[0].length; k++) advance();
      const value = Number(num[0]);
      if (!Number.isFinite(value)) fail('numeric literal must be finite', at);
      tokens.push({ type: 'number', value, ...at });
      continue;
    }
    const ident = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (ident) {
      for (let k = 0; k < ident[0].length; k++) advance();
      tokens.push({ type: 'identifier', value: ident[0], ...at });
      continue;
    }
    const op = [':-', '?-', '!=', '<=', '>=', '(', ')', ',', '.', '=', '<', '>'].find(s => source.startsWith(s, i));
    if (!op) fail(`unexpected character ${JSON.stringify(c)}`, at);
    for (let k = 0; k < op.length; k++) advance();
    tokens.push({ type: op, value: op, ...at });
  }
  tokens.push({ type: 'eof', line, column });
  let pos = 0;
  const peek = () => tokens[pos];
  const accept = type => peek().type === type ? tokens[pos++] : null;
  const expect = type => accept(type) ?? fail(`expected ${type}, found ${peek().type}`, peek());
  const term = () => {
    const t = peek();
    if (accept('number') || accept('string')) return { kind: 'const', value: t.value };
    if (accept('identifier')) {
      if (t.value === '_') return { kind: 'wildcard' };
      if (/^[A-Z_]/.test(t.value)) return { kind: 'var', name: t.value };
      return { kind: 'const', value: t.value };
    }
    return fail('expected term', t);
  };
  const atom = () => {
    const t = expect('identifier');
    if (!/^[a-z]/.test(t.value) || t.value === 'not') fail('expected lowercase predicate', t);
    expect('(');
    const terms = [];
    if (peek().type !== ')') {
      terms.push(term());
      while (accept(',')) terms.push(term());
    }
    expect(')');
    return { type: 'atom', predicate: t.value, terms, negated: false };
  };
  const literal = () => {
    if (peek().type === 'identifier' && peek().value === 'not') {
      pos++;
      return { ...atom(), negated: true };
    }
    if (peek().type === 'identifier' && tokens[pos + 1]?.type === '(') return atom();
    const left = term();
    const op = peek();
    if (!['=', '!=', '<', '<=', '>', '>='].includes(op.type)) fail('expected comparison operator', op);
    pos++;
    return { type: 'comparison', op: op.type, left, right: term() };
  };
  const program = { facts: [], rules: [], queries: [] };
  while (peek().type !== 'eof') {
    if (accept('?-')) {
      program.queries.push(atom());
      expect('.');
      continue;
    }
    const start = peek(), head = atom();
    if (accept(':-')) {
      const body = [literal()];
      while (accept(',')) body.push(literal());
      expect('.');
      program.rules.push({ id: `r${program.rules.length + 1}`, head, body });
    } else {
      expect('.');
      if (head.terms.some(t => t.kind !== 'const')) fail('facts must be ground', start);
      program.facts.push(head);
    }
  }
  return program;
}
