import React, {useCallback, useEffect, useState} from 'react';
import {useRouter} from 'expo-router';
import {TextInput, useWindowDimensions, View} from 'react-native';
import {COLORS as C, formatAmount} from '../model';
import {getMerchantOrders, merchantAction, PilotOrder} from '../pilot';
import {Button, Card, ErrorNotice, Icon, Heading, Label, PageTitle, Pill, T} from '../ui';

const ACTIONS: {action: 'accept' | 'reject' | 'ready' | 'request_rover' | 'confirm_loading'; label: string; icon: string; show: (order: PilotOrder) => boolean}[] = [
  {action: 'accept', label: 'Accept', icon: 'checkmark-outline', show: order => order.status === 'Placed'},
  {action: 'reject', label: 'Reject', icon: 'close-outline', show: order => order.status === 'Placed' || order.status === 'Accepted'},
  {action: 'ready', label: 'Mark ready', icon: 'bag-check-outline', show: order => order.status === 'Accepted'},
  {action: 'request_rover', label: 'Request rover', icon: 'car-outline', show: order => order.status === 'Ready' && order.payment_status === 'SimPaid' && !order.rover_requested_at},
  {action: 'confirm_loading', label: 'Confirm loaded', icon: 'archive-outline', show: order => order.status === 'Ready' && Boolean(order.rover_requested_at)},
];

// Merchant staff queue (tablet-first). The staff token scopes every response
// to one merchant, and the backend owns departure and safety decisions.
export default function MerchantQueue() {
  const router = useRouter();
  const {width} = useWindowDimensions();
  const [staffToken, setStaffToken] = useState('');
  const [orders, setOrders] = useState<PilotOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback((token: string) => {
    getMerchantOrders(token).then(data => {
      setOrders(data.orders);
      setError(null);
    }).catch((err: Error) => {
      setOrders(null);
      setError(err.message);
    });
  }, []);
  useEffect(() => {
    if (!staffToken.trim()) return;
    load(staffToken.trim());
  }, [staffToken, load]);

  const act = useCallback(async (orderId: string, action: 'accept' | 'reject' | 'ready' | 'request_rover' | 'confirm_loading') => {
    setBusyId(orderId + action);
    try {
      await merchantAction(staffToken.trim(), orderId, action);
      await load(staffToken.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }, [staffToken, load]);

  return <View style={{gap: 20}}>
    <PageTitle eyebrow="Merchant counter" title="Tonight's queue." description="Accept orders, mark them ready, and call rovers. Departure and safety checks stay with the backend."
      action={<Button variant="secondary" small icon="arrow-back-outline" onPress={() => router.push('/afterhours' as never)}>After Hours</Button>} />
    <Card style={{backgroundColor: C.dark, borderColor: C.dark, padding: 24, gap: 16}}>
      <View style={{flexDirection: 'row', gap: 14, alignItems: 'center'}}>
        <View style={{width: 52, height: 52, borderRadius: 14, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center'}}><Icon name="storefront-outline" size={27} color={C.onLime}/></View>
        <View style={{flex: 1, gap: 5}}><Label style={{color: '#D8D4FF'}}>MERCHANT DISPATCH</Label><Heading style={{fontSize: 25, lineHeight: 33, color: '#FFFFFF'}}>From your counter to campus.</Heading></View>
      </View>
      <T style={{fontSize: 13, lineHeight: 21, color: '#CBD5E1'}}>Your incoming orders, preparation and loading queue in one place.</T>
    </Card>
    <Card style={{padding: 22, gap: 12, backgroundColor: C.lavender, borderColor: C.lavender}}>
      <T style={{fontFamily: 'DMSansBold', fontSize: 13}}>Staff token</T>
      <T style={{fontSize: 11, color: C.muted}}>Provided by the backend operator for your merchant account. It scopes this view to your orders only.</T>
      <TextInput value={staffToken} onChangeText={setStaffToken} placeholder="Paste your staff token" placeholderTextColor={C.muted}
        autoComplete="off" secureTextEntry accessibilityLabel="Merchant staff token"
        style={{borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 14, minHeight: 48, fontSize: 14, color: C.ink, backgroundColor: C.white}} />
    </Card>
    {error && <ErrorNotice message={error} />}
    {!orders && !error && <T style={{fontSize: 12, color: C.muted}}>Waiting for a staff token.</T>}
    {orders && !orders.length && <Card style={{padding: 22, alignItems: 'center', gap: 8}}><Icon name="receipt-outline" size={28} /><T style={{fontFamily: 'ManropeBold', fontSize: 16}}>No orders yet tonight.</T></Card>}
    {orders && orders.length > 0 && <View style={{flexDirection: 'row', gap: 12}}>
      {[{label: 'INCOMING', count: orders.filter(order => order.status === 'Placed').length},
        {label: 'PREPARING', count: orders.filter(order => order.status === 'Accepted' || order.status === 'Ready').length},
        {label: 'LOADED', count: orders.filter(order => order.status === 'Loaded').length}].map(stat =>
          <Card key={stat.label} style={{flex: 1, padding: 16, gap: 7, backgroundColor: C.lavender, borderColor: C.lavender}}>
            <T style={{fontFamily: 'ManropeBold', fontSize: 27, lineHeight: 35}}>{stat.count}</T>
            <T style={{fontSize: 9, letterSpacing: 1}}>{stat.label}</T>
          </Card>)}
    </View>}
    <View style={{flexDirection: width >= 1000 ? 'row' : 'column', alignItems: 'flex-start', gap: 18}}>
      {[{title: 'Incoming orders', statuses: ['Placed']}, {title: 'In preparation', statuses: ['Accepted', 'Ready']}, {title: 'Loading & closed', statuses: ['Loaded', 'Rejected']}].map(group => {
        const grouped = (orders || []).filter(order => group.statuses.includes(order.status));
        if (!orders?.length) return null;
        return <View key={group.title} style={{width: width >= 1000 ? undefined : '100%', flex: width >= 1000 ? 1 : undefined, minWidth: 0, gap: 12}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
            <Heading style={{fontSize: 20, lineHeight: 28}}>{group.title}</Heading><Pill tone="neutral">{String(grouped.length)}</Pill>
          </View>
          {!grouped.length && <Card style={{padding: 20}}><T style={{fontSize: 12, color: C.muted}}>All clear for now.</T></Card>}
          {grouped.map(order => <Card key={order.order_id} style={{padding: 22, gap: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap'}}>
          <T style={{fontFamily: 'ManropeBold', fontSize: 15, flex: 1}}>{order.items.map(item => item.name + ' × ' + item.quantity).join(', ')}</T>
          <Pill tone={order.status === 'Rejected' ? 'red' : order.status === 'Placed' ? 'orange' : 'green'}>{order.status}</Pill>
        </View>
        <T style={{fontSize: 12, color: C.muted}}>{order.hostel_block} block · {formatAmount(order.total_paise)} total (incl. {formatAmount(order.fee_paise)} fee) · payment {order.payment_status}</T>
        {order.insulated_bay && <Pill tone="green" icon="albums-outline">{order.insulated_bay + ' · Insulated'}</Pill>}
        <View style={{flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4}}>
          {ACTIONS.filter(entry => entry.show(order)).map(entry => <Button key={entry.action} small
            variant={entry.action === 'reject' ? 'orange' : entry.action === 'confirm_loading' ? 'primary' : 'secondary'}
            icon={entry.icon as never} loading={busyId === order.order_id + entry.action}
            onPress={() => void act(order.order_id, entry.action)}>{entry.label}</Button>)}
        </View>
          </Card>)}
        </View>;
      })}
    </View>
  </View>;
}
