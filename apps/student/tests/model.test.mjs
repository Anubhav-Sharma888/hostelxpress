import test from 'node:test';
import assert from 'node:assert/strict';
import {freshRoverPosition,isStale,nextDemoAction,STATUS_COPY,formatAmount,isActive} from '../src/model.ts';

test('stale telemetry cannot remain fresh after the fifteen-second safety window',()=>{
  const received='2026-10-27T10:00:00Z'; const now=Date.parse(received);
  assert.equal(isStale(received,now+15000),false);
  assert.equal(isStale(received,now+15001),true);
  assert.equal(isStale(null,now),true);
  assert.equal(isStale('invalid',now),true);
});
test('payment alone never claims an unlocked compartment',()=>{
  assert.equal(STATUS_COPY.Paid.label,'Payment confirmed · Waiting for unlock');
  assert.match(STATUS_COPY.Paid.description,/acknowledgement/);
});
test('a terminal order cannot be advanced using demo controls',()=>{
  assert.equal(nextDemoAction('Completed'),null);
  assert.equal(nextDemoAction('Failed'),null);
  assert.equal(isActive({status:'Completed'}),false);
  assert.equal(isActive({status:'Failed'}),false);
});
test('delivery fee is represented in integer paise',()=>{
  assert.equal(formatAmount(1000),'₹10');
});

test('only fresh, valid rover positions are shown', () => {
  const timestamp = '2026-11-19T10:00:00Z';
  const now = Date.parse(timestamp);
  const rover = {last_seen_at: timestamp, telemetry_observed_at: timestamp, current_lat: 0, current_lng: 76.897};
  assert.deepEqual(freshRoverPosition(rover, now), {lat: 0, lng: 76.897});
  assert.equal(freshRoverPosition({...rover, last_seen_at: null}, now), null);
  assert.equal(freshRoverPosition({...rover, telemetry_observed_at: null}, now), null);
  assert.equal(freshRoverPosition({...rover, last_seen_at: new Date(now + 16000).toISOString()}, now + 16000), null);
  assert.equal(freshRoverPosition({...rover, current_lat: null}, now), null);
  assert.equal(freshRoverPosition({...rover, current_lng: 181}, now), null);
});
