import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { transform } from '../src/transform.js';
const name = (await readdir('.')).find(n => n.endsWith('.pdf'));
if (!name) throw new Error('Place the original example PDF in the project root.');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/modified-label.pdf', await transform(await readFile(name)));
console.log('Generated artifacts/modified-label.pdf');
