import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { canonicalOnionMetadata, onionLocationHeader, renderOnionBadgeSvg, verifyOnionMetadata } from '../src/lib/onion_badge.js';

const onion = `http://${'a'.repeat(56)}.onion/`;

test('onion badge verifies signed v3 metadata and emits Onion-Location', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyText = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const signed = { version: 1, site: 'https://example.test/', onion, publicKey: publicKeyText };
  signed.signature = sign(null, Buffer.from(canonicalOnionMetadata(signed)), privateKey).toString('base64');

  const verified = verifyOnionMetadata(signed);
  assert.equal(verified.onion, onion);
  assert.equal(onionLocationHeader(verified), `Onion-Location: ${onion}`);
});

test('onion badge rejects tampering, non-v3 addresses, and credentials', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyText = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const signed = { version: 1, site: 'https://example.test/', onion, publicKey: publicKeyText };
  signed.signature = sign(null, Buffer.from(canonicalOnionMetadata(signed)), privateKey).toString('base64');

  assert.throws(() => verifyOnionMetadata({ ...signed, site: 'https://changed.test/' }), /signature/);
  assert.throws(() => verifyOnionMetadata({ ...signed, onion: 'http://example.onion/' }), /v3/);
  assert.throws(() => verifyOnionMetadata({ ...signed, site: 'https://user:pass@example.test/' }), /credentials/);
});

test('rendered badge is exact-size static SVG with no active content', () => {
  const svg = renderOnionBadgeSvg();
  assert.match(svg, /width="88" height="31"/);
  assert.doesNotMatch(svg, /<script|(?:href|src)=["']https?:\/\//i);
  assert.match(svg, /ONION/);
});
