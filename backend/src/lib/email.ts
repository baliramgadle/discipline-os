import { env } from '../config/env.js';

export const isEmailDeliveryConfigured = () =>
  Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim() && env.EMAIL_API_URL);

export const sendEmail = async (to: string, subject: string, html: string) => {
  if (!env.RESEND_API_KEY?.trim() || !env.EMAIL_FROM?.trim() || !env.EMAIL_API_URL) {
    throw new Error('Email delivery is not configured. Set RESEND_API_KEY, EMAIL_FROM, and EMAIL_API_URL.');
  }

  const response = await fetch(env.EMAIL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned HTTP ${response.status}.`);
  }
};
