import {positionAt} from '../../text/src/index.ts';
export type Token = {name:string; start:number; end:number};
export type Issue = {code:string; message:string; start:number; end:number};
export type Node = {
  kind:'let'|'print'|'open'|'close'|'empty'|'invalid';
  start:number; end:number; raw:string; name?:Token; refs:Token[]; issues:Issue[];
};
export type Parsed = {text:string; nodes:Node[]; issues:Issue[]; reparsed:number};
/** @id CODE-PARSER-001 @implements REQ-PARSER-001 REQ-PARSER-002 REQ-PARSER-003 REQ-PARSER-004 REQ-PARSER-005 REQ-PARSER-008 */
function parseLine(raw:string,start:number):Node {
  const n:Node = {kind:'empty',start,end:start+raw.length,raw,refs:[],issues:[]};
  const tokens:Token[] = [];
  for (const m of raw.matchAll(/\/\/.*|[A-Za-z_][A-Za-z_0-9]*|\d+|[=+;{}]|\S/gu)) {
    if (m[0].startsWith('//')) break;
    tokens.push({name:m[0],start:start+m.index!,end:start+m.index!+m[0].length});
  }
  if (!tokens.length) return n;
  const issue = (code:string,t:Token,message:string) => n.issues.push({code,message,start:t.start,end:t.end});
  if (tokens.length === 1 && ['{','}'].includes(tokens[0].name)) {
    n.kind = tokens[0].name === '{' ? 'open' : 'close'; return n;
  }
  const first = tokens[0];
  let cursor = 1;
  const identifier = (s:string) => /^[A-Za-z_][A-Za-z_0-9]*$/.test(s) && !['let','print'].includes(s);
  if (first.name === 'let' && tokens[1] && identifier(tokens[1].name) && tokens[2]?.name === '=') {
    n.kind = 'let'; n.name = tokens[1]; cursor = 3;
  } else if (first.name === 'print') n.kind = 'print';
  else { n.kind = 'invalid'; issue('syntax',first,'Expected declaration or print'); return n; }
  const terminated = tokens.at(-1)!.name === ';';
  const end = tokens.length - (terminated ? 1 : 0);
  if (!terminated) {
    const at = tokens.at(-1)!.end;
    issue('missing-semicolon',{name:'',start:at,end:at},'Insert semicolon');
  }
  let expectTerm = true;
  for (; cursor < end; cursor++) {
    const t = tokens[cursor];
    if (expectTerm) {
      if (identifier(t.name)) n.refs.push(t);
      else if (!/^\d+$/.test(t.name)) issue('syntax',t,'Expected integer or identifier');
    } else if (t.name !== '+') issue('syntax',t,'Expected +');
    expectTerm = !expectTerm;
  }
  if (expectTerm) issue('syntax',tokens[Math.max(0,end-1)],'Expected expression term');
  return n;
}
/** @id CODE-PARSER-006 @implements REQ-PARSER-006 REQ-PARSER-007 */
export function parse(text:string,previous?:Parsed):Parsed {
  const cached = new Map(previous?.nodes.map(n => [`${n.start}:${n.raw}`,n]));
  const nodes:Node[] = []; let start = 0, reparsed = 0;
  for (const raw of text.split('\n')) {
    const old = cached.get(`${start}:${raw}`);
    const node = old ?? parseLine(raw,start);
    if (!old) reparsed++;
    nodes.push(node); start += raw.length+1;
  }
  // Validate final checkpoint against the shared UTF-16 coordinate contract.
  positionAt(text,text.length);
  return {text,nodes,issues:nodes.flatMap(n => n.issues),reparsed};
}
