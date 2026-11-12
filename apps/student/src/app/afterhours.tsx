import React, {useCallback, useEffect, useState} from 'react';
import {router} from 'expo-router';
import {Image, useWindowDimensions, View} from 'react-native';
import {COLORS as C, formatAmount} from '../model';
import {getMerchants, PilotMerchant, PilotSchedule} from '../pilot';
import {useApp} from '../state';
import {Button, Card, ErrorNotice, Heading, Icon, Label, Loading, PageTitle, Pill, T} from '../ui';

const merchantPhotos = {
  hot_food: require('../../assets/stitch/wraps.jpg'),
  tuck_shop: require('../../assets/stitch/essentials.jpg'),
};

export default function AfterHours() {
  const {session} = useApp();
  const {width} = useWindowDimensions();
  const token = session?.access_token ?? '';
  const [schedule, setSchedule] = useState<PilotSchedule | null>(null);
  const [merchants, setMerchants] = useState<PilotMerchant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getMerchants(token).then(payload => {
      if (!alive) return;
      setSchedule(payload.schedule);
      setMerchants(payload.merchants);
      setError(null);
    }).catch((err: Error) => {
      if (alive) setError(err.message);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [token]);
  const reload = useCallback(() => {
    setLoading(true);
    getMerchants(token).then(payload => {
      setSchedule(payload.schedule);
      setMerchants(payload.merchants);
      setError(null);
    }).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [token]);

  if (!session) return <Card><T>Sign in to browse the After Hours pilot.</T></Card>;
  if (loading && !schedule) return <Loading label="Checking tonight's windows…" />;
  return <View style={{gap: 20}}>
    <PageTitle eyebrow="AFTER HOURS · CAMPUS DELIVERY" title="Midnight cravings."
      description="Good food. Late essentials. A little closer to your door." />
    {error && <ErrorNotice message={error} retry={reload} />}
    {schedule && <Card style={{padding: 24, gap: 18, backgroundColor: C.dark, borderColor: C.dark, overflow: 'hidden'}}>
      <View style={{position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -100, top: -110, backgroundColor: '#84CC1618'}} />
      <View style={{flexDirection: 'row', gap: 14, alignItems: 'center'}}>
        <View style={{width: 52, height: 52, borderRadius: 16, backgroundColor: '#DDD9FF', alignItems: 'center', justifyContent: 'center'}}>
          <Icon name="moon-outline" size={28} color={C.ink} />
        </View>
        <View style={{flex: 1, gap: 5}}>
          <T style={{fontFamily: 'DMSansBold', fontSize: 10, letterSpacing: 1.8, color: '#D8D4FF'}}>THE AFTER HOURS WINDOW</T>
          <Heading style={{fontSize: 24, lineHeight: 32, color: '#FFFFFF'}}>
            {schedule.open ? 'Your night. Delivered.' : "We'll catch you tonight."}
          </Heading>
        </View>
      </View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
        <View style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: schedule.open ? '#84CC1629' : '#FFFFFF18', flexDirection: 'row', gap: 6, alignItems: 'center'}}>
          <Icon name={schedule.open ? 'checkmark-circle-outline' : 'time-outline'} size={16} color={schedule.open ? '#BEF264' : '#E2E8F0'} />
          <T style={{fontFamily: 'DMSansBold', fontSize: 12, color: schedule.open ? '#BEF264' : '#E2E8F0'}}>
            {schedule.open ? 'After Hours window is open' : 'After Hours window is closed'}
          </T>
        </View>
        <T style={{fontSize: 12, color: '#D8D4FF', alignSelf: 'center'}}>
          {schedule.start_local.slice(0, 5)}–{schedule.end_local.slice(0, 5)} · {schedule.timezone}
        </T>
      </View>
      <T style={{fontSize: 13, lineHeight: 21, color: '#CBD5E1'}}>
        Campus kitchens and tuck-shop essentials, delivered in reserved rover compartments. Availability follows each merchant’s departure window.
      </T>
      <View style={{flexDirection: 'row', gap: 12}}>
        {[{label: 'TUCK SHOP DELIVERY',fee: schedule.tuck_fee_paise,icon: 'basket-outline' as const},
          {label: 'HOT FOOD DELIVERY',fee: schedule.hot_food_fee_paise,icon: 'flame-outline' as const}].map(item =>
          <View key={item.label} style={{flex: 1, backgroundColor: '#FFFFFF0D', borderRadius: 12, padding: 14, gap: 7}}>
            <Icon name={item.icon} color="#BEF264" size={20} />
            <T style={{fontFamily: 'ManropeBold', fontSize: 27, lineHeight: 35, color: '#FFFFFF'}}>{formatAmount(item.fee)}</T>
            <T style={{fontSize: 9, letterSpacing: 1, color: '#D8D4FF'}}>{item.label}</T>
          </View>)}
      </View>
    </Card>}
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
      <Pill icon="fast-food-outline" tone="neutral">Hot food delivery</Pill>
      <Pill icon="basket-outline" tone="neutral">Tuck shop essentials</Pill>
      <Pill icon="lock-closed-outline" tone="neutral">Secure compartments</Pill>
    </View>
    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12}}>
      <View style={{flex: 1}}><Heading style={{fontSize: 24, lineHeight: 32}}>Find your next favourite.</Heading><T style={{fontSize: 12, color: C.muted, marginTop: 4}}>Campus merchants and their next departures</T></View>
      <Icon name="restaurant-outline" color={C.ink} size={25} />
    </View>
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 18}}>
      {merchants.map(merchant => {
        const next = merchant.departures.find(w => w.remaining > 0) || merchant.departures[0];
        const full = Boolean(next && next.remaining === 0);
        const closed = merchant.kind === 'hot_food' && !schedule?.open;
        return <Card key={merchant.merchant_id} style={{width: width >= 900 ? '48%' : '100%', padding: 0, overflow: 'hidden'}}>
          <View style={{padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center'}}>
            <Image source={merchantPhotos[merchant.kind]} accessibilityLabel="Illustrative merchant photo" style={{width: 84, height: 84, borderRadius: 14}} />
            <View style={{flex: 1, gap: 6}}>
              <T style={{fontFamily: 'ManropeBold', fontSize: 19, lineHeight: 26}}>{merchant.name}</T>
              <T style={{fontSize: 12, lineHeight: 18, color: C.muted}}>
                {merchant.kind === 'hot_food' ? 'Warm bites for your late-night plans.' : 'Snacks, study fuel and everyday essentials.'}
              </T>
              <T style={{fontSize: 11, color: C.muted}}>Serving {merchant.hostel_block} block</T>
            </View>
          </View>
          <View style={{marginHorizontal: 18, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: C.lavender, gap: 6}}>
            <View style={{flexDirection: 'row', gap: 7, alignItems: 'center'}}>
              <Icon name="time-outline" size={15} />
              <T style={{fontSize: 12, flex: 1}}>{next ? 'Next departure ' + next.window_start.slice(11, 16) + '–' + next.window_end.slice(11, 16) : 'No departure scheduled'}</T>
            </View>
            {next && <T style={{fontFamily: 'DMSansBold', fontSize: 12}}>{next.remaining}/{next.capacity} compartments left</T>}
          </View>
          <View style={{padding: 18, gap: 12}}>
            {merchant.insulated_bay && <Pill icon="albums-outline">{merchant.insulated_bay + ' · Insulated'}</Pill>}
            <Button icon={merchant.kind === 'hot_food' ? 'flame-outline' : 'basket-outline'}
              disabled={!next || full || closed}
              onPress={() => router.push({pathname: '/tuckshop' as never, params: {merchant_id: merchant.merchant_id}})}>
              {closed ? 'Hot food opens after hours' : full ? 'Window full' : 'Browse and order'}
            </Button>
          </View>
        </Card>;
      })}
    </View>
    {!merchants.length && <Card style={{alignItems: 'center', gap: 10, padding: 30}}><Icon name="storefront-outline" size={32} /><Heading style={{fontSize: 20}}>The counters are quiet.</Heading><T style={{color: C.muted, textAlign: 'center'}}>Merchants will appear here when the campus pilot is configured.</T></Card>}
    <Card style={{backgroundColor: C.lavender, borderColor: C.lavender, padding: 20, gap: 14}}>
      <View style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}><Icon name="cube-outline" size={25} /><View style={{flex: 1}}><Label>Gate 2 parcels</Label><T style={{fontSize: 13}}>Your existing delivery is always one tap away.</T></View></View>
      <Button variant="secondary" icon="navigate-outline" onPress={() => router.push('/deliveries')}>Parcel tracking</Button>
    </Card>
    <Card style={{padding: 20, gap: 10}}>
      <Label>BEHIND THE COUNTER</Label>
      <T style={{fontFamily: 'ManropeBold', fontSize: 18}}>Merchant staff?</T>
      <T style={{fontSize: 12, lineHeight: 19, color: C.muted}}>Manage incoming orders and loading from your merchant queue.</T>
      <Button variant="secondary" icon="storefront-outline" onPress={() => router.push('/merchant' as never)}>Open merchant queue</Button>
    </Card>
    <T style={{fontSize: 10, color: C.muted, textAlign: 'center'}}>Merchant photos are illustrative. Menus, fees and availability come from the server.</T>
  </View>;
}
