import { describe, it, expect } from 'vitest';
import * as ed from '@noble/ed25519';
import algosdk from 'algosdk';
import {
  resolveDidKey,
  verifyAgentDID,
  verifyDidSignature,
  generateTestDidKeyPair,
  decodeBase58,
  encodeBase58,
  verifyAlgorandSignature,
} from '../src/services/identity/did';

describe('DID Identity Service — did:key & Algorand Verification', () => {
  describe('Base58btc Codec', () => {
    it('should round-trip encode and decode arbitrary byte buffers', () => {
      const original = new Uint8Array([0, 0, 1, 2, 3, 255, 128, 64, 0, 42]);
      const encoded = encodeBase58(original);
      const decoded = decodeBase58(encoded);

      expect(decoded).toEqual(original);
    });

    it('should throw on invalid base58 characters', () => {
      // '0', 'O', 'I', 'l' are illegal in base58btc
      expect(() => decodeBase58('invalid0character')).toThrow(/MALFORMED_DID/);
      expect(() => decodeBase58('invalidOcharacter')).toThrow(/MALFORMED_DID/);
    });
  });

  describe('did:key Resolution (Ed25519)', () => {
    it('should correctly resolve a valid Ed25519 did:key to a 32-byte public key and DID document', async () => {
      const { did, publicKey } = await generateTestDidKeyPair();

      expect(did).toMatch(/^did:key:z6Mk/);

      const resolved = resolveDidKey(did);
      expect(resolved.keyType).toBe('ed25519');
      expect(resolved.publicKey).toEqual(publicKey);
      expect(resolved.publicKey.length).toBe(32);

      // Verify W3C DID document
      expect(resolved.didDocument).toBeDefined();
      expect(resolved.didDocument?.id).toBe(did);
      expect(resolved.didDocument?.verificationMethod).toHaveLength(1);
      expect(resolved.didDocument?.verificationMethod[0].type).toBe('Ed25519VerificationKey2020');
      expect(resolved.didDocument?.verificationMethod[0].controller).toBe(did);
      expect(resolved.didDocument?.authentication).toContain(resolved.didDocument?.verificationMethod[0].id);
    });

    it('should reject DIDs without did:key: prefix', () => {
      expect(() => resolveDidKey('did:example:12345')).toThrow(/MALFORMED_DID/);
    });

    it('should reject DIDs without multibase "z" prefix', () => {
      expect(() => resolveDidKey('did:key:b12345')).toThrow(/MALFORMED_DID/);
    });

    it('should reject DIDs with unsupported multicodec headers', () => {
      // 0x1200 is not 0xed01
      const badHeader = new Uint8Array([0x12, 0x00, ...new Uint8Array(32).fill(1)]);
      const badDid = `did:key:z${encodeBase58(badHeader)}`;

      expect(() => resolveDidKey(badDid)).toThrow(/UNSUPPORTED_KEY_TYPE/);
    });

    it('should reject DIDs with incorrect key payload length', () => {
      // 16 bytes key instead of 32 bytes
      const shortKey = new Uint8Array([0xed, 0x01, ...new Uint8Array(16).fill(1)]);
      const shortDid = `did:key:z${encodeBase58(shortKey)}`;

      expect(() => resolveDidKey(shortDid)).toThrow(/INVALID_KEY_LENGTH/);
    });
  });

  describe('Ed25519 Cryptographic Signature Verification', () => {
    it('should verify a valid signature over challenge bytes', async () => {
      const { did, privateKey } = await generateTestDidKeyPair();
      const message = 'Bizarre Cafe Challenge Nonce: 8f9b4c2e1a3d5f7';
      const messageBytes = new TextEncoder().encode(message);

      const signatureBytes = ed.sign(messageBytes, privateKey);
      const signatureHex = Buffer.from(signatureBytes).toString('hex');

      const outcome = await verifyAgentDID(did, signatureHex, message);
      expect(outcome.verified).toBe(true);
      expect(outcome.did).toBe(did);
      expect(outcome.reason).toBeUndefined();
    });

    it('should verify using alias verifyDidSignature', async () => {
      const { did, privateKey } = await generateTestDidKeyPair();
      const message = 'Verification Test Nonce';
      const signatureBytes = ed.sign(new TextEncoder().encode(message), privateKey);

      const outcome = await verifyDidSignature(did, signatureBytes, message);
      expect(outcome.verified).toBe(true);
      expect(outcome.did).toBe(did);
    });

    it('should reject a tampered challenge message', async () => {
      const { did, privateKey } = await generateTestDidKeyPair();
      const originalMessage = 'Original Challenge Nonce';
      const tamperedMessage = 'Tampered Challenge Nonce';

      const signatureBytes = ed.sign(new TextEncoder().encode(originalMessage), privateKey);

      const outcome = await verifyAgentDID(did, signatureBytes, tamperedMessage);
      expect(outcome.verified).toBe(false);
      expect(outcome.reason).toBe('INVALID_SIGNATURE');
    });

    it('should reject a tampered signature', async () => {
      const { did, privateKey } = await generateTestDidKeyPair();
      const message = 'Valid Nonce';
      const signatureBytes = ed.sign(new TextEncoder().encode(message), privateKey);

      // Mutate one byte
      signatureBytes[0] ^= 0xff;

      const outcome = await verifyAgentDID(did, signatureBytes, message);
      expect(outcome.verified).toBe(false);
      expect(outcome.reason).toBe('INVALID_SIGNATURE');
    });

    it('should reject when signed by a different key', async () => {
      const agent1 = await generateTestDidKeyPair();
      const agent2 = await generateTestDidKeyPair();

      const message = 'Shared Nonce';
      const signatureFromAgent2 = ed.sign(new TextEncoder().encode(message), agent2.privateKey);

      // Attempt to present agent1 DID with agent2's signature
      const outcome = await verifyAgentDID(agent1.did, signatureFromAgent2, message);
      expect(outcome.verified).toBe(false);
      expect(outcome.reason).toBe('INVALID_SIGNATURE');
    });

    it('should reject invalid signature format or length', async () => {
      const { did } = await generateTestDidKeyPair();
      const shortSig = '0123456789abcdef'; // 8 bytes

      const outcome = await verifyAgentDID(did, shortSig, 'Test message');
      expect(outcome.verified).toBe(false);
      expect(outcome.reason).toContain('INVALID_SIGNATURE_FORMAT');
    });
  });

  describe('Algorand DID & Address Verification', () => {
    it('should verify valid Algorand signature using algosdk', async () => {
      const account = algosdk.generateAccount();
      const did = `did:algo:${account.addr}`;
      const message = 'Algorand Auth Nonce 12345';
      const messageBytes = new TextEncoder().encode(message);

      const signatureBytes = algosdk.signBytes(messageBytes, account.sk);

      const directValid = await verifyAlgorandSignature(account.addr, signatureBytes, messageBytes);
      expect(directValid).toBe(true);

      const outcome = await verifyAgentDID(did, signatureBytes, message);
      expect(outcome.verified).toBe(true);
      expect(outcome.did).toBe(did);
    });

    it('should reject tampered message with Algorand signature', async () => {
      const account = algosdk.generateAccount();
      const did = `did:algo:${account.addr}`;
      const message = 'Original message';
      const tamperedMessage = 'Tampered message';

      const signatureBytes = algosdk.signBytes(new TextEncoder().encode(message), account.sk);

      const outcome = await verifyAgentDID(did, signatureBytes, tamperedMessage);
      expect(outcome.verified).toBe(false);
      expect(outcome.reason).toBe('INVALID_ALGORAND_SIGNATURE');
    });
  });

  describe('Deterministic Mock / Test Fixtures in Test Mode', () => {
    it('should verify mock did:key fixtures in test environment', async () => {
      const mockDid = 'did:key:z6MkmockDeterministicTestAgentFixture';
      const outcome = await verifyAgentDID(mockDid, 'dummy-sig', 'dummy-message');

      expect(outcome.verified).toBe(true);
      expect(outcome.did).toBe(mockDid);
    });
  });
});
