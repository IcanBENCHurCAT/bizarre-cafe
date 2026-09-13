import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  verifyAlgorandTransaction,
  registerMockTransaction,
  clearMockTransactions,
  setMockVerificationMode,
  algodClient,
  indexerClient,
} from '../src/services/x402/algorand';

describe('Algorand Verification Service - Mock Mode', () => {
  const receiverWallet = 'CAFE_RECEIVER_ALGORAND_ADDRESS_XYZ12345';
  const senderWallet = 'CUSTOMER_ALGORAND_WALLET_ADDRESS_ABC67890';

  beforeEach(() => {
    clearMockTransactions();
    setMockVerificationMode(true);
    vi.restoreAllMocks();
  });

  it('should verify a valid registered mock transaction with full details', async () => {
    const txId = 'VALID_TX_ALGORAND_MOCK_1234567890ABCDEFGH';
    registerMockTransaction({
      txId,
      sender: senderWallet,
      receiver: receiverWallet,
      amount: 500000, // 0.5 ALGO
      confirmedRound: 154230,
      note: 'payment-for-espresso',
    });

    const result = await verifyAlgorandTransaction(txId, receiverWallet, 500000);

    expect(result.verified).toBe(true);
    expect(result.txId).toBe(txId);
    expect(result.sender).toBe(senderWallet);
    expect(result.receiver).toBe(receiverWallet);
    expect(result.amount).toBe(500000);
    expect(result.confirmedRound).toBe(154230);
  });

  it('should reject a transaction with mismatched receiver address', async () => {
    const txId = 'WRONG_RECEIVER_TX_1234567890ABCDEFGHIJKL';
    registerMockTransaction({
      txId,
      sender: senderWallet,
      receiver: 'SOME_OTHER_RECEIVER_ADDRESS_456',
      amount: 1000000,
      confirmedRound: 200,
    });

    const result = await verifyAlgorandTransaction(txId, receiverWallet, 1000000);

    expect(result.verified).toBe(false);
    expect(result.txId).toBe(txId);
    expect(result.reason).toContain('Receiver address mismatch');
  });

  it('should reject an underpaid transaction', async () => {
    const txId = 'UNDERPAID_TX_1234567890ABCDEFGHIJKLMNO';
    registerMockTransaction({
      txId,
      sender: senderWallet,
      receiver: receiverWallet,
      amount: 99999, // Required 100000
      confirmedRound: 250,
    });

    const result = await verifyAlgorandTransaction(txId, receiverWallet, 100000);

    expect(result.verified).toBe(false);
    expect(result.txId).toBe(txId);
    expect(result.amount).toBe(99999);
    expect(result.reason).toContain('Insufficient payment amount');
  });

  it('should reject an unconfirmed transaction (confirmedRound === 0)', async () => {
    const txId = 'UNCONFIRMED_TX_1234567890ABCDEFGHIJKLM';
    registerMockTransaction({
      txId,
      sender: senderWallet,
      receiver: receiverWallet,
      amount: 500000,
      confirmedRound: 0,
    });

    const result = await verifyAlgorandTransaction(txId, receiverWallet, 500000);

    expect(result.verified).toBe(false);
    expect(result.txId).toBe(txId);
    expect(result.confirmedRound).toBe(0);
    expect(result.reason).toContain('Transaction unconfirmed');
  });

  it('should reject a nonexistent transaction in mock registry', async () => {
    const txId = 'NONEXISTENT_TRANSACTION_ID_0000000000';

    const result = await verifyAlgorandTransaction(txId, receiverWallet, 100000);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('Transaction not found');
  });

  it('should reject a transaction explicitly flagged as notFound in mock registry', async () => {
    const txId = 'EXPLICIT_NOT_FOUND_TX_1234567890ABCDE';
    registerMockTransaction({
      txId,
      sender: senderWallet,
      receiver: receiverWallet,
      amount: 100000,
      notFound: true,
    });

    const result = await verifyAlgorandTransaction(txId, receiverWallet, 100000);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('Transaction not found');
  });

  it('should reject a malformed transaction ID', async () => {
    const result1 = await verifyAlgorandTransaction('', receiverWallet, 100000);
    expect(result1.verified).toBe(false);

    const result2 = await verifyAlgorandTransaction('short', receiverWallet, 100000);
    expect(result2.verified).toBe(false);
    expect(result2.reason).toContain('Malformed');

    const result3 = await verifyAlgorandTransaction('tx with invalid spaces 12345678', receiverWallet, 100000);
    expect(result3.verified).toBe(false);
    expect(result3.reason).toContain('Malformed');
  });

  it('should reject transaction when note does not match requiredNote', async () => {
    const txId = 'TX_NOTE_MISMATCH_1234567890ABCDEFGHIJK';
    registerMockTransaction({
      txId,
      sender: senderWallet,
      receiver: receiverWallet,
      amount: 200000,
      confirmedRound: 100,
      note: 'bizarre-cafe:order:espresso-123',
    });

    const result = await verifyAlgorandTransaction(txId, receiverWallet, 200000, {
      requiredNote: 'order:latte-456',
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('Transaction note mismatch');
  });

  it('should verify transaction when note matches requiredNote', async () => {
    const txId = 'TX_NOTE_MATCH_1234567890ABCDEFGHIJKLM';
    registerMockTransaction({
      txId,
      sender: senderWallet,
      receiver: receiverWallet,
      amount: 200000,
      confirmedRound: 100,
      note: 'bizarre-cafe:order:espresso-123',
    });

    const result = await verifyAlgorandTransaction(txId, receiverWallet, 200000, {
      requiredNote: 'espresso-123',
    });

    expect(result.verified).toBe(true);
    expect(result.txId).toBe(txId);
  });

  it('should accept unregistered valid-looking transaction IDs in mock mode with default parameters', async () => {
    const txId = 'GENERIC_VALID_LOOKING_TX_ID_TEST_ABC12345';
    const result = await verifyAlgorandTransaction(txId, receiverWallet, 250000);

    expect(result.verified).toBe(true);
    expect(result.txId).toBe(txId);
    expect(result.receiver).toBe(receiverWallet);
    expect(result.amount).toBe(250000);
  });
});

describe('Algorand Verification Service - Live Ledger Mode (Mocked RPC)', () => {
  const receiverWallet = 'CAFE_RECEIVER_ALGORAND_ADDRESS_XYZ12345';
  const senderWallet = 'CUSTOMER_ALGORAND_WALLET_ADDRESS_ABC67890';
  const validTxId = 'TX1234567890123456789012345678901234567890123456789012';

  beforeEach(() => {
    setMockVerificationMode(false);
    vi.restoreAllMocks();
  });

  it('should query Algod pendingTransactionInformation and verify confirmed transaction', async () => {
    vi.spyOn(algodClient, 'pendingTransactionInformation').mockReturnValue({
      do: async () => ({
        'confirmed-round': 8500,
        txn: {
          txn: {
            type: 'pay',
            amt: 1500000,
            rcv: receiverWallet,
            snd: senderWallet,
            note: Buffer.from('bizarre-cafe:payment:item1'),
          },
        },
      }),
    } as any);

    const result = await verifyAlgorandTransaction(validTxId, receiverWallet, 1000000, {
      requiredNote: 'payment:item1',
    });

    expect(result.verified).toBe(true);
    expect(result.txId).toBe(validTxId);
    expect(result.amount).toBe(1500000);
    expect(result.receiver).toBe(receiverWallet);
    expect(result.sender).toBe(senderWallet);
    expect(result.confirmedRound).toBe(8500);
  });

  it('should fall back to Indexer lookup when Algod does not have the transaction', async () => {
    vi.spyOn(algodClient, 'pendingTransactionInformation').mockReturnValue({
      do: async () => {
        throw new Error('Transaction not in pool');
      },
    } as any);

    vi.spyOn(indexerClient, 'lookupTransactionByID').mockReturnValue({
      do: async () => ({
        transaction: {
          'confirmed-round': 9200,
          sender: senderWallet,
          'payment-transaction': {
            receiver: receiverWallet,
            amount: 750000,
          },
          note: Buffer.from('order:item:xyz').toString('base64'),
        },
      }),
    } as any);

    const result = await verifyAlgorandTransaction(validTxId, receiverWallet, 500000);

    expect(result.verified).toBe(true);
    expect(result.txId).toBe(validTxId);
    expect(result.amount).toBe(750000);
    expect(result.confirmedRound).toBe(9200);
  });

  it('should fail when neither Algod nor Indexer finds the transaction', async () => {
    vi.spyOn(algodClient, 'pendingTransactionInformation').mockReturnValue({
      do: async () => null,
    } as any);

    vi.spyOn(indexerClient, 'lookupTransactionByID').mockReturnValue({
      do: async () => {
        throw new Error('Not found');
      },
    } as any);

    const result = await verifyAlgorandTransaction(validTxId, receiverWallet, 500000);

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('Transaction not found');
  });

  it('should reject non-payment transaction types (e.g. asset-transfer or app-call)', async () => {
    vi.spyOn(algodClient, 'pendingTransactionInformation').mockReturnValue({
      do: async () => ({
        'confirmed-round': 1000,
        txn: {
          txn: {
            type: 'appl',
            amt: 0,
            rcv: receiverWallet,
          },
        },
      }),
    } as any);

    const result = await verifyAlgorandTransaction(validTxId, receiverWallet, 500000);

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('Unsupported transaction type');
  });
});
