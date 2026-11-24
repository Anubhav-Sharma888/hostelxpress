import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Image, Pressable, View} from 'react-native';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {COLORS as C, formatAmount} from '../model';
import {getItems, getMerchants, payOrder, placeOrder, postQuote, PilotItem, PilotMerchant, PilotQuote, PilotSchedule} from '../pilot';
import {useApp} from '../state';
import {hostelName} from '../campus';
import {Button, Card, ErrorNotice, Heading, Icon, Label, Loading, PageTitle, Pill, T} from '../ui';

const QUOTE_VALID_MS = 10 * 60 * 1000; // the server rejects orders on expired quotes

// Tuck Shop / hot food ordering: browse, cart, checkout. Prices and fees come
// only from the server quote; the client never computes what a student pays.
export default function TuckShop() {
  const {session} = useApp();
  // Preview sessions carry no credential field; the QA-preview notice renders
  // below and an empty token keeps every effect offline.
  const token = session && session.mode !== 'qa-preview' ? session.access_token : '';
  const router = useRouter();
  const params = useLocalSearchParams<{merchant_id?: string}>();
  const [schedule, setSchedule] = useState<PilotSchedule | null>(null);
  const [merchant, setMerchant] = useState<PilotMerchant | null>(null);
  const [items, setItems] = useState<PilotItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<PilotQuote | null>(null);
  const [quoteTick, setQuoteTick] = useState(0);
  const [tick, setTick] = useState(0);
  const [placedId, setPlacedId] = useState<string | null>(null);
  const [paidFor, setPaidFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    getMerchants(token).then(data => {
      setSchedule(data.schedule);
      const target = data.merchants.find(entry => entry.merchant_id === params.merchant_id) || data.merchants[0];
      setMerchant(target);
      if (target) {
        getItems(token, target.merchant_id).then(catalogue => setItems(catalogue.items)).catch((err: Error) => setError(err.message));
      }
    }).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [token, params.merchant_id]);
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => setTick(value => value + 1), 1000);
    load();
    return () => clearInterval(timer);
  }, [token, load]);

  const cartLines = useMemo(() => Object.entries(cart).filter(([, quantity]) => quantity > 0)
    .map(([item_id, quantity]) => ({item_id, quantity})), [cart]);
  // A stored quote only matches the exact cart it was quoted for: any cart
  // (or merchant/departure) change invalidates it and requires a new quote.
  const cartFingerprint = JSON.stringify(cartLines) + '|' + (merchant?.merchant_id ?? '') + '|' + (merchant?.departures[0]?.departure_id ?? '');
  const [quotedFingerprint, setQuotedFingerprint] = useState<string | null>(null);
  // Staleness is derived, not stored: a changed cart fingerprint invalidates
  // the stored quote on the next render without an effect.
  const quoteAge = quoteTick ? (tick - quoteTick) * 1000 : 0;
  const quoteExpired = Boolean(quote) && quoteAge > QUOTE_VALID_MS;
  const quoteValid = Boolean(quote) && quotedFingerprint === cartFingerprint && !quoteExpired;
  const itemsTotal = cartLines.reduce((sum, line) => {
    const item = items.find(entry => entry.item_id === line.item_id);
    return sum + (item ? item.price_paise * line.quantity : 0);
  }, 0);
  const feePreview = merchant?.kind === 'hot_food' ? schedule?.hot_food_fee_paise : schedule?.tuck_fee_paise;

  // Step one: request a quote. This NEVER places an order — it only shows the
  // server's exact fee, total, and expiry for explicit confirmation.
  const requestQuote = useCallback(async () => {
    if (!merchant || !cartLines.length) return;
    setBusy(true);
    try {
      const fresh = await postQuote(token, {merchant_id: merchant.merchant_id, departure_id: merchant.departures[0].departure_id, items: cartLines});
      setQuote(fresh);
      setQuotedFingerprint(cartFingerprint);
      setQuoteTick(tick);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [merchant, cartLines, cartFingerprint, tick, token]);

  // Step two: confirm the displayed quote. An expired or stale quote is
  // refused here and a fresh quote must be shown and confirmed again.
  const confirmOrder = useCallback(async () => {
    if (!merchant || !quote || !quoteValid) return;
    setBusy(true);
    try {
      const placed = await placeOrder(token, quote.quote_id);
      setPlacedId(placed.order_id);
    } catch (err) {
      setError((err as Error).message);
      setQuote(null);
      setQuotedFingerprint(null);
    } finally {
      setBusy(false);
    }
  }, [merchant, quote, quoteValid, token]);

  if (!session) return <Card style={{padding: 22}}><T>Sign in to order from the After Hours pilot.</T></Card>;
  if (session.mode === 'qa-preview') return <Card style={{padding: 22, gap: 10}}>
    <T style={{fontFamily: 'ManropeBold', fontSize: 16}}>QA Preview · ordering unavailable</T>
    <T style={{fontSize: 13, color: C.muted}}>Tuck Shop quotes and departures come from the backend, which the offline QA preview does not reach. Exit preview and sign in to order for real.</T>
  </Card>;
  if (loading) return <Loading label="Opening the shop…" />;
  if (!merchant) return <ErrorNotice message="No merchant is configured for this pilot yet." retry={() => void load()} />;
  const departure = merchant.departures[0];
  return <View style={{gap: 20}}>
    <PageTitle eyebrow={merchant.kind === 'hot_food' ? 'After-hours hot food' : 'Tuck Shop Express'} title={merchant.name}
      description={`Batched delivery to ${hostelName(departure?.hostel_block ?? merchant.hostel_block)}.`}
      action={merchant.insulated_bay ? <Pill tone="green" icon="albums-outline">{merchant.insulated_bay + ' · Insulated'}</Pill> : undefined} />
    <Card style={{backgroundColor: C.dark, borderColor: C.dark, padding: 0, overflow: 'hidden'}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20}}>
        <View style={{flex: 1, gap: 9}}>
          <Label style={{color: '#D8D4FF'}}>YOUR CAMPUS COUNTER</Label>
          <Heading style={{fontSize: 25, lineHeight: 33, color: '#FFFFFF'}}>{merchant.kind === 'hot_food' ? 'Something warm.\nSomewhere close.' : 'Your late-night\nstudy essentials.'}</Heading>
          <T style={{fontSize: 12, lineHeight: 19, color: '#CBD5E1'}}>Browse, get your quote, then confirm your order.</T>
        </View>
        <Image source={merchant.kind === 'hot_food' ? require('../../assets/stitch/wraps.jpg') : require('../../assets/stitch/essentials.jpg')}
          accessibilityLabel="Illustrative shop photo" style={{width: 94, height: 130, borderRadius: 16}} />
      </View>
    </Card>
    {error && <ErrorNotice message={error} retry={() => { setError(null); }} />}
    {placedId ? <Card style={{padding: 24, gap: 10, alignItems: 'center'}}>
      <Icon name="checkmark-circle" size={34} />
      <T style={{fontFamily: 'ManropeBold', fontSize: 19}}>Order placed.</T>
      <T style={{fontSize: 13, color: C.muted, textAlign: 'center'}}>The merchant will accept it for the {departure?.window_start.slice(11, 16)} departure. Track it from After Hours.</T>
      {paidFor === placedId ? <T style={{fontSize: 13, color: C.muted}}>Payment confirmed · waiting for the merchant.</T>
        : <Button variant="orange" icon="card-outline" loading={busy} onPress={() => {
            setBusy(true);
            payOrder(token, placedId).then(() => setPaidFor(placedId)).catch((err: Error) => setError(err.message)).finally(() => setBusy(false));
          }}>Simulate payment</Button>}
      <Button variant="secondary" icon="moon-outline" onPress={() => router.push('/afterhours' as never)}>After Hours home</Button>
      <Button variant="secondary" onPress={() => { setPlacedId(null); setCart({}); setQuote(null); }}>Order something else</Button>
    </Card> : <>
      {departure && <Card style={{padding: 20, gap: 9, backgroundColor: C.lavender, borderColor: C.lavender}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Icon name="time-outline" size={16} />
          <T style={{fontFamily: 'DMSansBold', fontSize: 13}}>Departure {departure.window_start.slice(11, 16)}–{departure.window_end.slice(11, 16)} to {hostelName(departure.hostel_block)}</T>
        </View>
        <View style={{flexDirection: 'row', gap: 10}}>
          <View style={{flex: 1, padding: 14, borderRadius: 10, backgroundColor: C.white, gap: 7}}>
            <Label>DEPARTURE WINDOW</Label><T style={{fontFamily: 'ManropeBold', fontSize: 20, lineHeight: 28}}>{departure.window_start.slice(11, 16)}</T>
            <T style={{fontSize: 11, color: C.muted}}>Closes {departure.window_end.slice(11, 16)}</T>
          </View>
          <View style={{flex: 1, padding: 14, borderRadius: 10, backgroundColor: C.white, gap: 7}}>
            <Label>AVAILABLE SLOTS</Label><T style={{fontFamily: 'ManropeBold', fontSize: 20, lineHeight: 28}}>{departure.remaining} / {departure.capacity}</T>
            <T style={{fontSize: 11, color: C.muted}}>Server-confirmed capacity</T>
          </View>
        </View>
        <T style={{fontSize: 12, color: C.muted}}>{departure.remaining}/{departure.capacity} compartments left in this window. Cutoff closes when the window is full.</T>
      </Card>}
      <View style={{gap: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}><Heading style={{fontSize: 23, lineHeight: 31}}>On the menu</Heading><Icon name="restaurant-outline" size={22} /></View>
        {items.map(item => <Card key={item.item_id} style={{padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14}}>
          <View style={{flex: 1, gap: 3}}>
            <T style={{fontFamily: 'DMSansBold', fontSize: 14}}>{item.name}</T>
            <T style={{fontSize: 13, color: C.muted}}>{formatAmount(item.price_paise)}</T>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <Pressable accessibilityRole="button" accessibilityLabel={'Remove one ' + item.name} onPress={() => setCart(current => ({...current, [item.item_id]: Math.max((current[item.item_id] || 0) - 1, 0)}))}
              style={{minHeight: 48, minWidth: 48, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center'}}><Icon name="remove-outline" size={17} /></Pressable>
            <T style={{fontFamily: 'DMSansBold', minWidth: 20, textAlign: 'center'}}>{cart[item.item_id] || 0}</T>
            <Pressable accessibilityRole="button" accessibilityLabel={'Add one ' + item.name} onPress={() => setCart(current => ({...current, [item.item_id]: Math.min((current[item.item_id] || 0) + 1, 5)}))}
              style={{minHeight: 48, minWidth: 48, borderRadius: 10, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center'}}><Icon name="add-outline" size={17} color={C.onLime} /></Pressable>
          </View>
        </Card>)}
      </View>
      <Card style={{padding: 18, gap: 14, backgroundColor: '#E1E8FD', borderColor: '#E1E8FD'}}>
        <View style={{flexDirection: 'row', gap: 10, alignItems: 'center'}}><View style={{padding: 9, borderRadius: 10, backgroundColor: C.lavender}}><Icon name="receipt-outline" size={22}/></View><Heading style={{fontSize: 23, lineHeight: 31}}>Order Summary</Heading></View>
        {cartLines.length ? <>
          {(quoteValid ? quote!.items : cartLines.map(line => {
            const item = items.find(entry => entry.item_id === line.item_id);
            return {item_id: line.item_id, name: item?.name ?? 'Item', quantity: line.quantity, price_paise: item?.price_paise ?? 0};
          })).map(line => <View key={line.item_id} style={{flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
            <T style={{fontSize: 13, flex: 1}}>{line.name} × {line.quantity}</T>
            <T style={{fontSize: 13}}>{formatAmount(line.price_paise * line.quantity)}</T>
          </View>)}
          <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
            <T style={{fontSize: 13, color: C.muted}}>Items</T><T style={{fontSize: 13}}>{formatAmount(quoteValid ? quote!.total_paise - quote!.fee_paise : itemsTotal)}</T>
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
            <T style={{fontSize: 13, color: C.muted}}>Delivery fee</T><T style={{fontSize: 13}}>{formatAmount(quoteValid ? quote!.fee_paise : (feePreview ?? 0))}</T>
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8}}>
            <T style={{fontFamily: 'DMSansBold', fontSize: 15}}>{quoteValid ? 'Total payable' : 'Estimated total'}</T>
            <T style={{fontFamily: 'ManropeBold', fontSize: 24, lineHeight: 31}}>{formatAmount(quoteValid ? quote!.total_paise : itemsTotal + (feePreview ?? 0))}</T>
          </View>
          {quoteValid && quote && <View style={{backgroundColor: C.lavender, padding: 12, borderRadius: 12, gap: 8}}>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8}}>
              <T style={{fontFamily: 'DMSansBold'}}>Step 1: Quote verified</T>
              <Pill tone="neutral">{'Expires in ' + Math.max(0, Math.ceil((QUOTE_VALID_MS - quoteAge) / 1000)) + 's'}</Pill>
            </View>
            <T style={{fontSize: 12}}>Quote locked for this cart. Total: {formatAmount(quote.total_paise)}</T>
          </View>}
          {quote && !quoteValid && <T style={{fontSize: 12, color: '#92400E'}}>{quoteExpired ? 'Your quote expired.' : 'Your cart changed.'} Request a new quote, then confirm.</T>}
          {quoteValid && quote
            ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                <Button variant="secondary" onPress={() => void requestQuote()} disabled={busy}>Get a new quote</Button>
                <Button icon="lock-closed-outline" onPress={() => void confirmOrder()} loading={busy} accessibilityLabel="Confirm this order">
                  {'Confirm This Order (' + formatAmount(quote.total_paise) + ')'}
                </Button>
              </View>
            : <Button icon="receipt-outline" onPress={() => void requestQuote()} loading={busy} disabled={busy || !cartLines.length}
                accessibilityLabel="Get quote">{quote ? 'Get a new quote' : 'Get quote'}</Button>}
          <T style={{fontSize: 11, color: C.muted}}>Simulated checkout — no real money moves. Payment is confirmed separately from loading.</T>
        </> : <T style={{fontSize: 13, color: C.muted}}>Add something from the catalogue to see fees and the total before confirming.</T>}
      </Card>
    </>}
  </View>;
}
