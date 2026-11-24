import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.ts';
const now = Date.parse('2026-11-24T10:00:00Z');
const bot = {id: 'rover-1', status: 'UNLOCKED', last_seen_at: new Date(now).toISOString(), telemetry_observed_at: new Date(now).toISOString()};
const paid = {id: 'order-a', status: 'Paid', compartment_id: 1, bot};
test('only the paid order with its own open signal is ready on a shared unlocked rover', () => {
  assert.equal(typeof model.derivePickupState, 'function', 'per-order pickup derivation is required');
  assert.equal(model.derivePickupState({...paid, pickup_state: 'open'}, 'real', now), 'open');
  assert.equal(model.derivePickupState({...paid, id: 'order-b', compartment_id: 2, pickup_state: 'otp_required'}, 'real', now), 'otp_required');
});
test('queued and rejected pickups cannot display an open bay or offer a fresh OTP', () => {
  assert.equal(typeof model.derivePickupState, 'function');
  assert.equal(model.derivePickupState({...paid, pickup_state: 'unlock_pending'}, 'real', now), 'unlock_pending');
  assert.equal(model.derivePickupState({...paid, pickup_state: 'reconciliation_required'}, 'real', now), 'reconciliation_required');
});
test('missing unknown non-paid and stale pickup signals fail closed', () => {
  assert.equal(typeof model.derivePickupState, 'function');
  assert.equal(model.derivePickupState(paid, 'real', now), 'not_ready');
  assert.equal(model.derivePickupState({...paid, pickup_state: 'future-state'}, 'real', now), 'not_ready');
  assert.equal(model.derivePickupState({...paid, status: 'Arrived', pickup_state: 'open'}, 'real', now), 'not_ready');
  for (const changed of [
    {last_seen_at: new Date(now - 15001).toISOString()},
    {telemetry_observed_at: new Date(now - 15001).toISOString()},
    {telemetry_observed_at: null},
    {last_seen_at: new Date(now + 60000).toISOString()},
    {status: 'FAULT_MODE'},
  ]) {
    assert.equal(model.derivePickupState({...paid, pickup_state: 'open', bot: {...bot, ...changed}}, 'real', now), 'not_ready');
  }
});
test('explicit offline and demo simulations preserve their collection preview', () => {
  assert.equal(typeof model.derivePickupState, 'function');
  assert.equal(model.derivePickupState(paid, 'qa-preview', now), 'open');
  assert.equal(model.derivePickupState(paid, 'demo', now), 'open');
  assert.equal(model.derivePickupState({...paid, bot: {...bot, status: 'AT_HOSTEL'}}, 'qa-preview', now), 'otp_required');
});
