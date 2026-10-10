import { createHash } from 'node:crypto';
export type Variant<T = unknown> = { name: string; weight: number; value: T };
const weightUnits = (weight: number) => Math.round(weight*100);

/** @id CODE-ROLL-001 @implements REQ-ROLL-001 REQ-ROLL-002 REQ-ROLL-006 REQ-ROLL-009 */
export function bucket(flag: string, user: string, salt = ''): number {
  if (![flag,user,salt].every(v=>typeof v==='string')) throw new TypeError('hash keys must be strings');
  return createHash('sha256').update(JSON.stringify([flag,user,salt])).digest().readUInt32BE(0)%10000;
}
/** @id CODE-ROLL-002 @implements REQ-ROLL-003 REQ-ROLL-004 REQ-ROLL-005 REQ-ROLL-009 */
export function inRollout(flag: string, user: string, percentage: number, salt = ''): boolean {
  if (!Number.isFinite(percentage) || percentage<0 || percentage>100) throw new RangeError('invalid percentage');
  return bucket(flag,user,salt)<Math.floor(percentage*100);
}
/** @id CODE-ROLL-003 @implements REQ-ROLL-008 */
export function validateVariants(variants: Variant[]): void {
  const names=new Set<string>();
  let total=0;
  if (!Array.isArray(variants) || !variants.length) throw new RangeError('invalid variants: empty');
  for(const v of variants) {
    const units=weightUnits(v.weight);
    if (!v.name || typeof v.name!=='string' || names.has(v.name) ||
        !Number.isFinite(v.weight) || v.weight<0 || Math.abs(units-v.weight*100)>1e-8)
      throw new RangeError('invalid variants: names or weights');
    names.add(v.name); total+=units;
  }
  if(total!==10000) throw new RangeError('invalid variants: total must be 100');
}
/** @id CODE-ROLL-004 @implements REQ-ROLL-007 */
export function chooseVariant<T>(assignment: number, variants: Variant<T>[]): Variant<T> {
  validateVariants(variants);
  if(!Number.isInteger(assignment) || assignment<0 || assignment>=10000) throw new RangeError('invalid bucket');
  let end=0;
  for(const variant of variants) {
    end+=weightUnits(variant.weight);
    if(assignment<end) return structuredClone(variant);
  }
  throw new RangeError('invalid variants partition');
}
