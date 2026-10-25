import type { components } from '../generated/api';

export type Session = components['schemas']['SessionResponse'];
export type Dashboard = components['schemas']['DashboardResponse'];
export type Transactions = components['schemas']['TransactionsResponse'];
export type Management = components['schemas']['ManagementResponse'];
export type Transaction = Transactions['items'][number];

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error?.code ?? 'UNAVAILABLE', body?.error?.message ?? '자료를 불러오지 못했습니다. 다시 시도해 주세요.');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
