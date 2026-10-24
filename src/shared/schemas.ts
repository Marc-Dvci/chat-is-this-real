import { z } from 'zod';

export const serverConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4747)
});

export const healthSchema = z.object({
  name: z.literal('chat-is-this-real'),
  status: z.literal('ok'),
  milestone: z.literal('M0')
});

export type Health = z.infer<typeof healthSchema>;
