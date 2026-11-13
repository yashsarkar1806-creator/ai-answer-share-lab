import { writeFileSync } from 'node:fs';
import { generateDemo } from '../src/demo.js';
import { toCSV } from '../src/geo.js';
writeFileSync(new URL('../data/murmur-synthetic-ai-answers.csv', import.meta.url), toCSV(generateDemo()) + '\n');
console.log('wrote data/murmur-synthetic-ai-answers.csv');
