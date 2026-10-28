import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {ApiError, AUTH_MODE, DemoAction, Order, request, Session, supabase, User} from './api';

type AppStateValue = {
  session: Session | null; user: User | null; orders: Order[]; loading: boolean; error: string | null; updatedAt: number | null;
  signIn: (email: string, password: string) => Promise<void>; signUp: (email: string, password: string, name: string, hostel: string) => Promise<void>;
  updateProfile: (patch: {name?: string; hostel_block: string}) => Promise<User>;
  signOut: () => void;
  refresh: () => Promise<void>; createOrder: (label: string, hostel: string, key: string) => Promise<Order>;
  advance: (id: string, action: DemoAction) => Promise<Order>;
};
const Context = createContext<AppStateValue | null>(null);
export function AppProvider({children}: {children: React.ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const refreshing = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (AUTH_MODE !== 'real') return;
    const {data} = supabase().auth.onAuthStateChange((event, authSession) => {
      if ((event !== 'TOKEN_REFRESHED' && event !== 'SIGNED_IN') || !authSession) return;
      setSession(current => current && current.mode === 'real' && current.access_token !== authSession.access_token ? {...current, access_token: authSession.access_token} : current);
    });
    return () => { data.subscription.unsubscribe(); };
  }, []);
  const signOut = useCallback(() => {
    if (AUTH_MODE === 'real') void supabase().auth.signOut().catch(() => undefined);
    generation.current += 1; refreshing.current = false;
    setSession(null); setUser(null); setOrders([]); setError(null); setUpdatedAt(null); setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    if (!session || refreshing.current) return;
    const current = generation.current;
    refreshing.current = true;
    try {
      const [profile, result] = await Promise.all([
        request<User>('/v1/me', session.access_token),
        request<{items: Order[]}>('/v1/orders', session.access_token),
      ]);
      if (alive.current && current === generation.current) {
        setUser(profile); setOrders(result.items); setError(null); setUpdatedAt(Date.now());
      }
    } catch (err) {
      if (current === generation.current) {
        if (err instanceof ApiError && err.status === 401) signOut();
        else setError((err as Error).message);
      }
    } finally { if (current === generation.current) {refreshing.current = false; setLoading(false);} }
  }, [session, signOut]);
  useEffect(() => {
    if (!session) return;
    const initial = setTimeout(() => { void refresh(); }, 0);
    const interval = setInterval(() => {if (AppState.currentState === 'active') void refresh();}, 5000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [session, refresh]);
  const signIn = async (email: string, password: string) => {
    const current = ++generation.current;
    if (AUTH_MODE === 'real') {
      const {data, error} = await supabase().auth.signInWithPassword({email, password});
      if (error || !data.session) throw new Error(error?.message || 'We could not sign you in. Please check your email and password.');
      if (!alive.current || current !== generation.current) throw new Error('The session changed. Please sign in again.');
      setLoading(true);
      const profile = await request<User>('/v1/me', data.session.access_token);
      if (!alive.current || current !== generation.current) throw new Error('The session changed. Please sign in again.');
      setSession({access_token: data.session.access_token, token_type: 'bearer', expires_in: 3600, mode: 'real', user: profile});
      setUser(profile); setOrders([]); setError(null);
      return;
    }
    const response = await request<Session>('/auth/demo', undefined, {method: 'POST', body: {name: email.trim(), hostel_block: password}});
    if (!alive.current || current !== generation.current) throw new Error('The session changed. Please sign in again.');
    setLoading(true); setSession(response); setUser(response.user); setOrders([]); setError(null);
  };
  const signUp = async (email: string, password: string, name: string, hostel: string) => {
    if (AUTH_MODE !== 'real') throw new Error('Account creation is not available in this environment.');
    const current = ++generation.current;
    const {data, error} = await supabase().auth.signUp({email, password});
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Email confirmation is required. Confirm your email, then sign in.');
    if (!alive.current || current !== generation.current) throw new Error('The session changed. Please sign in again.');
    setLoading(true);
    const token = data.session.access_token;
    await request<User>('/v1/me', token, {method: 'PATCH', body: {name: name.trim(), hostel_block: hostel}});
    const profile = await request<User>('/v1/me', token);
    if (!alive.current || current !== generation.current) throw new Error('The session changed. Please sign in again.');
    setSession({access_token: token, token_type: 'bearer', expires_in: 3600, mode: 'real', user: profile});
    setUser(profile); setOrders([]); setError(null);
  };
  const updateProfile = async (patch: {name?: string; hostel_block: string}) => {
    if (!session) throw new Error('Please sign in first.');
    const current = generation.current;
    const profile = await request<User>('/v1/me', session.access_token, {method: 'PATCH', body: patch});
    if (!alive.current || current !== generation.current) throw new Error('The session changed. Please reopen your profile.');
    setUser(profile); setSession(latest => latest ? {...latest, user: profile} : latest);
    return profile;
  };
  const upsert = (order: Order) => setOrders(current => [order, ...current.filter(item => item.id !== order.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  const createOrder = async (label: string, hostel: string, key: string) => {
    if (!session) throw new Error('Please sign in first.');
    const current = generation.current;
    const order = await request<Order>('/v1/orders', session.access_token, {
      method: 'POST', body: {parcel_label: label.trim(), destination_hostel_block: hostel}, idempotencyKey: key,
    });
    if (!alive.current || current !== generation.current) throw new Error('The session changed. Please reopen your deliveries.');
    upsert(order); void refresh(); return order;
  };
  const advance = async (id: string, action: DemoAction) => {
    if (!session || session.mode !== 'demo') throw new Error('Simulation is available in the demo environment only.');
    const current = generation.current;
    const order = await request<Order>('/v1/demo/orders/' + encodeURIComponent(id) + '/advance', session.access_token, {method: 'POST', body: {action}});
    if (!alive.current || current !== generation.current) throw new Error('The session changed. Please reopen your deliveries.');
    upsert(order); void refresh(); return order;
  };
  return <Context.Provider value={{session,user,orders,loading,error,updatedAt,signIn,signUp,updateProfile,signOut,refresh,createOrder,advance}}>{children}</Context.Provider>;
}
export function useApp() {const value = useContext(Context); if (!value) throw new Error('AppProvider is required.'); return value;}
