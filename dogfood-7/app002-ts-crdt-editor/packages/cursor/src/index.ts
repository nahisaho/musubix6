import type { Sequence } from '@crdt/sequence';
export type Affinity='left'|'right';
export type Anchor=Readonly<{left:string|null;right:string|null;affinity:Affinity}>;
export type Selection=Readonly<{anchor:Anchor;focus:Anchor}>;
/** @id CODE-CURSOR-007 @implements REQ-CURSOR-007 */
function affinity(value:Affinity):void{
  if(value!=='left'&&value!=='right')throw new TypeError('Invalid cursor affinity');
}
/** @id CODE-CURSOR-001 @implements REQ-CURSOR-001 */
export function capture(doc:Sequence,index:number,bias:Affinity='right'):Anchor{
  affinity(bias);
  const ids=doc.visibleIds();
  if(!Number.isInteger(index)||index<0||index>ids.length)throw new RangeError('Invalid cursor index');
  return Object.freeze({left:index===0?null:ids[index-1],right:index===ids.length?null:ids[index],affinity:bias});
}
/** @id CODE-CURSOR-004 @implements REQ-CURSOR-004 REQ-CURSOR-008 */
export function resolve(doc:Sequence,anchor:Anchor):number{
  if(!anchor||typeof anchor!=='object')throw new TypeError('Invalid cursor');
  affinity(anchor.affinity);
  const all=doc.allIds();
  for(const id of [anchor.left,anchor.right])
    if(id!==null&&(typeof id!=='string'||!all.includes(id)))throw new TypeError('Unknown cursor anchor');
  return anchor.affinity==='left'?leftIndex(doc,all,anchor.left):rightIndex(doc,all,anchor.right);
}
/** @id CODE-CURSOR-002 @implements REQ-CURSOR-002 */
function leftIndex(doc:Sequence,all:string[],id:string|null):number{
  if(id===null)return 0;
  return all.slice(0,all.indexOf(id)+1).filter(x=>doc.isVisible(x)).length;
}
/** @id CODE-CURSOR-003 @implements REQ-CURSOR-003 REQ-CURSOR-005 */
function rightIndex(doc:Sequence,all:string[],id:string|null):number{
  if(id===null)return doc.visibleIds().length;
  return all.slice(0,all.indexOf(id)).filter(x=>doc.isVisible(x)).length;
}
/** @id CODE-CURSOR-006 @implements REQ-CURSOR-006 */
export function captureSelection(doc:Sequence,anchor:number,focus:number):Selection{
  return Object.freeze({anchor:capture(doc,anchor),focus:capture(doc,focus)});
}
export function resolveSelection(doc:Sequence,selection:Selection):{anchor:number;focus:number}{
  return {anchor:resolve(doc,selection.anchor),focus:resolve(doc,selection.focus)};
}
