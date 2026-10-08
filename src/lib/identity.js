import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Quantum identity
 * A node is its Ed25519 keypair. The node id is derived from the public key,
 * so an id can not be claimed without holding the matching private key.
 */

const IDENTITY_FILE = 'identity.json';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Node id = first 32 hex chars of sha256(public key). */
export const nodeIdFromPublicKey = (publicKey) =>
  sha256(Buffer.from(publicKey, 'base64')).slice(0, 32);

const importPublicKey = (publicKey) => {
  const key = createPublicKey({
    key: Buffer.from(publicKey, 'base64'),
    format: 'der',
    type: 'spki'
  });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('not an ed25519 key');
  return key;
};

/** Verify a base64 signature against a base64 SPKI public key. Never throws. */
export const verifySignature = (data, signature, publicKey) => {
  try {
    if (typeof signature !== 'string' || typeof publicKey !== 'string') return false;
    return edVerify(null, Buffer.from(data), importPublicKey(publicKey), Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
};

const build = (privateKey, birthTimestamp) => {
  const publicKey = createPublicKey(privateKey)
    .export({ type: 'spki', format: 'der' })
    .toString('base64');

  return {
    id: nodeIdFromPublicKey(publicKey),
    publicKey,
    birthTimestamp,
    sign: (data) => edSign(null, Buffer.from(data), privateKey).toString('base64')
  };
};

/** A fresh identity that lives only in memory. */
export const createIdentity = (birthTimestamp = Date.now()) =>
  build(generateKeyPairSync('ed25519').privateKey, birthTimestamp);

/**
 * Load the node's identity from its data directory, or manifest a new one.
 */
export async function loadOrCreateIdentity(dataDir) {
  const file = path.join(dataDir, IDENTITY_FILE);

  try {
    const stored = JSON.parse(await readFile(file, 'utf8'));
    return build(createPrivateKey(stored.privateKey), stored.birthTimestamp);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Quantum identity at ${file} is unreadable: ${error.message}`);
    }
  }

  const { privateKey } = generateKeyPairSync('ed25519');
  const birthTimestamp = Date.now();

  await mkdir(dataDir, { recursive: true });
  await writeFile(
    file,
    JSON.stringify({
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      birthTimestamp
    }, null, 2),
    { mode: 0o600 }
  );

  return build(privateKey, birthTimestamp);
}
