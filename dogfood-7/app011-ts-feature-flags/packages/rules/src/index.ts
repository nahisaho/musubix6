type Literal = string | number | boolean | null;
type Comparison = 'EQ' | 'NE' | 'GT' | 'GE' | 'LT' | 'LE' | 'IN';
export type Rule =
  | { kind: 'compare'; attribute: string; operator: Comparison; value: Literal | Literal[] }
  | { kind: 'and' | 'or'; left: Rule; right: Rule }
  | { kind: 'not'; child: Rule };
type Token = { kind: 'word' | 'literal' | 'punct'; text: string; value?: Literal };

/** @id CODE-RULE-001 @implements REQ-RULE-001 REQ-RULE-002 REQ-RULE-003 REQ-RULE-005 REQ-RULE-007 REQ-RULE-008 REQ-RULE-009 */
export function parseRule(source: string): Rule {
  if (typeof source !== 'string') throw new SyntaxError('syntax: expected string');
  if (source.length > 4096) throw new SyntaxError('limit: rule length');
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < source.length) {
    if (/\s/.test(source[pos])) { pos++; continue; }
    const text = source.slice(pos);
    if ('()[],'.includes(source[pos])) {
      tokens.push({ kind: 'punct', text: source[pos++] }); continue;
    }
    const quoted = text.match(/^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/);
    if (quoted) { tokens.push({kind:'literal',text:quoted[0],value:JSON.parse(quoted[0])}); pos+=quoted[0].length; continue; }
    const numeric = text.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numeric) {
      const value = Number(numeric[0]);
      if (!Number.isFinite(value)) throw new SyntaxError('syntax: finite number required');
      tokens.push({kind:'literal',text:numeric[0],value}); pos+=numeric[0].length; continue;
    }
    const word = text.match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (word) {
      const value = word[0]==='true' ? true : word[0]==='false' ? false : null;
      const literal = ['true','false','null'].includes(word[0]);
      tokens.push({kind:literal?'literal':'word',text:word[0],...(literal?{value}:{})});
      pos+=word[0].length; continue;
    }
    throw new SyntaxError(`syntax: invalid token at ${pos}`);
  }
  let cursor = 0;
  const take = (text: string) => tokens[cursor]?.text === text ? (cursor++, true) : false;
  const expect = (text: string) => { if (!take(text)) throw new SyntaxError(`syntax: expected ${text}`); };
  const literal = (): Literal => {
    const token=tokens[cursor++];
    if (token?.kind!=='literal') throw new SyntaxError('syntax: expected literal');
    return token.value!;
  };
  const primary = (depth: number): Rule => {
    if (depth>64) throw new SyntaxError('limit: rule nesting');
    if (take('NOT')) return {kind:'not',child:primary(depth+1)};
    if (take('(')) { const result=or(depth+1); expect(')'); return result; }
    const attr=tokens[cursor++], op=tokens[cursor++];
    if (attr?.kind!=='word' || !op || !['EQ','NE','GT','GE','LT','LE','IN'].includes(op.text))
      throw new SyntaxError('syntax: expected attribute and operator');
    let value: Literal | Literal[];
    if (op.text==='IN') {
      expect('['); value=[];
      if (!take(']')) { value.push(literal()); while(take(',')) value.push(literal()); expect(']'); }
    } else value=literal();
    return {kind:'compare',attribute:attr.text,operator:op.text as Comparison,value};
  };
  const and = (depth: number): Rule => {
    let result=primary(depth);
    while(take('AND')) result={kind:'and',left:result,right:primary(depth)};
    return result;
  };
  const or = (depth: number): Rule => {
    let result=and(depth);
    while(take('OR')) result={kind:'or',left:result,right:and(depth)};
    return result;
  };
  const result=or(0);
  if (cursor!==tokens.length) throw new SyntaxError('syntax: trailing input');
  return result;
}

/** @id CODE-RULE-002 @implements REQ-RULE-001 REQ-RULE-002 REQ-RULE-003 REQ-RULE-004 REQ-RULE-005 REQ-RULE-006 REQ-RULE-008 REQ-RULE-010 */
export function evaluateRule(rule: Rule, context: Record<string, unknown>): boolean {
  if (rule.kind==='and') return evaluateRule(rule.left,context) && evaluateRule(rule.right,context);
  if (rule.kind==='or') return evaluateRule(rule.left,context) || evaluateRule(rule.right,context);
  if (rule.kind==='not') return !evaluateRule(rule.child,context);
  const comparison=rule as Extract<Rule,{kind:'compare'}>;
  const descriptor=Object.getOwnPropertyDescriptor(context,comparison.attribute);
  if(!descriptor || !('value' in descriptor)) return false;
  const value=descriptor.value, target=comparison.value;
  if (value===undefined) return false;
  switch(comparison.operator) {
    case 'EQ': return value===target;
    case 'NE': return value!==target;
    case 'IN': return (target as Literal[]).some(item=>item===value);
    default:
      if (typeof value!=='number' || !Number.isFinite(value) || typeof target!=='number') return false;
      switch(comparison.operator) {
        case 'GT': return value>target;
        case 'GE': return value>=target;
        case 'LT': return value<target;
        case 'LE': return value<=target;
      }
  }
}
