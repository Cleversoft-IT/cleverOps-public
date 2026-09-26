// Punto d'ingresso: vero anche quando il file è lanciato tramite symlink, come fa npx
// con node_modules/.bin o macOS con /var → /private/var. Node risolve il modulo
// principale al percorso reale, mentre argv[1] resta quello invocato.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isEntryPoint(moduleUrl) {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(moduleUrl)); } catch { return false; }
}
