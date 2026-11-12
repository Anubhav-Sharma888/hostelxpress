import type {DemoAction, Order, OrderStatus} from './api';

// Google Stitch design tokens (design-system handoff, 5 November 2026):
// indigo structural canvas, lime primary action (dark text on lime), lavender
// secondary surfaces, amber for cutoffs/stale, rose for rejections.
export const COLORS = {
  ink: '#141B2B', muted: '#514F68', forest: '#293040', dark: '#293040', mint: '#E9EDFF',
  primary: '#416900', lime: '#84CC16', onLime: '#102000', lavender: '#E3DFFF',
  orange: '#FFA270', peach: '#FFDBCA', canvas: '#F9F9FF', white: '#FFFFFF',
  line: '#E4E6F3', danger: '#BA1A1A', pale: '#F1F3FF',
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
