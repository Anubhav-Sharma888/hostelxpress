// Signup and first-sign-in profile onboarding, kept free of React and native
// modules so node --test can drive it with mocked Supabase/HTTP boundaries.
// Profile values entered at signup survive email confirmation as Supabase
// user metadata — display data only; the backend stays the sole owner of the
// stored profile and revalidates every PATCH.
import type {User} from './api';

export type SignupMetadata = {name: string; hostel_block: string};
export type ProfilePatch = {name?: string; hostel_block?: string};

// Structural subset of the Supabase auth client used here; injecting it keeps
// tests free of @supabase/supabase-js (and the app free of test-only seams).
export type SupabaseAuthLike = {
  signUp: (args: {email: string; password: string; options: {data: SignupMetadata}}) =>
    Promise<{data: {session: {access_token: string} | null; user: unknown} | null; error: {message: string} | null}>;
};
export type RequestLike = <T>(path: string, token?: string, options?: {method?: string; body?: unknown}) => Promise<T>;

export class SessionChangedError extends Error {
  constructor() { super('The session changed. Please try again.'); this.name = 'SessionChangedError'; }
}

export function signupUserMetadata(name: string, hostel: string): SignupMetadata {
  return {name: name.trim(), hostel_block: hostel.trim()};
}

const MISSING = (value: unknown): boolean => typeof value !== 'string' || value.trim() === '';

// Fill only what the server profile is missing; user metadata never clobbers
// existing server values, including a name of Student: legacy metadata cannot
// distinguish a trigger default from an intentional edit. Profile settings
// remain the recovery path. Only these two whitelisted fields may pass.
export function profilePatchFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  profile: Pick<User, 'name' | 'hostel_block'> | null,
): ProfilePatch | null {
  if (!metadata) return null;
  const patch: ProfilePatch = {};
  if (profile === null || MISSING(profile.name)) {
    // name matches the existing Auth profile trigger; full_name supports older
    // pending signups only when the server profile has no name to preserve.
    const name = !MISSING(metadata.name) ? metadata.name : metadata.full_name;
    if (typeof name === 'string' && name.trim() !== '') patch.name = name.trim();
  }
  if (profile === null || MISSING(profile.hostel_block)) {
    if (typeof metadata.hostel_block === 'string' && metadata.hostel_block.trim() !== '') patch.hostel_block = metadata.hostel_block.trim();
  }
  return Object.keys(patch).length ? patch : null;
}

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as {status?: unknown}).status === 404;

// POST-signup flow. With email confirmation enabled Supabase returns no
// session; the entered name/hostel travel as user metadata and no profile
// request is made until the user confirms and signs in.
export async function signUpWithProfile(
  deps: {auth: SupabaseAuthLike; request: RequestLike; isCurrent: () => boolean},
  input: {email: string; password: string; name: string; hostel: string},
): Promise<{outcome: 'await-confirmation'; metadata: SignupMetadata} | {outcome: 'complete'; token: string; user: User}> {
  const metadata = signupUserMetadata(input.name, input.hostel);
  const {data, error} = await deps.auth.signUp({email: input.email, password: input.password, options: {data: metadata}});
  if (!deps.isCurrent()) throw new SessionChangedError();
  if (error) throw new Error(error.message);
  if (!data || !data.session) return {outcome: 'await-confirmation', metadata};
  const token = data.session.access_token;
  if (!deps.isCurrent()) throw new SessionChangedError();
  await deps.request('/v1/me', token, {method: 'PATCH', body: {name: metadata.name, hostel_block: metadata.hostel_block}});
  if (!deps.isCurrent()) throw new SessionChangedError();
  const user = await deps.request<User>('/v1/me', token);
  if (!deps.isCurrent()) throw new SessionChangedError();
  return {outcome: 'complete', token, user};
}

// GET the profile on sign-in; when the account has no profile yet (first
// sign-in after email confirmation) or is incomplete, complete it from the
// signup metadata. The backend validates and owns every stored value.
export async function fetchProfileWithOnboarding(
  deps: {request: RequestLike; isCurrent: () => boolean},
  token: string,
  metadata: Record<string, unknown> | null | undefined,
): Promise<User> {
  if (!deps.isCurrent()) throw new SessionChangedError();
  let profile: User | null = null;
  let notFound: unknown = null;
  try {
    profile = await deps.request<User>('/v1/me', token);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    notFound = error;
  }
  if (!deps.isCurrent()) throw new SessionChangedError();
  const patch = profilePatchFromMetadata(metadata, profile);
  if (!patch) {
    if (profile) return profile;
    throw notFound;
  }
  if (!deps.isCurrent()) throw new SessionChangedError();
  await deps.request('/v1/me', token, {method: 'PATCH', body: patch});
  if (!deps.isCurrent()) throw new SessionChangedError();
  const user = await deps.request<User>('/v1/me', token);
  if (!deps.isCurrent()) throw new SessionChangedError();
  return user;
}
