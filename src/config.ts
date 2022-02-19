import { z } from 'zod';

export const ConfigSchema = z.record(z.object({
  cwd: z.string().nonempty(),
  script: z.string().nonempty(),
}));

export type Config = z.infer<typeof ConfigSchema>;
