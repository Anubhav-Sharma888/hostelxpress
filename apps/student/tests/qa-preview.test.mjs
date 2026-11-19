import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLocalBooking, QA_ORDERS, QA_PREVIEW, QA_SESSION} from '../src/qa.ts';

// The offline QA preview: build-time flag default, sample data shape, and the
// local booking path. Nothing here may import the API or network modules.

test('QA preview is a build-time opt-in and defaults to off', () => {
  assert.equal(QA_PREVIEW, false, 'EXPO_PUBLIC_QA_PREVIEW unset must keep the skip button out of normal builds');
});

test('sample orders render through the normal screens without a backend', () => {
  assert.equal(QA_ORDERS.length, 2);
  const statuses = QA_ORDERS.map(order => order.status);
  assert.ok(statuses.includes('Transit') && statuses.includes('Completed'));
  for (const order of QA_ORDERS) {
    assert.equal(order.amount, 1000);
    assert.match(order.parcel_label, /^QA preview ·/);
    assert.ok(order.timeline.length >= 2);
    if (order.bot) assert.equal(typeof order.bot.status, 'string');
  }
});

test('sample booking is local, labelled, and priced like a standard parcel', () => {
  const booking = makeLocalBooking('  Library run  ', 'C', 'qa-booking-1');
  assert.equal(booking.status, 'Pending');
  assert.equal(booking.parcel_label, '[QA PREVIEW] Library run');
  assert.equal(booking.destination_hostel_block, 'C');
  assert.equal(booking.amount, 1000);
  assert.equal(booking.payment_status, 'Unpaid');
  assert.equal(booking.bot, null);
  assert.equal(booking.timeline.length, 1);
});

test('preview session carries no credential-shaped field', () => {
  assert.equal(QA_SESSION.mode, 'qa-preview');
  assert.equal(QA_SESSION.user.name, 'QA Preview Student');
  // The Session union gives the qa-preview variant no token fields at all:
  // nothing on the preview path can hold or send a bearer token.
  assert.equal('access_token' in QA_SESSION, false);
  assert.equal('token_type' in QA_SESSION, false);
  assert.equal('expires_in' in QA_SESSION, false);
});
