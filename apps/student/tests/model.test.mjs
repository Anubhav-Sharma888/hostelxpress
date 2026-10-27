import test from 'node:test';
import assert from 'node:assert/strict';
import {isStale,nextDemoAction,STATUS_COPY,formatAmount,isActive} from '../src/model.ts';

test('stale telemetry cannot remain fresh after the fifteen-second safety window',()=>{
  const received='2026-10-27T10:00:00Z'; const now=Date.parse(received);
  assert.equal(isStale(received,now+15000),false);
  assert.equal(isStale(received,now+15001),true);
  assert.equal(isStale(null,now),true);
  assert.equal(isStale('invalid',now),true);
});
test('payment alone never claims an unlocked compartment',()=>{
  assert.equal(STATUS_COPY.Paid.label,'Payment confirmed');
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
