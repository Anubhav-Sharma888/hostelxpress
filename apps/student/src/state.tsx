import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {ApiError, DemoAction, Order, request, Session, User} from './api';

type AppStateValue = {
  session: Session | null; user: User | null; orders: Order[]; loading: boolean; error: string | null; updatedAt: number | null;
  signIn: (name: string, hostel: string) => Promise<void>; signOut: () => void;
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
  const signOut = useCallback(() => {
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
  const signIn = async (name: string, hostel: string) => {
    const current = ++generation.current;
    const response = await request<Session>('/auth/demo', undefined, {method: 'POST', body: {name: name.trim(), hostel_block: hostel}});
    if (!alive.current || current !== generation.current) throw new Error('The session changed. Please sign in again.');
    setLoading(true); setSession(response); setUser(response.user); setOrders([]); setError(null);
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
  return <Context.Provider value={{session,user,orders,loading,error,updatedAt,signIn,signOut,refresh,createOrder,advance}}>{children}</Context.Provider>;
}
export function useApp() {const value = useContext(Context); if (!value) throw new Error('AppProvider is required.'); return value;}
