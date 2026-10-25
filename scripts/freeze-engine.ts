import { freezeEngine, verifyFrozenEngine } from '../eval/freeze.js';
if (process.argv.includes('--verify')) { await verifyFrozenEngine(); console.info('The engine matches its final freeze.'); }
else await freezeEngine();
