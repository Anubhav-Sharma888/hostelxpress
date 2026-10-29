import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionChangedError,
  fetchProfileWithOnboarding,
  profilePatchFromMetadata,
  signUpWithProfile,
  signupUserMetadata,
} from '../src/signup.ts';

// Mocked Supabase auth boundary.
function authMock(session, error = null) {
  const calls = [];
  return {
    calls,
    signUp: async args => {
      calls.push(args);
      if (error) return {data: null, error};
      return {data: {session, user: {id: 'u1'}}, error: null};
    },
  };
}

// Mocked HTTP boundary: each step consumes one call in order; an empty step
// list makes any call fail the test.
function httpMock(...steps) {
  const calls = [];
  const request = async (path, token, options = {}) => {
    calls.push({path, token, options: {method: 'GET', ...options}});
    if (!steps.length) throw new Error('unexpected HTTP call: ' + path);
    return steps.shift()({path, token, options});
  };
  return {request, calls};
}

const INPUT = {email: 'qa-1@hostelxpress.test', password: 'hx-secret-1', name: '  QA User  ', hostel: ' Hostel B '};

test('signup metadata carries only display fields and never the password', () => {
  const metadata = signupUserMetadata('  QA User  ', ' Hostel B ');
  assert.deepEqual(metadata, {name: 'QA User', hostel_block: 'Hostel B'});
  assert.ok(!('password' in metadata));
});

test('confirmation-required signup preserves name and hostel as metadata and never contacts the API', async () => {
  const auth = authMock(null);
  const http = httpMock(); // any HTTP call fails the test
  const result = await signUpWithProfile({auth, request: http.request, isCurrent: () => true}, INPUT);
  assert.equal(result.outcome, 'await-confirmation');
  assert.deepEqual(result.metadata, {name: 'QA User', hostel_block: 'Hostel B'});
  assert.ok(!('password' in result.metadata));
  assert.equal(http.calls.length, 0, 'no profile request may be sent before confirmation');
  assert.equal(auth.calls[0].email, INPUT.email);
  assert.equal(auth.calls[0].password, INPUT.password, 'the password goes to Supabase only');
  assert.deepEqual(auth.calls[0].options.data, {name: 'QA User', hostel_block: 'Hostel B'});
});

test('immediate-session signup completes the profile with one PATCH and one GET', async () => {
  const auth = authMock({access_token: 'tok-1'});
  const http = httpMock(
    () => ({}), // PATCH /v1/me
    () => ({id: 'u1', name: 'QA User', hostel_block: 'Hostel B'}), // GET /v1/me
  );
  const result = await signUpWithProfile({auth, request: http.request, isCurrent: () => true}, INPUT);
  assert.equal(result.outcome, 'complete');
  assert.equal(result.token, 'tok-1');
  assert.deepEqual(result.user, {id: 'u1', name: 'QA User', hostel_block: 'Hostel B'});
  assert.equal(http.calls.length, 2);
  assert.equal(http.calls[0].options.method, 'PATCH');
  assert.deepEqual(http.calls[0].options.body, {name: 'QA User', hostel_block: 'Hostel B'});
  assert.ok(!('password' in http.calls[0].options.body));
  assert.equal(http.calls[0].token, 'tok-1');
});

test('a changed session aborts signup before any HTTP call', async () => {
  const auth = authMock({access_token: 'tok-1'});
  const http = httpMock();
  await assert.rejects(
    signUpWithProfile({auth, request: http.request, isCurrent: () => false}, INPUT),
    SessionChangedError,
  );
  assert.equal(http.calls.length, 0);
  assert.equal(auth.calls.length, 1, 'the signup call itself still happened');
});

test('signup errors surface their original message', async () => {
  const auth = authMock(null, {message: 'Signup requires a valid email'});
  await assert.rejects(
    signUpWithProfile({auth, request: httpMock().request, isCurrent: () => true}, INPUT),
    /Signup requires a valid email/,
  );
});

test('profilePatchFromMetadata fills only missing fields from whitelisted metadata', () => {
  const metadata = {full_name: 'QA User', hostel_block: 'Hostel B', password: 'x', access_token: 'y'};
  assert.deepEqual(profilePatchFromMetadata(metadata, null), {name: 'QA User', hostel_block: 'Hostel B'});
  assert.deepEqual(profilePatchFromMetadata(metadata, {name: 'QA User', hostel_block: null}), {hostel_block: 'Hostel B'});
  assert.deepEqual(profilePatchFromMetadata(metadata, {name: null, hostel_block: 'Hostel B'}), {name: 'QA User'});
  assert.equal(profilePatchFromMetadata(metadata, {name: 'QA User', hostel_block: 'Hostel B'}), null);
  assert.equal(profilePatchFromMetadata(undefined, null), null);
  assert.equal(profilePatchFromMetadata(metadata, {name: 'Old Name', hostel_block: 'Hostel A'}), null, 'never clobbers existing values');
});

test('first sign-in after confirmation completes onboarding from saved metadata', async () => {
  const http = httpMock(
    () => {
      const error = new Error('Student profile not found; complete Supabase signup first');
      error.status = 404;
      throw error;
    }, // GET /v1/me -> profile does not exist yet
    () => ({}), // PATCH /v1/me creates it
    () => ({id: 'u1', name: 'QA User', hostel_block: 'Hostel B'}),
  );
  const user = await fetchProfileWithOnboarding(
    {request: http.request, isCurrent: () => true},
    'tok-2',
    {full_name: 'QA User', hostel_block: 'Hostel B'},
  );
  assert.deepEqual(user, {id: 'u1', name: 'QA User', hostel_block: 'Hostel B'});
  assert.equal(http.calls[0].options.method, 'GET');
  assert.equal(http.calls[1].options.method, 'PATCH');
  assert.deepEqual(http.calls[1].options.body, {name: 'QA User', hostel_block: 'Hostel B'});
  assert.ok(!('password' in http.calls[1].options.body));
  assert.equal(http.calls[2].options.method, 'GET');
});

test('first sign-in with a complete profile sends no PATCH', async () => {
  const http = httpMock(() => ({id: 'u1', name: 'QA User', hostel_block: 'Hostel B'}));
  const user = await fetchProfileWithOnboarding(
    {request: http.request, isCurrent: () => true},
    'tok-2',
    {full_name: 'QA User', hostel_block: 'Hostel B'},
  );
  assert.deepEqual(user, {id: 'u1', name: 'QA User', hostel_block: 'Hostel B'});
  assert.equal(http.calls.length, 1, 'only the GET ran');
});

test('first sign-in without metadata and without a profile rethrows the server error', async () => {
  const http = httpMock(() => {
    const error = new Error('Student profile not found; complete Supabase signup first');
    error.status = 404;
    throw error;
  });
  await assert.rejects(
    fetchProfileWithOnboarding({request: http.request, isCurrent: () => true}, 'tok-2', undefined),
    /profile not found/i,
  );
});

test('a changed session aborts sign-in onboarding before any HTTP call', async () => {
  const http = httpMock();
  await assert.rejects(
    fetchProfileWithOnboarding({request: http.request, isCurrent: () => false}, 'tok-2', {full_name: 'QA User'}),
    SessionChangedError,
  );
  assert.equal(http.calls.length, 0);
});


// The existing auth.users trigger reads raw_user_meta_data.name and otherwise
// seeds public.users.name as Student (supabase/init.sql). Keep that boundary
// in the fixture: returning the entered name directly hides a key mismatch.
test('confirmation signup metadata survives the existing profile trigger on first sign-in', async () => {
  const auth = authMock(null);
  const signup = await signUpWithProfile({auth, request: httpMock().request, isCurrent: () => true}, INPUT);
  const metadata = auth.calls[0].options.data;
  let profile = {id: 'u1', name: metadata.name?.trim() || 'Student', hostel_block: null};
  const http = httpMock(
    () => ({...profile}),
    ({options}) => { profile = {...profile, ...options.body}; return {...profile}; },
    () => ({...profile}),
  );
  assert.equal(signup.outcome, 'await-confirmation');
  const user = await fetchProfileWithOnboarding({request: http.request, isCurrent: () => true}, 'confirmed-token', metadata);
  assert.deepEqual(user, {id: 'u1', name: 'QA User', hostel_block: 'Hostel B'});
  assert.deepEqual(http.calls[1].options.body, {hostel_block: 'Hostel B'});
});

test('canonical name wins over legacy full_name, which remains a read fallback', () => {
  assert.deepEqual(profilePatchFromMetadata({name: '  Canonical  ', full_name: 'Legacy'}, null), {name: 'Canonical'});
  assert.deepEqual(profilePatchFromMetadata({name: ' ', full_name: ' Legacy '}, null), {name: 'Legacy'});
  assert.deepEqual(profilePatchFromMetadata({full_name: ' Legacy '}, null), {name: 'Legacy'});
});

test('legacy signup metadata never replaces existing names, including a legitimate Student', () => {
  for (const name of ['Edited Name', 'Student']) {
    assert.deepEqual(profilePatchFromMetadata({full_name: 'Old Signup', hostel_block: 'B'}, {name, hostel_block: null}), {hostel_block: 'B'});
    assert.equal(profilePatchFromMetadata({full_name: 'Old Signup'}, {name, hostel_block: 'A'}), null);
  }
});

test('a stale confirmation-required signup cannot publish its outcome', async () => {
  await assert.rejects(signUpWithProfile({auth: authMock(null), request: httpMock().request, isCurrent: () => false}, INPUT), SessionChangedError);
});

test('signup stops before reading a profile if the session changes during PATCH', async () => {
  let current = true;
  const http = httpMock(() => { current = false; return {}; });
  await assert.rejects(signUpWithProfile({auth: authMock({access_token: 'tok'}), request: http.request, isCurrent: () => current}, INPUT), SessionChangedError);
  assert.equal(http.calls.length, 1);
});

test('signup rejects a stale profile response after its final GET', async () => {
  let current = true;
  const http = httpMock(() => ({}), () => { current = false; return {id: 'u1', name: 'QA User', hostel_block: 'B'}; });
  await assert.rejects(signUpWithProfile({auth: authMock({access_token: 'tok'}), request: http.request, isCurrent: () => current}, INPUT), SessionChangedError);
});

test('onboarding rejects a stale GET even when no PATCH is needed', async () => {
  let current = true;
  const http = httpMock(() => { current = false; return {id: 'u1', name: 'Student', hostel_block: 'B'}; });
  await assert.rejects(fetchProfileWithOnboarding({request: http.request, isCurrent: () => current}, 'tok', {full_name: 'Old Signup'}), SessionChangedError);
  assert.equal(http.calls.length, 1);
});

test('onboarding stops before PATCH if its initial GET becomes stale', async () => {
  let current = true;
  const http = httpMock(() => { current = false; return {id: 'u1', name: 'QA User', hostel_block: null}; });
  await assert.rejects(fetchProfileWithOnboarding({request: http.request, isCurrent: () => current}, 'tok', {name: 'QA User', hostel_block: 'B'}), SessionChangedError);
  assert.equal(http.calls.length, 1);
});

test('onboarding stops after a stale missing-profile response without creating it', async () => {
  let current = true;
  const http = httpMock(() => { current = false; throw Object.assign(new Error('missing'), {status: 404}); });
  await assert.rejects(fetchProfileWithOnboarding({request: http.request, isCurrent: () => current}, 'tok', {name: 'QA User', hostel_block: 'B'}), SessionChangedError);
  assert.equal(http.calls.length, 1);
});

test('onboarding stops before GET when its PATCH becomes stale', async () => {
  let current = true;
  const http = httpMock(() => ({id: 'u1', name: 'QA User', hostel_block: null}), () => { current = false; return {}; });
  await assert.rejects(fetchProfileWithOnboarding({request: http.request, isCurrent: () => current}, 'tok', {name: 'QA User', hostel_block: 'B'}), SessionChangedError);
  assert.equal(http.calls.length, 2);
});

test('onboarding rejects a stale final profile response', async () => {
  let current = true;
  const http = httpMock(() => ({id: 'u1', name: 'QA User', hostel_block: null}), () => ({}), () => { current = false; return {id: 'u1', name: 'QA User', hostel_block: 'B'}; });
  await assert.rejects(fetchProfileWithOnboarding({request: http.request, isCurrent: () => current}, 'tok', {name: 'QA User', hostel_block: 'B'}), SessionChangedError);
});

test('non-404 profile errors never cause an onboarding PATCH', async () => {
  for (const status of [401, 403, 500]) {
    const failure = Object.assign(new Error('profile request rejected'), {status});
    const http = httpMock(() => { throw failure; });
    await assert.rejects(fetchProfileWithOnboarding({request: http.request, isCurrent: () => true}, 'tok', {name: 'QA User', hostel_block: 'B'}), error => error === failure);
    assert.equal(http.calls.length, 1);
  }
});
