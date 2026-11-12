import { createPublicKey, verify as verifySignature } from 'node:crypto';

const ONION_V3_HOST = /^[a-z2-7]{56}\.onion$/i;

const reject = (message) => {
  throw new Error(`invalid onion service metadata: ${message}`);
};

const urlValue = (value, name, protocols) => {
  if (typeof value !== 'string' || value.length > 2048) reject(`${name} is missing or too long`);
  let url;
  try { url = new URL(value); } catch { reject(`${name} is not a URL`); }
  if (!protocols.includes(url.protocol)) reject(`${name} uses an unsupported protocol`);
  if (url.username || url.password) reject(`${name} must not contain credentials`);
  url.hash = '';
  return url.toString();
};

export const canonicalOnionMetadata = ({ version = 1, site, onion }) =>
  JSON.stringify({ version, site, onion });

export function verifyOnionMetadata(candidate) {
  if (!candidate || typeof candidate !== 'object') reject('metadata is not an object');
  if (candidate.version !== 1) reject('unsupported version');

  const site = urlValue(candidate.site, 'site', ['https:']);
  const onion = urlValue(candidate.onion, 'onion', ['http:', 'https:']);
  const onionUrl = new URL(onion);
  if (!ONION_V3_HOST.test(onionUrl.hostname)) reject('onion must be a Tor v3 address');
  if (typeof candidate.publicKey !== 'string' || typeof candidate.signature !== 'string') {
    reject('publicKey and signature are required');
  }

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(candidate.publicKey, 'base64'),
      format: 'der',
      type: 'spki'
    });
  } catch {
    reject('publicKey is not a valid key');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') reject('publicKey must be Ed25519');

  const canonical = canonicalOnionMetadata({ version: 1, site, onion });
  let valid = false;
  try {
    valid = verifySignature(null, Buffer.from(canonical), publicKey, Buffer.from(candidate.signature, 'base64'));
  } catch { /* malformed signatures are simply invalid */ }
  if (!valid) reject('signature does not match site and onion address');

  return { version: 1, site, onion, publicKey: candidate.publicKey, signature: candidate.signature };
}

export const onionLocationHeader = (metadata) => `Onion-Location: ${verifyOnionMetadata(metadata).onion}`;

export function renderOnionBadgeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="31" viewBox="0 0 88 31" role="img" aria-labelledby="title desc">
  <title id="title">Onion service available</title>
  <desc id="desc">A monochrome web badge indicating that a site is available through a Tor onion service.</desc>
  <defs><pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".45" fill="#a9a2b7" opacity=".52"/><circle cx="3" cy="3" r=".45" fill="#a9a2b7" opacity=".22"/></pattern></defs>
  <rect width="88" height="31" fill="#070707"/><rect x=".5" y=".5" width="87" height="30" fill="url(#dither)" stroke="#bdbdb7"/><rect x="2.5" y="2.5" width="20" height="26" fill="#111110" stroke="#4a4a46"/>
  <path d="M12.5 8.2c-2.7 0-4.8 2.6-4.8 6.1 0 4.6 2.4 7.1 4.8 7.1s4.8-2.5 4.8-7.1c0-3.5-2.1-6.1-4.8-6.1Z" fill="none" stroke="#d7d7d2" stroke-width="1"/><path d="M12.5 8.2c-.8-1.7.3-3.1 1.5-3.7M12.5 8.2c.8-1.7-.3-3.1-1.5-3.7M8.5 16h8M9.1 19h6.8" fill="none" stroke="#a695c3" stroke-width="1"/><path d="M6.5 24.2h12" stroke="#777772" stroke-width="1"/>
  <text x="26" y="12.2" fill="#f0f0e9" font-family="monospace" font-size="7" font-weight="700" letter-spacing=".45">ONION</text><text x="26" y="20.2" fill="#d7d7d2" font-family="monospace" font-size="6.2" letter-spacing=".15">SERVICE</text><text x="26" y="26.2" fill="#a695c3" font-family="monospace" font-size="5.2" letter-spacing=".25">VIA TOR</text>
</svg>`;
}
