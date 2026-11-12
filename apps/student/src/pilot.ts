import {request} from './api';

// After Hours pilot API. Fees, totals, capacity and expiry are all
// server-owned; the client only displays what the backend returns.

export type PilotWindow = {departure_id: string; hostel_block: string; window_start: string; window_end: string; capacity: number; reserved: number; remaining: number};
export type PilotMerchant = {merchant_id: string; slug: string; name: string; kind: 'tuck_shop' | 'hot_food'; hostel_block: string; insulated_bay: string | null; departures: PilotWindow[]};
export type PilotSchedule = {start_local: string; end_local: string; timezone: string; open: boolean; now_local: string; tuck_fee_paise: number; hot_food_fee_paise: number};
export type PilotItem = {item_id: string; name: string; price_paise: number};
export type PilotQuote = {quote_id: string; merchant_id: string; departure_id: string; items: {item_id: string; name: string; quantity: number; price_paise: number}[]; fee_paise: number; total_paise: number; merchant_name: string; merchant_kind: string; hostel_block: string};
export type PilotOrder = {order_id: string; status: string; payment_status: string; items: {name: string; quantity: number; price_paise: number}[]; fee_paise: number; total_paise: number; merchant_id: string; hostel_block: string; insulated_bay: string | null; rover_requested_at: string | null};

export const getSchedule = (token: string) => request<PilotSchedule>('/v1/pilot/schedule', token);
export const getMerchants = (token: string) => request<{schedule: PilotSchedule; merchants: PilotMerchant[]}>('/v1/pilot/merchants', token);
export const getItems = (token: string, merchantId: string) => request<{items: PilotItem[]}>(`/v1/pilot/merchants/${merchantId}/items`, token);
export const postQuote = (token: string, body: {merchant_id: string; departure_id: string; items: {item_id: string; quantity: number}[]}) =>
  request<PilotQuote>('/v1/pilot/quotes', token, {method: 'POST', body});
export const placeOrder = (token: string, quoteId: string) =>
  request<{order_id: string; fee_paise: number; total_paise: number; status: string}>('/v1/pilot/orders', token, {method: 'POST', body: {quote_id: quoteId}});
export const getMyOrders = (token: string) => request<{orders: PilotOrder[]}>('/v1/pilot/orders', token);
export const payOrder = (token: string, orderId: string) => request<PilotOrder>(`/v1/pilot/orders/${orderId}/pay`, token, {method: 'POST'});

// Merchant staff view: the staff token is the only credential for these
// endpoints, and every response is already scoped to that merchant.
const merchantRequest = <T>(path: string, staffToken: string, options: {method?: string} = {}) =>
  request<T>(path, undefined, {...options, headers: {'X-Pilot-Token': staffToken}});
export const getMerchantOrders = (staffToken: string) => merchantRequest<{orders: PilotOrder[]}>('/v1/pilot/merchant/orders', staffToken);
export const merchantAction = (staffToken: string, orderId: string, action: 'accept' | 'reject' | 'ready' | 'request_rover' | 'confirm_loading') =>
  merchantRequest<PilotOrder>(`/v1/pilot/merchant/orders/${orderId}/${action}`, staffToken, {method: 'POST'});
