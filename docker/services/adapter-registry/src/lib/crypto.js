// File: docker/services/adapter-registry/src/lib/crypto.js
// AES-256-GCM encryption for database connection strings
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

const getKey = () => {
  const raw = process.env.VAULT_ENC_KEY || '';
  // Pad or hash to 32 bytes
  return crypto.createHash('sha256').update(raw).digest();
};

const encrypt = (plaintext) => {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag };
};

const decrypt = (encrypted, iv, tag) => {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted)), decipher.final()]);
  return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };
