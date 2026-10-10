import {clone, fingerprint, own, validValue, validateSchema} from '../model/index.ts';
import type {Schema} from '../model/index.ts';
import {canRead, sourceField} from '../compatibility/index.ts';

type ValueObject = Record<string, unknown>;
const isObject=(value: unknown): value is ValueObject =>
  value!==null && typeof value==='object' && !Array.isArray(value) && !Buffer.isBuffer(value);
const keys=(value: ValueObject, expected: string[]): boolean =>
  Object.keys(value).length===expected.length && expected.every(k=>own(value,k));

interface Envelope {format: 1; fingerprint: string; datum: unknown}
function parseEnvelope(bytes: Uint8Array): Envelope {
  let value: unknown;
  try { value=JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw new Error('malformed envelope'); }
  if(!isObject(value) || !keys(value,['format','fingerprint','datum']) || value.format!==1)
    throw new Error('invalid envelope');
  return value as unknown as Envelope;
}

/** @id CODE-CODEC-001 @implements REQ-CODEC-001 REQ-CODEC-004 REQ-CODEC-005 REQ-CODEC-007 */
function compileEncoder(schema: Schema): (datum: unknown)=>unknown {
  if(Array.isArray(schema)) {
    const branches=schema.map(compileEncoder);
    return datum=>{
      const branch=schema.findIndex(s=>validValue(s,datum));
      return {branch,value:branches[branch](datum)};
    };
  }
  if(typeof schema==='string') return schema==='bytes' ?
    datum=>({bytes:(datum as Buffer).toString('base64')}) : datum=>datum;
  switch(schema.type) {
    case 'enum': return datum=>datum;
    case 'array': {
      const item=compileEncoder(schema.items);
      return datum=>(datum as unknown[]).map(item);
    }
    case 'map': {
      const item=compileEncoder(schema.values);
      return datum=>Object.fromEntries(Object.entries(datum as ValueObject).map(([k,v])=>[k,item(v)]));
    }
    case 'record': {
      const fields=schema.fields.map(f=>({f,encode:compileEncoder(f.type)}));
      return datum=>Object.fromEntries(fields.map(({f,encode})=>[f.name,
        encode(own(datum as object,f.name)?(datum as ValueObject)[f.name]:clone(f.default))]));
    }
  }
}

/** @id CODE-CODEC-008 @implements REQ-CODEC-008 REQ-CODEC-010 */
function fromWire(schema: Schema, wire: unknown): unknown {
  if(Array.isArray(schema)) {
    if(!isObject(wire) || !keys(wire,['branch','value']) || !Number.isInteger(wire.branch) ||
      (wire.branch as number)<0 || (wire.branch as number)>=schema.length) throw new Error('invalid datum union');
    const branch=schema[wire.branch as number];
    const datum=fromWire(branch,wire.value);
    if(!validValue(branch,datum)) throw new Error('invalid datum for union branch');
    return datum;
  }
  if(schema==='bytes') {
    if(!isObject(wire) || !keys(wire,['bytes']) || typeof wire.bytes!=='string') throw new Error('invalid datum bytes');
    const b=Buffer.from(wire.bytes,'base64');
    if(b.toString('base64')!==wire.bytes) throw new Error('invalid datum bytes');
    return b;
  }
  if(typeof schema==='string') return wire;
  if(schema.type==='enum') return wire;
  if(schema.type==='array') {
    if(!Array.isArray(wire)) throw new Error('invalid datum array');
    return wire.map(v=>fromWire(schema.items,v));
  }
  if(schema.type==='map') {
    if(!isObject(wire)) throw new Error('invalid datum map');
    return Object.fromEntries(Object.entries(wire).map(([k,v])=>[k,fromWire(schema.values,v)]));
  }
  if(!isObject(wire) || !keys(wire,schema.fields.map(f=>f.name))) throw new Error('invalid datum record');
  return Object.fromEntries(schema.fields.map(f=>[f.name,fromWire(f.type,wire[f.name])]));
}

/** @id CODE-CODEC-006 @implements REQ-CODEC-006 */
function resolveWire(reader: Schema, writer: Schema, wire: unknown): unknown {
  if(Array.isArray(writer)) {
    const tagged=wire as {branch:number;value:unknown};
    return resolveWire(reader,writer[tagged.branch],tagged.value);
  }
  if(Array.isArray(reader)) {
    const branch=reader.find(s=>canRead(s,writer));
    if(branch===undefined) throw new Error('incompatible reader');
    return resolveWire(branch,writer,wire);
  }
  if(typeof reader==='string' || typeof writer==='string') return fromWire(writer,wire);
  if(reader.type==='enum' && writer.type==='enum') return reader.symbols.includes(wire as string)?wire:reader.default;
  if(reader.type==='array' && writer.type==='array') return (wire as unknown[]).map(v=>resolveWire(reader.items,writer.items,v));
  if(reader.type==='map' && writer.type==='map') return Object.fromEntries(Object.entries(wire as ValueObject).map(([k,v])=>[k,resolveWire(reader.values,writer.values,v)]));
  if(reader.type==='record' && writer.type==='record') return Object.fromEntries(reader.fields.map(f=>{
    const from=sourceField(f,writer);
    return [f.name,from?resolveWire(f.type,from.type,(wire as ValueObject)[from.name]):clone(f.default)];
  }));
  throw new Error('incompatible reader');
}

export interface Codec {encode(datum: unknown): Buffer; decode(bytes: Uint8Array, writer?: Schema): unknown}

/** @id CODE-CODEC-002 @implements REQ-CODEC-002 REQ-CODEC-003 */
export function createCodec(schema: Schema): Codec {
  validateSchema(schema);
  const snapshot=clone(schema);
  const identity=fingerprint(snapshot);
  const encode=compileEncoder(snapshot);
  return {
    encode(datum) {
      if(!validValue(snapshot,datum)) throw new Error('invalid datum');
      return Buffer.from(JSON.stringify({format:1,fingerprint:identity,datum:encode(datum)}));
    },
    decode(bytes,writer=snapshot) {
      validateSchema(writer);
      const envelope=parseEnvelope(bytes);
      if(envelope.fingerprint!==fingerprint(writer)) throw new Error('schema fingerprint mismatch');
      const datum=fromWire(writer,envelope.datum);
      if(!validValue(writer,datum)) throw new Error('invalid datum');
      if(!canRead(snapshot,writer)) throw new Error('incompatible reader schema');
      const result=resolveWire(snapshot,writer,envelope.datum);
      if(!validValue(snapshot,result)) throw new Error('invalid resolved datum');
      return result;
    }
  };
}
