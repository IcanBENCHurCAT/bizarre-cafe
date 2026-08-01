/**
 * Bizarre Cafe — Comprehensive TypeScript Types
 *
 * Core domain types for the conversational cafe platform:
 * - User/Room/Message/ChatSession (core conversation model)
 * - ShopItem/Purchase/Receipt (virtual shop)
 * - SkillOffer/SkillTrade/TradeOffer (skill-swap marketplace)
 * - CafeEvent/EventAttendance (event system)
 * - PaymentPromise/PaymentStatus/X402Payment (x402 payments)
 * - VerificationChallenge/VerificationResult/AgentStatus (agent verification)
 * - OwnerMessage/OwnerMood/NarrativeEvent (narrative/owner layer)
 * - RateLimitInfo/CircuitState (infra middleware types)
 */

// ─── Utility ───────────────────────────────────────────────────────────

/** ISO-8601 timestamp string */
export type Timestamp = string;

/** UUID v4 string */
export type UUID = string;

/** Hex-encoded bytes */
export type HexString = string;

/** Base64-encoded bytes */
export type Base64String = string;

/** Non-empty string */
export type NonEmptyString = string;

// ─── Enums / Literal Types ────────────────────────────────────────────

/** Membership role within a room */
export type Role = 'host' | 'moderator' | 'member' | 'mute' | 'banned';

/** Subscription / access tier */
export type Tier = 'free' | 'premium';

/** Room visibility mode */
export type RoomVisibility = 'public' | 'private' | 'invite_only';

/** Room state */
export type RoomStatus = 'open' | 'closed' | 'archived';

/** Chat message type */
export type MessageType = 'text' | 'system' | 'action' | 'payment' | 'event';

/** Chat message direction */
export type MessageDirection = 'outgoing' | 'incoming' | 'system';

/** Chat session lifecycle state */
export type ChatSessionState = 'active' | 'idle' | 'closed' | 'migrated';

/** Shop item category */
export type ShopCategory = 'drink' | 'food' | 'decoration' | 'power' | 'collectible';

/** Shop item stock status */
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'limited';

/** Purchase status */
export type PurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded';

/** Skill category */
export type SkillCategory =
  | 'coding'
  | 'writing'
  | 'design'
  | 'data'
  | 'devops'
  | 'ai-ml'
  | 'security'
  | 'mobile'
  | 'web'
  | 'database'
  | 'other';

/** Skill proficiency level */
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/** Skill trade status */
export type TradeStatus = 'draft' | 'offered' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

/** Event type */
export type EventType = 'workshop' | 'hackathon' | 'showcase' | 'social' | 'competition' | 'meetup';

/** Event status */
export type EventStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

/** Event participation status */
export type ParticipationStatus = 'joined' | 'waiting' | 'attended' | 'left' | 'host';

/** X402 payment status */
export type PaymentStatus = 'unpaid' | 'offered' | 'verified' | 'confirmed' | 'settled' | 'expired' | 'expired' | 'refunded' | 'disputed';

/** X402 payment type */
export type PaymentType = 'micro' | 'standard' | 'subscription' | 'escrow';

/** Payment currency (Algorand native or ARC-38 token) */
export type CurrencyCode =
  | 'ALGO'
  | 'USDC'
  | 'DAI'
  | 'USDT'
  | string; // user-defined asset ID

/** Verification method */
export type VerificationMethod = 'did' | 'wallet' | 'email' | 'phone' | 'oauth';

/** Verification status */
export type VerificationStatus = 'pending' | 'verified' | 'expired' | 'revoked';

/** Circuit breaker state */
export type CircuitState = 'closed' | 'open' | 'half_open';

/** Narrative event category */
export type NarrativeCategory = 'promotion' | 'penalty' | 'discovery' | 'seasonal' | 'random';

/** Narrative event severity */
export type NarrativeSeverity = 'low' | 'medium' | 'high' | 'legendary';

/** Owner mood / vibe */
export type OwnerMood =
  | 'welcoming'
  | 'curious'
  | 'mysterious'
  | 'playful'
  | 'wise'
  | 'melancholy'
  | 'energetic'
  | 'tranquil';

/** Rate limit action */
export type RateLimitAction = 'allow' | 'throttle' | 'reject';

// ─── Timeouts / Config ────────────────────────────────────────────────

/** Configurable timeout in milliseconds */
export type TimeoutMs = number;

/** Max retry count */
export type MaxRetries = number;

/** Pagination offset */
export type Offset = number;

/** Page size */
export type PageSize = number;

// ─── Domain: User ─────────────────────────────────────────────────────

export interface User {
  /** Unique identifier */
  id: UUID;
  /** Agent display name */
  displayName: string;
  /** Human-readable description (bio) */
  description?: string;
  /** DID / decentralized identifier */
  did?: string;
  /** Wallet address (Algorand) */
  walletAddress?: string;
  /** User avatar URL */
  avatarUrl?: string;
  /** Current subscription tier */
  tier: Tier;
  /** User-defined tags / interests */
  tags: string[];
  /** Skills the user offers */
  skillsOffered: string[];
  /** Skills the user wants to learn */
  skillsWanted: string[];
  /** Credits / balance */
  balance: number;
  /** Total credits spent */
  totalSpent: number;
  /** Total credits earned */
  totalEarned: number;
  /** X402 payment receipt storage */
  x402Receipts: X402Payment['id'][];
  /** Preferred language code */
  language: string;
  /** Notification preferences */
  notifications: UserNotifications;
  /** When the user account was created */
  createdAt: Timestamp;
  /** Last seen timestamp */
  lastSeen: Timestamp;
  /** Soft-delete flag */
  deletedAt: Timestamp | null;
}

export interface UserNotifications {
  /** Enable room notifications */
  roomNotifications: boolean;
  /** Enable purchase notifications */
  purchaseNotifications: boolean;
  /** Enable trade notifications */
  tradeNotifications: boolean;
  /** Enable event notifications */
  eventNotifications: boolean;
  /** Enable narrative/event notifications */
  narrativeNotifications: boolean;
  /** Quiet hours start (24h) */
  quietHoursStart?: string;
  /** Quiet hours end (24h) */
  quietHoursEnd?: string;
}

// ─── Domain: Room ─────────────────────────────────────────────────────

export interface Room {
  /** Unique identifier */
  id: UUID;
  /** Room name (max 100 chars) */
  name: string;
  /** Room description (max 500 chars) */
  description?: string;
  /** Who can see this room */
  visibility: RoomVisibility;
  /** Current room status */
  status: RoomStatus;
  /** Room type */
  type: 'general' | 'topic' | 'private' | 'workspace' | 'support';
  /** Max concurrent members */
  maxAgents: number;
  /** Room creation timestamp */
  createdAt: Timestamp;
  /** Last activity timestamp */
  updatedAt: Timestamp;
  /** Host / creator */
  createdBy: UUID;
  /** Current active member count */
  memberCount: number;
  /** Total messages sent */
  messageCount: number;
  /** Current active session */
  activeSessionId: UUID | null;
  /** Room-specific tags */
  tags: string[];
  /** Room settings */
  settings: RoomSettings;
  /** Soft-delete flag */
  deletedAt: Timestamp | null;
}

export interface RoomSettings {
  /** Allow new members to speak */
  allowNewMembersToSpeak: boolean;
  /** Require approval for new members */
  requireApproval: boolean;
  /** Enable x402 payment gate */
  requiresPayment: boolean;
  /** Payment amount (if payment gate enabled) */
  paymentAmount?: number;
  /** Max message length */
  maxMessageLength: number;
  /** Enable file attachments */
  allowAttachments: boolean;
  /** Enable voice/video calls */
  allowMedia: boolean;
  /** Rate limit per user (messages/window) */
  rateLimitPerWindow: number;
}

export interface RoomMember {
  /** Unique room membership ID */
  id: UUID;
  /** Room reference */
  roomId: UUID;
  /** User reference */
  userId: UUID;
  /** User role within the room */
  role: Role;
  /** Joined timestamp */
  joinedAt: Timestamp;
  /** Last message read cursor */
  lastReadAt: Timestamp;
  /** Whether the user muted notifications */
  muteNotifications: boolean;
  /** Mute expiry timestamp */
  muteExpiry: Timestamp | null;
  /** Deactivated (kicked/banned) timestamp */
  leftAt: Timestamp | null;
}

// ─── Domain: Message / Chat ───────────────────────────────────────────

export interface Message {
  /** Unique identifier */
  id: UUID;
  /** Room this message belongs to */
  roomId: UUID;
  /** Chat session this message is part of */
  sessionId?: UUID;
  /** Sender user ID */
  senderId: UUID;
  /** Sender display name */
  senderName: string;
  /** Message content */
  content: string;
  /** Message type */
  type: MessageType;
  /** Message direction */
  direction: MessageDirection;
  /** Optional attachment / file reference */
  attachmentUrl?: string;
  /** Optional reply-to message ID */
  replyToId?: UUID;
  /** Optional edit history */
  editedAt?: Timestamp;
  /** Deleted-by flag */
  deletedAt: Timestamp | null;
  /** Creation timestamp */
  createdAt: Timestamp;
  /** Last update timestamp */
  updatedAt: Timestamp;
}

export interface ChatSession {
  /** Unique identifier */
  id: UUID;
  /** Room reference */
  roomId: UUID;
  /** Session title */
  title: string;
  /** Session state */
  state: ChatSessionState;
  /** Session participants */
  participantIds: UUID[];
  /** Session metadata */
  metadata: Record<string, unknown>;
  /** When the session was last active */
  lastActiveAt: Timestamp;
  /** When the session was created */
  createdAt: Timestamp;
  /** When the session was closed */
  closedAt: Timestamp | null;
}

// ─── Domain: Shop ─────────────────────────────────────────────────────

export interface ShopItem {
  /** Unique identifier */
  id: UUID;
  /** Item name */
  name: string;
  /** Item description */
  description: string;
  /** Item category */
  category: ShopCategory;
  /** Item price in credits */
  price: number;
  /** Current stock level */
  stock: number;
  /** Maximum stock before refilled */
  maxStock: number;
  /** Item icon / emoji */
  icon: string;
  /** Item image URL */
  imageUrl?: string;
  /** Whether the item is a consumable */
  isConsumable: boolean;
  /** Duration of effect (for power-ups), in seconds */
  effectDurationSec?: number;
  /** Effects / buffs the item provides */
  effects: ShopEffect[];
  /** Item availability window */
  availableFrom?: Timestamp;
  /** Item expiration */
  availableUntil?: Timestamp;
  /** Whether the item is featured */
  featured: boolean;
  /** Creator / shop owner */
  createdBy: UUID;
  /** When the item was created */
  createdAt: Timestamp;
  /** When the item was last updated */
  updatedAt: Timestamp;
  /** Soft-delete flag */
  deletedAt: Timestamp | null;
}

export interface ShopEffect {
  /** Effect key */
  key: string;
  /** Effect value (number or string) */
  value: number | string;
  /** Effect description */
  description: string;
}

export interface Purchase {
  /** Unique identifier */
  id: UUID;
  /** Purchasing user */
  userId: UUID;
  /** Item purchased */
  itemId: UUID;
  /** Item name snapshot (at time of purchase) */
  itemName: string;
  /** Quantity purchased */
  quantity: number;
  /** Total cost */
  totalCost: number;
  /** Purchase status */
  status: PurchaseStatus;
  /** Payment reference (x402) */
  paymentId?: UUID;
  /** Transaction / block hash */
  transactionHash?: string;
  /** When the purchase was made */
  createdAt: Timestamp;
  /** When the status was last updated */
  updatedAt: Timestamp;
}

export interface Receipt {
  /** Unique identifier */
  id: UUID;
  /** Purchase reference */
  purchaseId: UUID;
  /** User who owns the receipt */
  userId: UUID;
  /** Item snapshot */
  itemSnapshot: ShopItem;
  /** Quantity purchased */
  quantity: number;
  /** Total paid */
  totalPaid: number;
  /** Payment proof / receipt hash */
  paymentProof: string;
  /** Server signature for authenticity */
  serverSignature: string;
  /** Issue timestamp */
  issuedAt: Timestamp;
  /** Redemption deadline (if consumable) */
  expiresAt: Timestamp | null;
  /** Whether the receipt has been used */
  isRedeemed: boolean;
  /** When it was redeemed */
  redeemedAt: Timestamp | null;
}

// ─── Domain: Skill Swap ───────────────────────────────────────────────

export interface SkillOffer {
  /** Unique identifier */
  id: UUID;
  /** Offering user */
  userId: UUID;
  /** Skill name */
  skillName: string;
  /** Skill category */
  category: SkillCategory;
  /** Skill level of the offerer */
  level: SkillLevel;
  /** Detailed description */
  description: string;
  /** What the user wants in return */
  lookingFor: string;
  /** Offered time commitment (hours/week) */
  hoursPerWeek: number;
  /** Preferred format */
  format: 'async' | 'sync' | 'any';
  /** Offer status */
  status: 'available' | 'claimed' | 'expired' | 'withdrawn';
  /** Expiry timestamp */
  expiresAt: Timestamp;
  /** When the offer was created */
  createdAt: Timestamp;
  /** When the offer was last updated */
  updatedAt: Timestamp;
}

export interface TradeOffer {
  /** Unique identifier */
  id: UUID;
  /** Offering user */
  fromUserId: UUID;
  /** Receiving user */
  toUserId: UUID;
  /** Offer details */
  offerDetails: string;
  /** Deadline to accept */
  expiresAt: Timestamp;
  /** Trade offer status */
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  /** When the offer was created */
  createdAt: Timestamp;
  /** When the offer was last updated */
  updatedAt: Timestamp;
}

export interface SkillTrade {
  /** Unique identifier */
  id: UUID;
  /** User 1 */
  participant1: UUID;
  /** User 2 */
  participant2: UUID;
  /** What user 1 offers */
  offer1: string;
  /** What user 2 offers */
  offer2: string;
  /** Trade status */
  status: TradeStatus;
  /** Actual exchange details */
  exchangeLog?: string;
  /** When the trade was completed */
  completedAt: Timestamp | null;
  /** Mutual rating (1-5) */
  rating1?: number;
  /** Mutual rating (1-5) */
  rating2?: number;
  /** Trade notes */
  notes: string;
  /** When the trade was created */
  createdAt: Timestamp;
  /** When the trade was last updated */
  updatedAt: Timestamp;
}

// ─── Domain: Events ───────────────────────────────────────────────────

export interface CafeEvent {
  /** Unique identifier */
  id: UUID;
  /** Event name */
  name: string;
  /** Event description */
  description: string;
  /** Event type */
  type: EventType;
  /** Event status */
  status: EventStatus;
  /** Event host */
  hostId: UUID;
  /** Maximum attendees */
  maxAttendees: number;
  /** Current attendee count */
  attendeeCount: number;
  /** Event start time */
  startTime: Timestamp;
  /** Event end time */
  endTime: Timestamp;
  /** Event location / room */
  location?: string;
  /** Event tags */
  tags: string[];
  /** Whether the event requires payment */
  requiresPayment: boolean;
  /** Payment amount */
  paymentAmount?: number;
  /** Event metadata */
  metadata: Record<string, unknown>;
  /** When the event was created */
  createdAt: Timestamp;
  /** When the event was last updated */
  updatedAt: Timestamp;
}

export interface EventAttendance {
  /** Unique identifier */
  id: UUID;
  /** Event reference */
  eventId: UUID;
  /** User reference */
  userId: UUID;
  /** Participation status */
  status: ParticipationStatus;
  /** Joined timestamp */
  joinedAt: Timestamp;
  /** Left timestamp */
  leftAt: Timestamp | null;
  /** Attended timestamp */
  attendedAt: Timestamp | null;
}

// ─── Domain: Payments (x402) ──────────────────────────────────────────

export interface PaymentPromise {
  /** Unique identifier */
  id: UUID;
  /** Paying user */
  payerId: UUID;
  /** Payee / merchant */
  payeeId: UUID;
  /** Service / resource description */
  description: string;
  /** Amount owed */
  amount: number;
  /** Currency code */
  currency: CurrencyCode;
  /** Payment deadline */
  deadline: Timestamp;
  /** Payment status */
  status: PaymentStatus;
  /** Payment reference (x402) */
  x402PaymentId?: UUID;
  /** Payment note */
  note?: string;
  /** When the promise was created */
  createdAt: Timestamp;
  /** When the status was last updated */
  updatedAt: Timestamp;
}

export interface X402Payment {
  /** Unique identifier */
  id: UUID;
  /** Transaction / proposal ID per x402 spec */
  proposalId: string;
  /** Payment type */
  type: PaymentType;
  /** Amount in atomic units */
  amount: number;
  /** Currency code */
  currency: CurrencyCode;
  /** Paying wallet address */
  fromAddress: string;
  /** Receiving wallet address */
  toAddress: string;
  /** Payment status */
  status: PaymentStatus;
  /** Original x402 payment receipt / proof */
  receipt: string;
  /** Algorand transaction hash */
  txnHash?: string;
  /** Payment memo / description */
  memo?: string;
  /** Whether this is a micro-payment */
  isMicroPayment: boolean;
  /** Subscription interval (if recurring) */
  subscriptionInterval?: string;
  /** When the payment was created */
  createdAt: Timestamp;
  /** When the payment was settled */
  settledAt: Timestamp | null;
}

// ─── Domain: Verification ─────────────────────────────────────────────

export interface VerificationChallenge {
  /** Unique identifier */
  id: UUID;
  /** User being verified */
  userId: UUID;
  /** Verification method */
  method: VerificationMethod;
  /** Challenge data (e.g., message to sign) */
  challenge: string;
  /** Verification status */
  status: VerificationStatus;
  /** Signature / proof provided by the user */
  proof?: string;
  /** Challenge expiry */
  expiresAt: Timestamp;
  /** When the challenge was created */
  createdAt: Timestamp;
  /** When the challenge was verified (or expired) */
  verifiedAt: Timestamp | null;
}

export interface VerificationResult {
  /** Unique identifier */
  id: UUID;
  /** User that was verified */
  userId: UUID;
  /** Verification method used */
  method: VerificationMethod;
  /** Result: true/false */
  verified: boolean;
  /** Reason for failure (if any) */
  failureReason?: string;
  /** Verification signature / hash */
  signature?: string;
  /** Verification timestamp */
  verifiedAt: Timestamp;
  /** TTL of this verification result */
  ttlSeconds: number;
  /** Expiry of this verification */
  expiresAt: Timestamp;
}

export interface AgentStatus {
  /** User reference */
  userId: UUID;
  /** Online / idle / busy / away */
  presence: 'online' | 'idle' | 'busy' | 'away' | 'offline';
  /** Presence last updated timestamp */
  lastSeen: Timestamp;
  /** Human-readable presence message */
  statusMessage?: string;
  /** Whether the agent accepts new connections */
  acceptsConnections: boolean;
  /** Agent capabilities / features */
  capabilities: string[];
  /** Agent version / build */
  version?: string;
  /** Whether the agent is verified */
  isVerified: boolean;
  /** Verification level */
  verificationLevel: 'none' | 'basic' | 'full' | 'trusted';
}

// ─── Domain: Owner / Narrative ────────────────────────────────────────

export interface OwnerMessage {
  /** Unique identifier */
  id: UUID;
  /** Message category */
  category: NarrativeCategory;
  /** The owner's message content */
  content: string;
  /** Target audience (specific users, rooms, or 'all') */
  target: string[];
  /** Whether the message has been delivered */
  delivered: boolean;
  /** Whether the message has been read */
  read: boolean;
  /** When the message was created */
  createdAt: Timestamp;
  /** When the message was delivered */
  deliveredAt: Timestamp | null;
  /** When the message was read */
  readAt: Timestamp | null;
}

export interface OwnerMood {
  /** Current mood */
  mood: OwnerMood;
  /** Mood last changed timestamp */
  lastChangedAt: Timestamp;
  /** Mood persistence / decay duration */
  persistenceMinutes: number;
  /** Mood triggers */
  triggers: string[];
  /** Owner's current greeting */
  greeting?: string;
  /** Owner's current catchphrase */
  catchphrase?: string;
}

export interface NarrativeEvent {
  /** Unique identifier */
  id: UUID;
  /** Event category */
  category: NarrativeCategory;
  /** Event severity */
  severity: NarrativeSeverity;
  /** Event description */
  description: string;
  /** Whether the event is active */
  active: boolean;
  /** Event start time */
  startTime: Timestamp;
  /** Event duration in seconds */
  durationSec: number;
  /** Event effect / modification */
  effect: Record<string, unknown>;
  /** Whether the event has been applied to users */
  applied: boolean;
  /** When the event was created */
  createdAt: Timestamp;
  /** When the event ended */
  endedAt: Timestamp | null;
}

// ─── Domain: Infrastructure / Middleware ──────────────────────────────

export interface RateLimitInfo {
  /** Rate limit status */
  status: RateLimitAction;
  /** Maximum requests allowed in the window */
  limit: number;
  /** Remaining requests */
  remaining: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Reset timestamp (Unix seconds) */
  resetAt: number;
  /** Retry-after seconds (if rejected) */
  retryAfter?: number;
}

export interface CircuitConfig {
  /** Failure count threshold to open the circuit */
  failureThreshold: number;
  /** Time to wait before testing recovery (ms) */
  resetTimeout: number;
  /** Max allowed calls in half-open state */
  halfOpenMaxCalls: number;
}

export interface CircuitMetrics {
  /** Current circuit state */
  state: CircuitState;
  /** Current failure count */
  failureCount: number;
  /** Last failure timestamp */
  lastFailureAt: Timestamp;
  /** Half-open call count */
  halfOpenCalls: number;
  /** Total successful calls */
  totalSuccess: number;
  /** Total failed calls */
  totalFailure: number;
}

// ─── API Request / Response Shapes ────────────────────────────────────

/** Generic API success response */
export interface ApiResponse<T = unknown> {
  /** Whether the request succeeded */
  success: true;
  /** Response data */
  data: T;
}

/** Generic API error response */
export interface ApiError {
  /** Whether the request failed */
  success: false;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Optional additional details */
  details?: Record<string, unknown>;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  /** Items in this page */
  items: T[];
  /** Total item count */
  total: number;
  /** Current page offset */
  offset: number;
  /** Page size */
  limit: number;
  /** Whether there are more pages */
  hasMore: boolean;
}

/** Search request parameters */
export interface SearchParams {
  /** Query string */
  query: string;
  /** Offset for pagination */
  offset: number;
  /** Page size */
  limit: number;
  /** Additional filters */
  filters: Record<string, unknown>;
}

/** Sort order */
export type SortOrder = 'asc' | 'desc';

/** Sort specification */
export interface SortSpec {
  /** Field to sort by */
  field: string;
  /** Sort direction */
  order: SortOrder;
}
