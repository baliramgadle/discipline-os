const configuredApiOrigin = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

if (!configuredApiOrigin) {
  throw new Error('API_URL must be configured in the environment before building the frontend.');
}

export const API_ORIGIN = configuredApiOrigin;
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;
