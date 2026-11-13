import * as module from 'node:module';

/** @id CODE-RELQ-DISCOVERY-001 @implements REQ-RELQ-002 REQ-RELQ-003 */
if (typeof module.registerHooks !== 'function') {
  throw new Error('registration discovery requires module.registerHooks (Node22.15+ or24)');
}
const registration = new URL('./release-qualification-registration.mjs', import.meta.url).href;
module.registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'node:test' && context.parentURL !== registration) {
      return { url: registration, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
