import test from 'node:test';
import assert from 'node:assert/strict';
import {HOSTELS, hostelName, isCampusHostel} from '../src/campus.ts';
import {makeLocalBooking, QA_ORDERS, QA_SESSION} from '../src/qa.ts';

test('legacy saved destinations are not silently assigned to a real hostel', () => {
  for (const code of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    assert.equal(isCampusHostel(code), false);
    assert.equal(hostelName(code), 'Saved hostel ' + code);
    assert.ok(!HOSTELS.some(hostel => hostel.name === hostelName(code)));
  }
});

test('offline bookings preserve the selected campus destination without network calls', () => {
  for (const hostel of HOSTELS) {
    const booking = makeLocalBooking('Campus pickup', hostel.id, 'qa-' + hostel.id);
    assert.equal(booking.destination_hostel_block, hostel.id);
    assert.equal(hostelName(booking.destination_hostel_block), hostel.name);
    assert.equal(booking.bot, null);
    assert.equal(booking.amount, 1000);
  }
  assert.equal(isCampusHostel(QA_SESSION.user.hostel_block), true);
  assert.ok(QA_ORDERS.every(order => isCampusHostel(order.destination_hostel_block)));
});
