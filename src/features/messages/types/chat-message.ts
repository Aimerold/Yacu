import type { Message } from '@/services/message.service';

export type ChatMessage = Message & {
  status: 'sent' | 'pending' | 'failed';
  localUri?: string;
};