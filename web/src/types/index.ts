// Types for the OF Mass Messages UI

export interface Account {
  id: string;
  modelId: string;
  username: string;
  status: 'authenticated' | 'expired' | 'failed';
  subscriberCount: number;
  chatCount: number;
  lastAuth: string;
  proxyProfile?: string;
  avatarUrl?: string;
}

export interface Recipient {
  userId: number;
  username: string;
  name: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  defaultMediaIds?: string[];
  defaultPrice: number;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledMessage {
  id: string;
  accountId: string;
  accountUsername: string;
  templateId?: string;
  templateName?: string;
  messageContent: string;
  mediaIds?: string[];
  price: number;
  recipientType: 'all_subscribers' | 'all_chats' | 'collection' | 'test_user';
  recipientCount: number;
  collectionId?: string;
  collectionName?: string;
  testUserId?: string;
  scheduledAt: string;
  recurrence?: 'daily' | 'weekly' | 'monthly';
  status: 'queued' | 'processing' | 'completed' | 'cancelled' | 'failed';
  approvalStatus: 'pending' | 'approved';
  autoUnsendPrevious?: boolean;
  autoUnsendAfterMinutes?: number;
  autoUnsendAt?: string;
  successCount?: number;
  failedCount?: number;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
  // Rotation-specific fields
  isRotation?: boolean;
  rotationCaptions?: string[];
  rotationDurationHours?: number;
  rotationEndAt?: string;
}

export interface ActiveMessage {
  id: string;
  accountId: string;
  accountUsername: string;
  messageContent: string;
  mediaIds?: string[];
  price: number;
  sentAt: string;
  recipientCount: number;
}

export interface CaptionTemplate {
  id: string;
  content: string;
  type: 'free' | 'ppv';
  suggestedPrice?: number;
  priceTier?: 'low' | 'medium' | 'high';
  tags?: string[];
  useCount: number;
  lastUsedAt?: string;
  conversionRate?: number;
  totalRevenue?: number;
  rpm?: number;
}

export interface Campaign {
  id: string;
  accountId: string;
  accountUsername: string;
  messageContent: string;
  mediaIds?: string[];
  mediaThumbnails?: string[];
  mediaTypes?: ('photo' | 'video' | 'gif')[];
  captionId?: string;
  price: number;
  recipientCount: number;
  successCount: number;
  failedCount: number;
  openedCount?: number;
  purchasedCount?: number;
  totalRevenue: number;
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  templateName?: string;
  // Calculated metrics
  deliveryRate?: number;
  openRate?: number;
  conversionRate?: number;
  rpm?: number;
}

export interface CampaignResult {
  id: string;
  userId: number;
  username: string;
  success: boolean;
  errorMessage?: string;
  sentAt: string;
}

export interface Collection {
  id: string;
  name: string;
  userCount: number;
  createdAt: string;
}

export interface VaultFolder {
  id: string;
  name: string;
  mediaCount: number;
}

export interface VaultMedia {
  id: string;
  type: 'image' | 'video';
  thumbnailUrl: string;
  previewUrl: string;
  createdAt: string;
}

// API Response Types for Vault
export interface VaultApiModel {
  model_id: string;
  label: string;
  authenticated: boolean;
  last_auth_refresh: string | null;
}

export interface VaultApiFolder {
  id: number;
  name: string;
  type?: string;
  hasMedia?: boolean;
  has_media?: boolean;
  canAddMedia?: boolean;
  can_add_media?: boolean;
  cannotAddReason?: string | null;
  cannot_add_reason?: string | null;
  postsCount?: number;
  posts_count?: number;
  mediaCount?: number;
  media_count?: number;
  photosCount?: number;
  photos_count?: number;
  videosCount?: number;
  videos_count?: number;
  audiosCount?: number;
  audios_count?: number;
  gifsCount?: number;
  gifs_count?: number;
}

export interface VaultApiMedia {
  id: number;
  type: 'photo' | 'video' | 'gif' | 'audio';
  url: string | null;
  src: string | null;
  preview: string | null;
  thumb: string | null;
  squarePreview?: string | null;
  square_preview?: string | null;
  source_url?: string | null;
  duration?: number;
  createdAt?: string;
  created_at?: string;
}

export interface VaultMediaResponse {
  media: VaultApiMedia[];
  count: number;
  has_more: boolean;
  total_count: number;
}

export interface VaultFoldersResponse {
  folders: VaultApiFolder[];
}

export interface VaultModelsResponse {
  models: VaultApiModel[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  accountAccess: string[];
  lastLogin?: string;
}

export interface Analytics {
  messagesSent: number;
  messagesDelivered: number;
  messagesOpened: number;
  ppvRevenue: number;
  deliveryRate: number;
  openRate: number;
}

export interface DailyAnalytics extends Analytics {
  date: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  accountUsername?: string;
  timestamp: string;
}

// Collections API Types
export interface CollectionsApiModel {
  model_id: string;
  username: string;
  authenticated: boolean;
}

export interface CollectionsApiCollection {
  id: number | string;  // Can be int for custom lists or string like "fans", "following"
  name: string;
  usersCount: number;
  type?: string;
}

export interface CollectionsApiUser {
  id: number;
  username: string;
  name?: string;
  avatar?: string;
}
