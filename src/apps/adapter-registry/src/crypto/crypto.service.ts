import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;

export interface EncryptedPayload {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
  salt: Buffer;
}

/**
 * AES-256-GCM encryption service.
 * Key is derived via scrypt from VAULT_ENC_KEY + per-record salt.
 */
@Injectable()
export class CryptoService {
  private readonly masterKey: string;

  constructor(config: ConfigService) {
    const key = config.getOrThrow<string>('VAULT_ENC_KEY');
    if (key.length < 16) {
      throw new Error('VAULT_ENC_KEY must be at least 16 characters');
    }
    this.masterKey = key;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const salt = randomBytes(SALT_LENGTH);
    const key = scryptSync(this.masterKey, salt, KEY_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return { encrypted, iv, tag, salt };
  }

  decrypt(payload: EncryptedPayload): string {
    const key = scryptSync(this.masterKey, payload.salt, KEY_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, payload.iv);
    decipher.setAuthTag(payload.tag);

    return Buffer.concat([decipher.update(payload.encrypted), decipher.final()]).toString('utf8');
  }
}
