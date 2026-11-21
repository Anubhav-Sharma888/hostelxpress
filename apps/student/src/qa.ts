// Offline QA preview is enabled until database sign-in is ready.
// Set EXPO_PUBLIC_QA_PREVIEW=0 to build without the skip option.
// The preview session is purely in-memory: sample orders render through the
// normal screens, sample actions mutate local state only, and NOTHING here
// calls Supabase, the API, payments, or rover services. Normal authentication
// and backend authorization are untouched.
import type {Bot, Order, OrderStatus, PreviewSession, User} from './api';

// Expo inlines the flag at bundle time. Unset or empty uses the QA default.
export const QA_PREVIEW = (process.env.EXPO_PUBLIC_QA_PREVIEW || '1') === '1';

export const QA_PREVIEW_LABEL = 'QA PREVIEW';

export const QA_USER: User = {
  id: 'qa-preview-user-0000-0000-0000-000000000000',
  name: 'QA Preview Student',
  hostel_block: 'apj-abdul-kalam',
};

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();

const sampleOrder = (over: {
  id: string; status: OrderStatus; payment_status: string; compartment_id: number | null;
  createdMin: number; label: string;
}): Order => ({
  id: over.id,
  status: over.status,
  destination_hostel_block: 'apj-abdul-kalam',
  parcel_label: over.label,
  amount: 1000,
  currency: 'INR',
  created_at: iso(over.createdMin),
  rider_due_at: iso(over.createdMin - 30),
  compartment_id: over.compartment_id,
  bot: over.status === 'Pending' ? null : {
    id: 'qa-preview-bot-0000-0000-0000-000000000000',
    status: (over.status === 'Completed' ? 'RETURNING' : 'AT_HOSTEL') as Bot['status'],
    battery_level: 87,
    current_lat: null,
    current_lng: null,
    last_seen_at: iso(over.createdMin - 2),
  },
  timeline: [
    {status: 'Pending', at: iso(over.createdMin)},
    {status: 'Loaded', at: iso(over.createdMin - 6)},
    {status: 'Transit', at: iso(over.createdMin - 4)},
    ...(over.status === 'Completed'
      ? [{status: 'Arrived', at: iso(over.createdMin - 3)}, {status: 'Paid', at: iso(over.createdMin - 2)}, {status: 'Completed', at: iso(over.createdMin - 1)}]
      : over.status === 'Paid'
        ? [{status: 'Arrived', at: iso(over.createdMin - 3)}, {status: 'Paid', at: iso(over.createdMin - 2)}]
        : []),
  ],
  payment_status: over.payment_status,
  is_demo: false,
});

export const QA_ORDERS: Order[] = [
  sampleOrder({id: 'qa-order-active-0000-0000-0000-000000000001', status: 'Transit', payment_status: 'Unpaid', compartment_id: 2, createdMin: 9, label: 'QA preview · library pickup'}),
  sampleOrder({id: 'qa-order-done-0000-0000-0000-000000000002', status: 'Completed', payment_status: 'SimPaid', compartment_id: 1, createdMin: 1440, label: 'QA preview · yesterday tuck box'}),
];

// The preview session carries no credential-shaped field: `Session` is a
// discriminated union and the qa-preview variant has no access_token, so no
// code on this path can hold or send a bearer token. refresh() is a no-op in
// preview and every network consumer must narrow on `mode` first.
export const QA_SESSION: PreviewSession = {
  mode: 'qa-preview',
  user: QA_USER,
};

// A sample booking created inside the preview: purely local, marked with a
// QA label, and priced like a standard Gate 2 parcel (₹10).
export function makeLocalBooking(label: string, hostel: string, id: string): Order {
  const now = new Date().toISOString();
  return {
    id,
    status: 'Pending',
    destination_hostel_block: hostel,
    parcel_label: '[QA PREVIEW] ' + label.trim(),
    amount: 1000,
    currency: 'INR',
    created_at: now,
    rider_due_at: new Date(Date.now() + 30 * 60000).toISOString(),
    compartment_id: null,
    bot: null,
    timeline: [{status: 'Pending', at: now}],
    payment_status: 'Unpaid',
    is_demo: false,
  };
}

// Orders a QA-preview student can act on: the sample booking they just made.
export const QA_BOOKING_FEE_PAISE = 1000;
