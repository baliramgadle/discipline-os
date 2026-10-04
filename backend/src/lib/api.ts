import { Response } from 'express';

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export const sendSuccess = <T>(res: Response, data: T, status = 200): Response =>
  res.status(status).json({
    success: true,
    data,
  } satisfies ApiEnvelope<T>);

export const sendError = (
  res: Response,
  code: string,
  message: string,
  status = 400,
): Response =>
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
    },
  } satisfies ApiEnvelope<never>);
