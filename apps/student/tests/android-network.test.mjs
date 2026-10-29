import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const policy = () => require('../plugins/withAndroidNetwork.cjs');

test('production Android network policy denies cleartext without a localhost exception', () => {
  const xml = policy().networkSecurityXml(false);
  assert.match(xml, /base-config cleartextTrafficPermitted="false"/);
  assert.doesNotMatch(xml, /cleartextTrafficPermitted="true"/);
  assert.match(xml, /domain-config cleartextTrafficPermitted="false"/);
  assert.match(xml, /<domain includeSubdomains="false">localhost<\/domain>/);
});
test('local QA permits only exact localhost while retaining a cleartext-denying base', () => {
  const xml = policy().networkSecurityXml(true);
  assert.match(xml, /base-config cleartextTrafficPermitted="false"/);
  assert.match(xml, /domain-config cleartextTrafficPermitted="true"/);
  assert.match(xml, /<domain includeSubdomains="false">localhost<\/domain>/);
  assert.doesNotMatch(xml, /127\.0\.0\.1|10\.0\.2\.2|includeSubdomains="true"/);
});
test('release URL policy accepts HTTPS and rejects HTTP, credentials, and malformed URLs', () => {
  const validate = policy().validateBuildUrl;
  assert.doesNotThrow(() => validate('https://api.example.test', false));
  for (const value of ['http://api.example.test', 'http://localhost:8000', 'invalid', 'https://user:secret@example.test']) {
    assert.throws(() => validate(value, false));
  }
});
test('local QA accepts localhost HTTP but refuses LAN HTTP', () => {
  const validate = policy().validateBuildUrl;
  assert.doesNotThrow(() => validate('http://localhost:8000', true));
  assert.throws(() => validate('http://192.168.1.2:8000', true));
  assert.throws(() => validate('http://localhost.example.test:8000', true));
});
