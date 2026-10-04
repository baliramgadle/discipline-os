import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const localEnv = resolve(process.cwd(), '.env');
const parentEnv = resolve(process.cwd(), '..', '.env');
dotenv.config({ path: existsSync(localEnv) ? localEnv : parentEnv });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(5000),

  CLIENT_URL: z.url(),

  API_URL: z.url(),

  DATABASE_URL: z
    .url()
    .optional(),

  DIRECT_URL: z
    .string()
    .min(1)
    .optional(),

  JWT_SECRET: z
    .string()
    .min(16),

  JWT_REFRESH_SECRET: z
    .string()
    .min(16),

  RESEND_API_KEY: z.string().optional(),

  EMAIL_FROM: z.string().optional(),
  EMAIL_API_URL: z.url().optional(),
}).superRefine((configuration, context) => {
  if (configuration.NODE_ENV !== 'production') return;
  if (!configuration.DATABASE_URL) {
    context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL is required in production.' });
  } else if (/(YOUR_|PLACEHOLDER|CHANGE_ME|CHANGEME|WILL_BE|GENERATED_LATER|example|demo|replace-with)/i.test(configuration.DATABASE_URL)) {
    context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL must be a real production database URL.' });
  }
  if (configuration.JWT_SECRET.length < 32 || /(YOUR_|PLACEHOLDER|CHANGE_ME|CHANGEME|WILL_BE|GENERATED_LATER|example|demo|replace-with)/i.test(configuration.JWT_SECRET)) {
    context.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET must be a non-placeholder value of at least 32 characters in production.' });
  }
  if (configuration.JWT_REFRESH_SECRET.length < 32 || /(YOUR_|PLACEHOLDER|CHANGE_ME|CHANGEME|WILL_BE|GENERATED_LATER|example|demo|replace-with)/i.test(configuration.JWT_REFRESH_SECRET)) {
    context.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'JWT_REFRESH_SECRET must be a non-placeholder value of at least 32 characters in production.' });
  }
  if (configuration.JWT_SECRET === configuration.JWT_REFRESH_SECRET) {
    context.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'Access and refresh JWT secrets must be different.' });
  }
  if (new URL(configuration.CLIENT_URL).protocol !== 'https:') {
    context.addIssue({ code: 'custom', path: ['CLIENT_URL'], message: 'CLIENT_URL must use HTTPS in production.' });
  }
  if (new URL(configuration.API_URL).protocol !== 'https:') {
    context.addIssue({ code: 'custom', path: ['API_URL'], message: 'API_URL must use HTTPS in production.' });
  }
  const emailConfigurationCount = [
    configuration.RESEND_API_KEY?.trim(),
    configuration.EMAIL_FROM?.trim(),
    configuration.EMAIL_API_URL,
  ].filter(Boolean).length;
  if (emailConfigurationCount !== 0 && emailConfigurationCount !== 3) {
    context.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Configure RESEND_API_KEY, EMAIL_FROM, and EMAIL_API_URL together, or leave all three unset.' });
  }
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;