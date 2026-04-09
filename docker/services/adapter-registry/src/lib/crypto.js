/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   crypto.js                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:33:41 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:33:42 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: docker/services/adapter-registry/src/lib/crypto.js
// AES-256-GCM encryption with scrypt key derivation for database connection strings
const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const SCRYPT_KEYLEN = 32;

/**
 * Derive a 32-byte key from VAULT_ENC_KEY using scrypt with the given salt.
 * Returns a Promise that resolves to a Buffer.
 */
const deriveKey = (salt) =>
  new Promise((resolve, reject) => {
    const raw = process.env.VAULT_ENC_KEY || '';
    crypto.scrypt(raw, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) return reject(err);
      resolve(key);
    });
  });

/**
 * Encrypt plaintext using AES-256-GCM with a fresh random salt and IV.
 * @returns {{ encrypted: Buffer, iv: Buffer, tag: Buffer, salt: Buffer }}
 */
const encrypt = async (plaintext) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await deriveKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag, salt };
};

/**
 * Decrypt ciphertext using AES-256-GCM with the stored salt.
 * @param {Buffer} encrypted
 * @param {Buffer} iv
 * @param {Buffer} tag
 * @param {Buffer} salt
 * @returns {Promise<string>}
 */
const decrypt = async (encrypted, iv, tag, salt) => {
  const key = await deriveKey(Buffer.from(salt));
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted)), decipher.final()]);
  return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };
