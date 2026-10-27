import * as Crypto from 'expo-crypto';

export type OrderStatus = 'Pending' | 'Loaded' | 'Transit' | 'Arrived' | 'Paid' | 'Completed' | 'Failed';
export type User = { id: string; name: string; hostel_block: string };
export type Bot = { id: string; status: string; battery_level: number | null; current_lat: number | null; current_lng: number | null; last_seen_at: string | null; load_deadline_at?: string | null };
export type Order = {
  id: string; status: OrderStatus; destination_hostel_block: string; parcel_label: string | null;
  amount: number; currency: string; created_at: string; rider_due_at: string;
  compartment_id: number | null; bot: Bot | null; timeline: {status: string; at: string}[];
  payment_status: string | null; failure_reason?: string | null; is_demo?: boolean;
};
export type DemoAction = 'load' | 'dispatch' | 'arrive' | 'pay' | 'close_lid';
export type Session = { access_token: string; token_type: string; expires_in: number; mode: string; user: User };
export type Payment = { order_id: string; amount: number; currency: string; provider: 'demo' | 'razorpay'; status: 'pending' | 'paid'; qr_image_url: string | null; qr_payload: string | null; expires_at: string | null };

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

export async function request<T>(path: string, token?: string, options: {method?: string; body?: unknown; idempotencyKey?: string} = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(API_URL + path, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? {'Content-Type': 'application/json'} : {}),
        ...(token ? {Authorization: 'Bearer ' + token} : {}),
        ...(options.idempotencyKey ? {'Idempotency-Key': options.idempotencyKey} : {}),
      },
      ...(options.body !== undefined ? {body: JSON.stringify(options.body)} : {}),
      signal: controller.signal,
    });
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const detail = (body as {detail?: unknown} | null)?.detail;
      const message = typeof detail === 'string' ? detail : response.status === 401 ? 'Your session expired. Please sign in again.' : 'We could not complete this request. Please try again.';
      throw new ApiError(message, response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).name === 'AbortError') throw new ApiError('The server took too long to respond. Please try again.', 0);
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  } finally { clearTimeout(timeout); }
}
export const newRequestId = () => Crypto.randomUUID();
