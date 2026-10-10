export type Position = {line:number; character:number};
export type Edit = {start:number; end:number; text:string};
export type Document = {uri:string; text:string; version:number; generation:number};
export type Store = {documents:Map<string,Document>; nextGeneration:number};
export function createStore():Store { return {documents:new Map(),nextGeneration:1}; }
const validVersion = (n:number) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid version');
};

/** @id CODE-TEXT-001 @implements REQ-TEXT-001 REQ-TEXT-002 */
export function open(s:Store,uri:string,text:string,version:number):Document {
  validVersion(version);
  if (s.documents.has(uri)) throw new Error('already open');
  const d = {uri,text,version,generation:s.nextGeneration++};
  s.documents.set(uri,d);
  return {...d};
}
/** @id CODE-TEXT-003 @implements REQ-TEXT-003 REQ-TEXT-004 REQ-TEXT-005 */
export function change(s:Store,uri:string,version:number,edits:Edit[]):Document {
  const d = snapshot(s,uri); validVersion(version);
  if (version <= d.version) throw new Error('stale version');
  let text = d.text;
  for (const e of edits) {
    if (!Number.isSafeInteger(e.start) || !Number.isSafeInteger(e.end) ||
        e.start < 0 || e.end < e.start || e.end > text.length) throw new Error('invalid range');
    text = text.slice(0,e.start) + e.text + text.slice(e.end);
  }
  const next = {...d,text,version};
  Object.assign(s.documents.get(uri)!,next);
  return {...next};
}
/** @id CODE-TEXT-007 @implements REQ-TEXT-007 */
export function close(s:Store,uri:string):boolean { return s.documents.delete(uri); }
/** @id CODE-TEXT-008 @implements REQ-TEXT-008 */
export function snapshot(s:Store,uri:string):Document {
  const d = s.documents.get(uri);
  if (!d) throw new Error('document not open');
  return {...d};
}
/** @id CODE-TEXT-006 @implements REQ-TEXT-006 */
export function positionAt(text:string,offset:number):Position {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) throw new Error('invalid offset');
  if (text[offset-1] === '\r' && text[offset] === '\n') throw new Error('CRLF interior');
  let line = 0, start = 0;
  for (let i = 0; i < offset; i++) if (text[i] === '\n') { line++; start = i+1; }
  return {line,character:offset-start};
}
/** @id CODE-TEXT-009 @implements REQ-TEXT-009 */
export function offsetAt(text:string,p:Position):number {
  if (!Number.isSafeInteger(p.line) || !Number.isSafeInteger(p.character) ||
      p.line < 0 || p.character < 0) throw new Error('invalid position');
  let start = 0;
  for (let line = 0; line < p.line; line++) {
    const end = text.indexOf('\n',start);
    if (end < 0) throw new Error('invalid position');
    start = end+1;
  }
  let end = text.indexOf('\n',start);
  if (end < 0) end = text.length;
  else if (end > start && text[end-1] === '\r') end--;
  if (start+p.character > end) throw new Error('invalid position');
  return start+p.character;
}
