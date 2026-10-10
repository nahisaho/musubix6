/** @id CODE-DOMAIN-005 @implements REQ-DOMAIN-007 */
export function isBookingId(s: string): boolean {
  return /^bk_[0-9]{8}$/.test(s);
}

/** @id CODE-DOMAIN-006 @implements REQ-DOMAIN-008 */
export function newBookingId(seq: number): string {
  if (!Number.isInteger(seq) || seq < 0 || seq > 99999999) throw new RangeError('seq out of range');
  return `bk_${String(seq).padStart(8, '0')}`;
}
