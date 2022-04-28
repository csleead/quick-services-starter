import { z } from 'zod';

export const ConfigSchema = z.record(z.object({
  cwd: z.string().nonempty(),
  script: z.string().nonempty(),
  readyText: z.string().optional().transform(s => isEmpty(s)? undefined : s),
}));

export type Config = z.infer<typeof ConfigSchema>;

function isEmpty(s?: string): boolean {
  return s === undefined || s.trim().length === 0;
}
