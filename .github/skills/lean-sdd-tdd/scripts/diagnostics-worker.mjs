import { diagnoseTypeScript } from './diagnostics-typescript.mjs';
import { diagnoseESLint } from './diagnostics-eslint.mjs';
import { providerFailure } from './diagnostics.mjs';

/** @id CODE-DIAGCLI-002 @implements REQ-DIAGCLI-004 REQ-DIAGCLI-005 */
const [source, root] = process.argv.slice(2);
try {
  const result = source === 'typescript' ? await diagnoseTypeScript(root)
    : source === 'eslint' ? await diagnoseESLint(root) : providerFailure(source, 'Unknown diagnostic provider');
  process.stdout.write(JSON.stringify(result), () => process.exit(0));
} catch (error) {
  process.stdout.write(JSON.stringify(providerFailure(source, `Provider failed: ${error.message}`)), () => process.exit(0));
}
