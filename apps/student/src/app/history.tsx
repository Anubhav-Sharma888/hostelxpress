import React from 'react';
import {Pressable, View} from 'react-native';
import {router} from 'expo-router';
import {hostelName} from '../campus';
import {COLORS as C, formatAmount, formatDate, isActive, shortId} from '../model';
import {useApp} from '../state';
import {Card, common, ErrorNotice, Heading, Icon, Loading, PageTitle, StatusPill, T} from '../ui';

export default function History() {
  const {orders, loading, error, refresh} = useApp();
  const history = orders.filter(order => !isActive(order));

  return (
    <View style={{gap: 16}}>
      <PageTitle eyebrow="Past orders" title="Delivery history" description="Review completed and failed deliveries." />
      {error && <ErrorNotice message={error} retry={() => void refresh()} />}
      {loading && !orders.length ? <Loading label="Loading delivery history…" /> : history.length === 0 ? (
        <Card style={{alignItems: 'center', padding: 28, gap: 8}}>
          <Icon name="receipt-outline" size={28} color={C.primary} />
          <Heading style={{fontSize: 18}}>No past deliveries yet</Heading>
          <T style={{color: C.muted, textAlign: 'center'}}>Completed and failed deliveries will appear here.</T>
        </Card>
      ) : history.map(order => (
        <Pressable
          key={order.id}
          accessibilityRole="button"
          accessibilityLabel={'View past delivery ' + shortId(order.id)}
          onPress={() => router.push({pathname: '/order/[id]', params: {id: order.id}})}
          style={({pressed}) => ({padding: 16, gap: 10, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, opacity: pressed ? 0.8 : 1})}
        >
          <View style={[common.between, {gap: 10}]}>
            <T numberOfLines={1} style={{flex: 1, fontFamily: 'ManropeBold', fontSize: 16}}>{order.parcel_label || 'Campus delivery'}</T>
            <StatusPill status={order.status} />
          </View>
          <T style={{color: C.muted}}>{hostelName(order.destination_hostel_block)} · {formatDate(order.created_at)}</T>
          <View style={common.between}>
            <T style={{color: C.muted}}>{shortId(order.id)}{order.payment_status === 'Captured' && !order.is_demo ? ' · Paid ' + formatAmount(order.amount) : ''}</T>
            <Icon name="chevron-forward-outline" size={16} color={C.primary} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
