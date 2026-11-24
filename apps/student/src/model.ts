import type {Bot, DemoAction, Order, OrderStatus, PickupState, Session} from './api';

// Google Stitch export, 17 November 2026: orange actions, navy text, lavender surfaces.
export const COLORS = {
  ink:'#0B1C30', muted:'#565E74', forest:'#0B1C30', dark:'#0B1C30',
  mint:'#D3EDE9', primary:'#A63B00', lime:'#FF5E00', onLime:'#FFFFFF',
  lavender:'#DAE2FD', orange:'#FF5E00', peach:'#FFDBCE',
  canvas:'#F8F9FF', white:'#FFFFFF', line:'#DCE9FF', danger:'#BA1A1A',
  pale:'#EFF4FF', teal:'#006A61',
};
export const STATUS_COPY: Record<OrderStatus, {label: string; title: string; description: string}> = {
  Pending: {label: 'Awaiting rider', title: 'A little closer to your door.', description: 'Your compartment is reserved. Waiting for the rider to load your parcel at Gate 2.'},
  Loaded: {label: 'Getting ready', title: 'Packed. Locked. Almost off.', description: 'Your parcel is safely loaded. The bot departs when full or when its loading window ends.'},
  Transit: {label: 'On the way', title: 'Your parcel is on the move.', description: 'The bot is travelling to your hostel. We will keep your delivery status updated here.'},
  Arrived: {label: 'Ready to collect', title: 'A small trip. A happy arrival.', description: 'Your delivery has arrived. Pay the ₹10 delivery fee to collect your parcel.'},
  Paid: {label: 'Payment confirmed · Waiting for unlock', title: 'Payment confirmed.', description: 'Waiting for a fresh unlock acknowledgement from the bot. Keep this screen open before collection.'},
  Completed: {label: 'Delivery complete', title: 'Delivered. Day made.', description: 'Your parcel was collected and the lid is closed. Thanks for travelling the last stretch with us.'},
  Failed: {label: 'Needs attention', title: 'Let’s get this sorted.', description: 'This delivery needs attention. Please check the details and contact your campus operator.'},
};
export const FLOW: OrderStatus[] = ['Pending', 'Loaded', 'Transit', 'Arrived', 'Paid', 'Completed'];
export const isActive = (order: Order) => !['Completed', 'Failed'].includes(order.status);
export const shortId = (id: string) => 'HX–' + id.slice(0, 6).toUpperCase();
export const formatAmount = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', {maximumFractionDigits: 2});
export const formatTime = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'}) : 'Not available';
export const formatDate = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'}) : '—';
export const nextDemoAction = (status: OrderStatus): {action: DemoAction; label: string} | null => ({
  Pending: {action: 'load' as const, label: 'Simulate rider loading'},
  Loaded: {action: 'dispatch' as const, label: 'Advance demo clock & dispatch'},
  Transit: {action: 'arrive' as const, label: 'Simulate hostel arrival'},
  Arrived: {action: 'pay' as const, label: 'Simulate ₹10 payment'},
  Paid: {action: 'close_lid' as const, label: 'Simulate collection & lid closed'},
  Completed: null, Failed: null,
})[status];
export function isStale(lastSeen?: string | null, now = Date.now()) {
  return !lastSeen || !Number.isFinite(Date.parse(lastSeen)) || now - Date.parse(lastSeen) > 15000;
}

export function freshRoverPosition(bot: Bot | null, now = Date.now()) {
  if (!bot || isStale(bot.last_seen_at, now) || isStale(bot.telemetry_observed_at, now)) return null;
  const {current_lat: lat, current_lng: lng} = bot;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90 ||
      typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
  return {lat, lng};
}

// Real pickup readiness belongs to one order and bay. Rover-wide UNLOCKED
// only drives explicitly simulated sessions; it cannot prove a real bay opened.
export function derivePickupState(order: Pick<Order, 'status' | 'bot' | 'pickup_state'>, mode: Session['mode'], now = Date.now()): PickupState {
  if (order.status !== 'Paid') return 'not_ready';
  const bot = order.bot;
  const fresh = (value?: string | null) => !!value && Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= now && now - Date.parse(value) <= 15000;
  if (mode !== 'real') {
    return bot?.status === 'UNLOCKED' && fresh(bot.last_seen_at) ? 'open' : 'otp_required';
  }
  if (order.pickup_state === 'unlock_pending' || order.pickup_state === 'reconciliation_required') {
    return order.pickup_state;
  }
  if (!bot || bot.status === 'FAULT_MODE' || !fresh(bot.last_seen_at) || !fresh(bot.telemetry_observed_at)) return 'not_ready';
  return order.pickup_state === 'open' || order.pickup_state === 'otp_required' ? order.pickup_state : 'not_ready';
}
