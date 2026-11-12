#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { onionLocationHeader, renderOnionBadgeSvg, verifyOnionMetadata } from '../src/lib/onion_badge.js';

const [metadataPath, outputPath, mode] = process.argv.slice(2);

if (!metadataPath || !outputPath) {
  console.error('usage: node scripts/onion-badge.js <signed-metadata.json> <output.svg> [--header]');
  process.exit(2);
}

try {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const verified = verifyOnionMetadata(metadata);
  if (mode === '--header') {
    console.log(onionLocationHeader(verified));
  } else {
    await writeFile(outputPath, renderOnionBadgeSvg(), { mode: 0o644 });
    console.log(`verified ${verified.onion}`);
    console.log(`wrote ${outputPath}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
