/** @id CODE-FIXTURE-002 @implements REQ-FIXTURE-002 */
export class Registry {
  create() { return new Child(); }
}
class Child {
  get() { return 42; }
}
