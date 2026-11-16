import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const sourceDirectory = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const destinationDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const entries = JSON.parse(readFileSync(join(sourceDirectory, 'cases.json'), 'utf8')) as { markdown: string }[];
const html: string[] = [];
for (const entry of entries) html.push(parse(entry.markdown));
writeFileSync(join(destinationDirectory, 'html.json'), JSON.stringify(html));
