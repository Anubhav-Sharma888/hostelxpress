import React, {useState} from 'react';
import {Pressable, View} from 'react-native';
import {router, useLocalSearchParams} from 'expo-router';
import {BookModal} from '../components/BookModal';
import {COLORS as C, formatAmount, formatDate, isActive, shortId, STATUS_COPY} from '../model';
import {useApp} from '../state';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, Loading, T} from '../ui';

export default function Deliveries() {
  const {orders, user, session, loading, error, refresh} = useApp();
  const {view} = useLocalSearchParams<{view?: string}>();
  const activeOnly = view === 'active';
  const [tab, setTab] = useState<'all' | 'active' | 'completed'>('all');
  const [booking, setBooking] = useState(false);

  const activeOrders = orders.filter(isActive);
  const completedOrders = orders.filter(order => order.status === 'Completed');
  const visible = activeOnly ? activeOrders : orders.filter(order => tab === 'all' || (tab === 'active' ? isActive(order) : order.status === 'Completed'));

  return (
    <View style={{gap: 20}}>
      {/* Stitch Header Overview */}
      <View style={{gap: 8}}>
        <View style={common.between}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: C.lime}} />
            <Label style={{color: C.primary, letterSpacing: 1.2, fontSize: 10}}>Campus Dispatch Mesh</Label>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.pale, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20}}>
            <Icon name="shield-checkmark" size={13} color={C.primary} />
            <T style={{fontSize: 10, fontFamily: 'DMSansBold', color: C.ink}}>{completedOrders.length} Safe Hand-offs</T>
          </View>
        </View>

        <View style={[common.between, {alignItems: 'flex-start', flexWrap: 'wrap', gap: 12}]}>
          <View style={{flex: 1, minWidth: 200}}>
            <Heading style={{fontSize: 28, lineHeight: 36, letterSpacing: -0.8}}>{activeOnly ? 'Active Orders' : 'Parcel Vault'}</Heading>
            <T style={{fontSize: 12, color: C.muted, marginTop: 2}}>
              {user?.hostel_block ? 'Hostel Block ' + user.hostel_block + ' Porch' : 'Gate 2 to your campus doorstep'}
            </T>
          </View>
          <Button variant="primary" icon="add-outline" onPress={() => setBooking(true)} accessibilityLabel="Book a delivery">
            Book a delivery
          </Button>
        </View>
      </View>

      {/* Interactive Segmented Control Tabs */}
      {!activeOnly && <View style={{padding: 4, borderRadius: 12, backgroundColor: '#DCE2F7', flexDirection: 'row', gap: 4}}>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="All deliveries"
          accessibilityState={{selected: tab === 'all'}}
          aria-selected={tab === 'all'}
          onPress={() => setTab('all')}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 8,
            backgroundColor: tab === 'all' ? C.white : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <T style={{fontFamily: tab === 'all' ? 'DMSansBold' : 'DMSans', fontSize: 12, color: tab === 'all' ? C.ink : C.muted}}>
            All
          </T>
          <View style={{paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, backgroundColor: tab === 'all' ? C.lavender : '#C4C1FB'}}>
            <T style={{fontFamily: 'DMSansBold', fontSize: 10, color: C.ink}}>{orders.length}</T>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Active deliveries"
          accessibilityState={{selected: tab === 'active'}}
          aria-selected={tab === 'active'}
          onPress={() => setTab('active')}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 8,
            backgroundColor: tab === 'active' ? C.white : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <T style={{fontFamily: tab === 'active' ? 'DMSansBold' : 'DMSans', fontSize: 12, color: tab === 'active' ? C.ink : C.muted}}>
            Active Runs
          </T>
          <View style={{paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, backgroundColor: C.lime}}>
            <T style={{fontFamily: 'DMSansBold', fontSize: 10, color: C.onLime}}>{activeOrders.length}</T>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Completed deliveries"
          accessibilityState={{selected: tab === 'completed'}}
          aria-selected={tab === 'completed'}
          onPress={() => setTab('completed')}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 8,
            backgroundColor: tab === 'completed' ? C.white : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <T style={{fontFamily: tab === 'completed' ? 'DMSansBold' : 'DMSans', fontSize: 12, color: tab === 'completed' ? C.ink : C.muted}}>
            Completed
          </T>
          <View style={{paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, backgroundColor: '#DCE2F7'}}>
            <T style={{fontFamily: 'DMSansBold', fontSize: 10, color: C.muted}}>{completedOrders.length}</T>
          </View>
        </Pressable>
      </View>}

      {error && <ErrorNotice message={error} retry={() => void refresh()} />}

      {loading && !orders.length ? (
        <Loading />
      ) : visible.length ? (
        <View style={{gap: 16}}>
          {visible.map(order => {
            const active = isActive(order);
            if (active) {
              const staging = session?.mode === 'real' && order.is_demo;
              /* Stitch Autonomous Rover Active Card */
              return (
                <View
                  key={order.id}
                  style={{
                    borderRadius: 14,
                    backgroundColor: C.dark,
                    padding: 18,
                    gap: 16,
                    borderWidth: 1,
                    borderColor: '#293349',
                    shadowColor: '#141B2B',
                    shadowOffset: {width: 0, height: 6},
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                  }}
                >
                  <View style={common.between}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                      <View style={{width: 36, height: 36, borderRadius: 8, backgroundColor: '#424B5D', alignItems: 'center', justifyContent: 'center'}}>
                        <Icon name="hardware-chip-outline" size={20} color={C.lime} />
                      </View>
                      <View>
                        <Heading style={{fontSize: 16, lineHeight: 22, color: '#FFFFFF'}}>{staging ? 'Test booking' : order.bot ? 'Rover ' + order.bot.id.slice(0, 8) : 'Awaiting rover'}</Heading>
                        <T style={{fontSize: 10, color: '#C4C1FB'}}>{shortId(order.id)}</T>
                      </View>
                    </View>
                    <View style={{backgroundColor: '#4A5668', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5}}>
                      <View style={{width: 5, height: 5, borderRadius: 3, backgroundColor: C.lime}} />
                      <T style={{fontFamily: 'DMSansBold', fontSize: 10, color: '#ACF847', letterSpacing: 0.6}}>
                        {staging ? 'SAVED IN STAGING' : STATUS_COPY[order.status].label.toUpperCase()}
                      </T>
                    </View>
                  </View>

                  {/* Route Visualizer */}
                  <View style={{backgroundColor: '#20293A', borderRadius: 10, padding: 12, gap: 8}}>
                    <View style={common.between}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                        <Icon name="enter-outline" size={14} color="#EDF0FF" />
                        <T style={{fontSize: 11, fontFamily: 'DMSansBold', color: '#EDF0FF'}}>Gate 2 Security Hub</T>
                      </View>
                      <Icon name="arrow-forward-outline" size={13} color="#C4C1FB" />
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                        <Icon name="business-outline" size={14} color={C.lime} />
                        <T style={{fontSize: 11, fontFamily: 'DMSansBold', color: '#EDF0FF'}}>Hostel {order.destination_hostel_block}</T>
                      </View>
                    </View>
                  </View>

                  <View style={common.between}>
                    <T style={{fontSize: 11, color: '#C4C1FB'}}>
                      {order.compartment_id ? 'Bay ' + order.compartment_id + ' · ' : ''}{order.parcel_label || 'Campus parcel'}
                    </T>
                    <T style={{fontFamily: 'ManropeBold', fontSize: 14, color: '#FFFFFF'}}>
                      {formatAmount(order.amount)}
                    </T>
                  </View>

                  <Button
                    variant="primary"
                    icon="compass-outline"
                    onPress={() => router.push({pathname: '/order/[id]', params: {id: order.id}})}
                    accessibilityLabel={staging ? 'View test booking' : 'Track live mission console'}
                  >
                    {staging ? 'View test booking' : 'Track Live Mission Console'}
                  </Button>
                </View>
              );
            }

            /* Completed Card (Stitch Vault Item) */
            return (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                accessibilityLabel={'View delivery ' + shortId(order.id)}
                onPress={() => router.push({pathname: '/order/[id]', params: {id: order.id}})}
                style={({pressed}) => [{
                  borderRadius: 14,
                  backgroundColor: C.white,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: C.line,
                  gap: 12,
                  opacity: pressed ? 0.85 : 1,
                  shadowColor: '#141B2B',
                  shadowOffset: {width: 0, height: 2},
                  shadowOpacity: 0.04,
                  shadowRadius: 6,
                }]}
              >
                <View style={common.between}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0}}>
                    <View style={{width: 38, height: 38, borderRadius: 19, backgroundColor: '#DDF4C5', alignItems: 'center', justifyContent: 'center'}}>
                      <Icon name="checkmark-circle" size={22} color={C.primary} />
                    </View>
                    <View style={{flex: 1, minWidth: 0}}>
                      <T numberOfLines={1} style={{fontFamily: 'DMSansBold', fontSize: 14, lineHeight: 20}}>
                        {order.parcel_label || 'Campus Delivery'}
                      </T>
                      <T style={{fontSize: 11, color: C.muted}}>
                        {shortId(order.id)} · Gate 2 → Hostel {order.destination_hostel_block}
                      </T>
                    </View>
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <T style={{fontFamily: 'ManropeBold', fontSize: 15, lineHeight: 20}}>
                      {formatAmount(order.amount)}
                    </T>
                    <T style={{fontSize: 10, color: C.primary, fontFamily: 'DMSansBold'}}>PAID UPI</T>
                  </View>
                </View>

                <View style={[common.between, {borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10}]}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <View style={{backgroundColor: C.pale, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6}}>
                      <T style={{fontSize: 10, fontFamily: 'DMSansBold', color: C.muted}}>
                        BAY 0{order.compartment_id || 1}
                      </T>
                    </View>
                    <T style={{fontSize: 11, color: C.muted}}>
                      {formatDate(order.created_at)}
                    </T>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                    <T style={{fontSize: 11, fontFamily: 'DMSansBold', color: C.primary}}>View receipt</T>
                    <Icon name="chevron-forward-outline" size={13} color={C.primary} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Card style={{paddingVertical: 56, alignItems: 'center', gap: 12}}>
          <View style={{height: 60, width: 60, borderRadius: 20, backgroundColor: C.lavender, justifyContent: 'center', alignItems: 'center'}}>
            <Icon name="archive-outline" size={28} color={C.primary} />
          </View>
          <Heading style={{fontSize: 20, lineHeight: 28}}>{activeOnly ? 'No active orders' : 'No deliveries found'}</Heading>
          <T style={{fontSize: 12, color: C.muted, marginBottom: 8}}>{activeOnly ? 'Your orders in progress will appear here.' : 'Your parcels and dispatches will appear here.'}</T>
          <Button variant="primary" onPress={() => setBooking(true)}>
            Book a delivery
          </Button>
        </Card>
      )}

      {booking && <BookModal onClose={() => setBooking(false)} />}
    </View>
  );
}
