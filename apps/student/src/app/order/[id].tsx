import React, {useEffect, useState} from 'react';
import {Image, Pressable, TextInput, View} from 'react-native';
import {router, useLocalSearchParams} from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {ApiError, Order, Payment, PickupOtp2, request} from '../../api';
import {hostelName} from '../../campus';
import {CampusMap} from '../../components/CampusMap';
import {FLOW, formatAmount, formatTime, freshRoverPosition, isStale, nextDemoAction, shortId, STATUS_COPY} from '../../model';
import {useApp} from '../../state';
import {useClock} from '../../hooks/useClock';
import {Button, Card, ErrorNotice, Heading, Icon, Label, Loading, T} from '../../ui';

const S = {
  white: '#FFFFFF', ink: '#0B1C30', muted: '#565E74', orange: '#FF5E00',
  dark: '#213145', pale: '#EFF4FF', blue: '#DCE9FF', teal: '#006A61',
};
const card = {padding: 16, borderRadius: 12, borderWidth: 0, gap: 14};
const title = {fontSize: 20, lineHeight: 26, letterSpacing: -.3};
const pickupLabels = ['Pay Due', 'Verify', 'Assigned', 'Done'];

export default function DeliveryDetail() {
  const {id} = useLocalSearchParams<{id: string}>();
  const {session} = useApp();
  return <DeliveryContent key={id + ':' + (session ? (session.mode === 'qa-preview' ? 'qa-preview:' + session.user.id : session.access_token) : 'signed-out')} />;
}

function DeliveryContent() {
  const {id} = useLocalSearchParams<{id: string}>();
  const {orders, loading, session, advance, refresh} = useApp();
  const storedOrder = orders.find(item => item.id === id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [pickupOtp, setPickupOtp] = useState<PickupOtp2 | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [courierCode, setCourierCode] = useState('');
  const [courierQueued, setCourierQueued] = useState(false);
  const [previewStage, setPreviewStage] = useState<number | null>(null);
  const [showPreviewControls, setShowPreviewControls] = useState(false);
  const now = useClock();
  const qa = session?.mode === 'qa-preview';
  const demo = session?.mode === 'demo';
  const paymentToken = session && session.mode !== 'qa-preview' ? session.access_token : undefined;
  const paymentOrderId = storedOrder?.id;
  const paymentOrderStatus = storedOrder?.status;
  // Rehydrate a saved payment after screen reopen without creating another QR.
  // The server returns 404 before first payment; that is an expected state.
  useEffect(() => {
    if (!paymentToken || !paymentOrderId ||
        !['Arrived', 'Paid'].includes(paymentOrderStatus || '')) return;
    let active = true;
    void request<Payment>('/v1/orders/' + encodeURIComponent(paymentOrderId) + '/payment',
      paymentToken, {timeoutMs: 75000}).then(result => {
        if (active) setPayment(result);
      }).catch(err => {
        if (active && !(err instanceof ApiError && err.status === 404)) {
          setError((err as Error).message);
        }
      });
    return () => { active = false; };
  }, [paymentToken, paymentOrderId, paymentOrderStatus]);

  // Read-only recovery of an already issued pickup code; it never creates
  // one and does not issue any compartment command.
  useEffect(() => {
    if (!paymentToken || !paymentOrderId || paymentOrderStatus !== 'Paid') return;
    let active = true;
    void request<PickupOtp2>('/v1/orders/' + encodeURIComponent(paymentOrderId) + '/pickup-otp',
      paymentToken).then(result => {
        if (active) setPickupOtp(result);
      }).catch(err => {
        if (active && !(err instanceof ApiError && err.status === 404)) {
          setError((err as Error).message);
        }
      });
    return () => {active = false;};
  }, [paymentToken, paymentOrderId, paymentOrderStatus]);

  if (!storedOrder) {
    return loading ? <Loading /> : <View style={{gap: 16}}>
      <Heading style={title}>Delivery unavailable.</Heading>
      <Button onPress={() => router.replace('/deliveries')}>Back to my deliveries</Button>
    </View>;
  }
  // Preview controls render local fixture states only. They never send commands or payments.
  const order: Order = qa && previewStage !== null ? {
    ...storedOrder,
    status: previewStage === 0 ? 'Arrived' : previewStage === 3 ? 'Completed' : 'Paid',
    compartment_id: storedOrder.compartment_id ?? 2,
    payment_status: previewStage === 0 ? 'Unpaid' : 'SimPaid',
    bot: {
      ...(storedOrder.bot || {id: 'qa-preview-rover', battery_level: 87, current_lat: null, current_lng: null}),
      status: previewStage === 2 ? 'UNLOCKED' : 'AT_HOSTEL',
      last_seen_at: new Date(now).toISOString(),
    },
  } : storedOrder;
  const stale = isStale(order.bot?.last_seen_at, now);
  const unlocked = order.status === 'Paid' && order.bot?.status === 'UNLOCKED' && !stale;
  const handover = ['Arrived', 'Paid', 'Completed'].includes(order.status);
  const pickupStage = order.status === 'Completed' ? 3 : unlocked ? 2 : order.status === 'Paid' ? 1 : 0;
  const expired = payment?.status === 'pending' && payment.expires_at ? Date.parse(payment.expires_at) <= now : false;
  const alreadyPaid = payment?.status === 'paid';
  const refunded = payment?.status === 'refunded';
  const paymentFailed = payment?.status === 'failed';
  const reconciling = payment?.status === 'reconciling';
  const needsReview = expired || refunded || paymentFailed || reconciling;
  const next = nextDemoAction(order.status);
  const roverPosition = session?.mode === 'real' ? freshRoverPosition(order.bot, now) : null;
  const destination = hostelName(order.destination_hostel_block);
  const status = unlocked ? 'Ready to collect' : order.status === 'Arrived' ? 'Arrived · Awaiting payment' : STATUS_COPY[order.status].label;
  const stageNames = ['Parcel verified & loaded', 'Compartment sealed', 'Rover dispatched across campus', 'Hostel arrival & locker unlock'];
  const stageStatuses = ['Loaded', 'Loaded', 'Transit', 'Arrived'];
  const progress = Math.max(0, FLOW.indexOf(order.status));
  const advanceDemo = async () => {
    if (!demo || !next || busy) return;
    setBusy(true);
    setError(null);
    try { await advance(order.id, next.action); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const sendCourierCode = async () => {
    if (!session || session.mode !== 'real' || !storedOrder || otpBusy) return;
    if (!/^[0-9]{4,8}$/.test(courierCode)) {
      setError('Enter the 4–8 digit OTP provided by your delivery company.');
      return;
    }
    setOtpBusy(true);
    setError(null);
    setCourierQueued(false);
    try {
      await request('/v1/orders/' + encodeURIComponent(storedOrder.id) + '/courier-code',
        session.access_token, {method: 'POST', body: {code: courierCode}, timeoutMs: 75000});
      setCourierCode('');
      setCourierQueued(true);
    } catch (err) {setError((err as Error).message);}
    finally {setOtpBusy(false);}
  };
  const createPickupOtp = async () => {
    if (!session || session.mode !== 'real' || !storedOrder || otpBusy) return;
    setOtpBusy(true);
    setError(null);
    try {
      const issued = await request<PickupOtp2>(
        '/v1/orders/' + encodeURIComponent(storedOrder.id) + '/pickup-otp',
        session.access_token, {method: 'POST', timeoutMs: 75000});
      setPickupOtp(issued);
    } catch (err) {setError((err as Error).message);}
    finally {setOtpBusy(false);}
  };
  const preparePayment = async () => {
    if (!session || session.mode === 'qa-preview' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<Payment>('/v1/orders/' + encodeURIComponent(order.id) + '/payment', session.access_token, {method: 'POST', timeoutMs: 75000});
      setPayment(result);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const help = () => router.push('/help');
  const previewControls = qa && <View style={{gap: 8}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Toggle offline sample states"
      accessibilityState={{expanded: showPreviewControls}} onPress={() => setShowPreviewControls(value => !value)}
      style={{minHeight: 48, paddingHorizontal: 12, borderRadius: 10, backgroundColor: S.pale, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
      <T style={{fontSize: 11, color: S.muted}}>QA Preview · Offline sample</T>
      <Icon name={showPreviewControls ? 'chevron-up' : 'chevron-down'} size={18} color={S.muted}/>
    </Pressable>
    {showPreviewControls && <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
      <Button small variant="secondary" onPress={() => {setPreviewStage(null); setShowPreviewControls(false);}}>Tracking sample</Button>
      {pickupLabels.map((label, index) => <Button key={label} small variant={previewStage === index ? 'primary' : 'secondary'}
        onPress={() => {setPreviewStage(index); setShowPreviewControls(false);}} testID={'qa-pickup-' + index}>{label}</Button>)}
    </View>}
  </View>;

  return <View style={{gap: 16, paddingBottom: 16}}>
    {error && <ErrorNotice message={error} />}
    {previewControls}
    {qa && !handover && <Button variant="secondary" icon="wallet-outline"
      onPress={() => setPreviewStage(0)} testID="qa-payment-preview">Preview payment screen</Button>}
    {handover ? <>
      <View style={{backgroundColor: S.pale, borderRadius: 12, padding: 5, flexDirection: 'row', gap: 4}}>
        {pickupLabels.map((label, index) => <View key={label} style={{flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 3,
          borderRadius: 8, backgroundColor: pickupStage === index ? S.orange : S.pale}}>
          <T style={{textAlign: 'center', fontFamily: 'DMSansBold', fontSize: 12, color: pickupStage === index ? S.white : S.muted}}>{index + 1}. {label}</T>
          <T style={{textAlign: 'center', fontSize: 9, lineHeight: 14, color: pickupStage === index ? S.white : S.muted}}>
            {['Payment', 'Waiting unlock', 'Bay assigned', 'Lid closed'][index]}
          </T>
        </View>)}
      </View>
      <Card style={{...card, backgroundColor: S.pale}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <View style={{width: 40, height: 40, backgroundColor: S.blue, borderRadius: 20, alignItems: 'center', justifyContent: 'center'}}>
            <Icon name="hardware-chip-outline" color="#A63B00" />
          </View>
          <View style={{flex: 1, minWidth: 0}}>
            <T style={{fontFamily: 'DMSansBold', fontSize: 14}}>{qa ? 'QA sample rover' : order.bot ? 'Rover Bot ' + shortId(order.bot.id) : 'Campus rover'}</T>
            <T style={{fontSize: 12, color: S.muted}}>{destination} Hostel entrance</T>
          </View>
          <View style={{maxWidth: '32%'}}><Label>Order ref</Label><T style={{fontFamily: 'DMSansBold', fontSize: 12}}>{shortId(order.id)}</T></View>
        </View>
      </Card>
      <View style={{backgroundColor: S.white, padding: 10, borderRadius: 24, flexDirection: 'row', gap: 8, alignItems: 'center'}}>
        <Icon name={pickupStage === 3 ? 'checkmark-circle' : 'ellipse'} size={14} color={pickupStage === 0 ? '#BA1A1A' : S.teal} />
        <T style={{fontFamily: 'DMSansBold', fontSize: 13, flex: 1}}>{status}</T>
      </View>

      {order.status === 'Arrived' && <Card style={card}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', gap: 12}}>
          <View style={{flex: 1}}><Label>Last-mile autonomous transit</Label><Heading style={title}>Delivery Fee Settlement</Heading></View>
          <View><Heading style={{fontSize: 28, lineHeight: 36, color: '#A63B00'}}>{formatAmount(order.amount)}</Heading><T style={{fontSize: 10, color: S.muted}}>INR · Delivery fee</T></View>
        </View>
        <View style={{padding: 14, backgroundColor: S.blue, borderRadius: 10, flexDirection: 'row', gap: 10, alignItems: 'center'}}>
          <Icon name="wallet-outline" color="#A63B00" />
          <View style={{flex: 1}}><T style={{fontFamily: 'DMSansBold'}}>UPI QR</T><T style={{fontSize: 12, color: S.muted}}>{qa ? 'Offline sample' : 'Scan with a UPI app on another device'}</T></View>
          <Icon name="checkmark-circle-outline" color={S.teal} />
        </View>
        <View style={{padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center', opacity: .55}}>
          <Icon name="card-outline" color={S.muted} />
          <View style={{flex: 1}}><T style={{fontFamily: 'DMSansBold'}}>Debit / Campus Card</T><T style={{fontSize: 12, color: S.muted}}>Not available in this release</T></View>
        </View>
        {payment && !alreadyPaid && !needsReview && <View style={{gap: 12, alignItems: 'center'}}>
          <Label>{payment.provider === 'demo' ? 'Nonpayable demo QR' : 'Secure payment QR'}</Label>
          <View style={{padding: 16, backgroundColor: S.white}}>
            {payment.provider === 'demo' && payment.qr_payload && !/^upi:/i.test(payment.qr_payload)
              ? <QRCode value={payment.qr_payload} size={174} backgroundColor="#FFFFFF" color={S.ink} />
              : payment.qr_image_url && /^https:\/\//i.test(payment.qr_image_url)
                ? <Image source={{uri: payment.qr_image_url}} accessibilityLabel="Payment QR supplied by the payment provider" style={{width: 174, height: 174}} />
                : <Icon name="qr-code-outline" size={140} color={S.muted} />}
          </View>
          <T style={{fontSize: 12, lineHeight: 18, color: S.muted, textAlign: 'center'}}>
            {payment.provider === 'demo' ? 'This code is a demo reference. It cannot accept UPI payments.' : 'Wait for server verification after paying. Payment alone does not confirm the physical lid is open.'}
          </T>
          {payment.expires_at && <T style={{fontSize: 12}}>{expired ? 'QR expired. A new QR requires verification; contact support. Do not pay this QR.' : 'Valid until ' + formatTime(payment.expires_at)}</T>}
        </View>}
        <View style={{backgroundColor: '#FFDBCE', borderRadius: 10, padding: 14, gap: 6}}>
          <T style={{fontFamily: 'DMSansBold', fontSize: 13, color: '#7F2B00'}}>Automated Unlock</T>
          <T style={{fontSize: 12, lineHeight: 19, color: '#7F2B00'}}>Payment and your HostelXpress pickup OTP (OTP 2) must BOTH be verified before the assigned inner lid can be authorized.</T>
        </View>
        {expired && <T accessibilityRole="alert" style={{fontSize: 13, color: '#BA1A1A'}}>
          This QR has expired. Do not pay it. Contact support so the earlier payment attempt can be reconciled safely.
        </T>}
        {refunded && <T accessibilityRole="alert" style={{fontSize: 13, color: '#BA1A1A'}}>
          This payment was refunded. Do not pay again until HostelXpress support reviews your order.
        </T>}
        {paymentFailed && <T accessibilityRole="alert" style={{fontSize: 13, color: '#BA1A1A'}}>
          The payment attempt failed. Ask support to review the booking before paying again.
        </T>}
        {reconciling && <T accessibilityRole="alert" style={{fontSize: 13, color: '#BA1A1A'}}>
          The provider has not confirmed whether a payment QR was created. Do not retry a charge; contact support.
        </T>}
        {alreadyPaid && <T accessibilityRole="alert" style={{fontSize: 13, color: S.teal}}>
          Payment is verified. Waiting for the order and rover state to update. Do not pay again.
        </T>}
        <Button onPress={needsReview ? help : () => void preparePayment()} loading={busy}
          disabled={qa || alreadyPaid} icon={needsReview ? 'headset-outline' : 'flash-outline'} testID="payment-create"
          accessibilityLabel={needsReview ? 'Contact HostelXpress support' : alreadyPaid ? 'Payment already verified' : 'Show UPI payment QR'}>
          {refunded ? 'Refunded · Contact Support' : paymentFailed ? 'Failed · Contact Support'
            : reconciling ? 'QR status unclear · Contact Support'
            : expired ? 'QR expired · Contact Support'
            : alreadyPaid ? 'Payment verified' : 'Show ' + formatAmount(order.amount) + ' UPI QR'}
        </Button>
        {qa && <T style={{fontSize: 12, color: S.muted}}>Offline sample · Payments require the connected backend.</T>}
      </Card>}

      {order.status === 'Paid' && <Card style={{...card, backgroundColor: unlocked ? '#D3F3ED' : S.dark, alignItems: 'center', paddingVertical: 30}}>
        <View style={{height: 68, width: 68, borderRadius: 34, backgroundColor: unlocked ? '#2DA498' : S.orange, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name={unlocked ? 'lock-open-outline' : 'time-outline'} size={34} color="#FFFFFF" />
        </View>
        <Heading style={{...title, textAlign: 'center', color: unlocked ? S.teal : S.white}}>{unlocked ? 'Ready to Collect · Bay ' + order.compartment_id : 'Payment Confirmed · Pickup OTP Required'}</Heading>
        <T style={{fontSize: 13, lineHeight: 21, textAlign: 'center', color: unlocked ? S.teal : '#DAE2FD'}}>
          {unlocked ? 'Take your parcel and close the lid firmly. Wait for the rover to confirm closure.' : 'Generate OTP 2 below, then enter it on the rover display. Payment alone cannot open the compartment.'}
        </T>
        <Button variant="secondary" icon="headset-outline" onPress={help}>Get Help</Button>
      </Card>}

      {order.status === 'Paid' && !unlocked && <Card style={{...card, backgroundColor: S.pale}}>
        <Heading style={{fontSize: 18}}>HostelXpress pickup OTP · OTP 2</Heading>
        <T style={{fontSize: 12, lineHeight: 19}}>Enter this code on your assigned rover screen. Only a signed rover request and a verified ₹10 payment can authorize the correct compartment.</T>
        {session?.mode === 'real' && pickupOtp && Date.parse(pickupOtp.expires_at) > now &&
          <View style={{alignItems: 'center', padding: 14, gap: 6}}>
            <Heading style={{fontSize: 34, letterSpacing: 8}}>{pickupOtp.code}</Heading>
            <T style={{fontSize: 12}}>Bay {pickupOtp.compartment} · Valid until {formatTime(pickupOtp.expires_at)}</T>
          </View>}
        {session?.mode === 'real' && pickupOtp && Date.parse(pickupOtp.expires_at) <= now &&
          <T accessibilityRole="alert" style={{color: '#BA1A1A'}}>Pickup code expired. Contact support for reconciliation.</T>}
        {session?.mode === 'real' && !pickupOtp &&
          <Button onPress={() => void createPickupOtp()} loading={otpBusy} icon="shield-checkmark-outline"
            testID="pickup-otp2-create">Generate pickup OTP 2</Button>}
        {qa && <T style={{fontSize: 12}}>QA preview only · No real pickup code will be issued.</T>}
        {session?.mode === 'demo' && <T style={{fontSize: 12}}>This feature requires real authenticated delivery and captured payment.</T>}
      </Card>}

      <Card style={card}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10}}>
          <Icon name="file-tray-stacked-outline" size={21} />
          <T style={{fontFamily: 'DMSansBold', flex: 1, fontSize: 13}}>ROVER BAY MATRIX</T>
          <T style={{fontSize: 10, color: S.muted}}>Assigned bay only</T>
        </View>
        {[1, 2, 3].map(bay => <View key={bay} style={{padding: 12, backgroundColor: unlocked && bay === order.compartment_id ? '#D3F3ED' : S.pale,
          borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Icon name={unlocked && bay === order.compartment_id ? 'lock-open-outline' : 'lock-closed-outline'} size={18} color={S.muted} />
          <T style={{fontSize: 12, fontFamily: 'DMSansBold', flex: 1}}>BAY {bay} ({['TOP', 'CENTER', 'BOTTOM'][bay - 1]})</T>
          <T style={{fontSize: 10, color: S.muted}}>{bay !== order.compartment_id ? 'Private bay' : unlocked ? 'Ready to collect' : pickupStage === 3 ? 'Closure confirmed' : 'Pending release'}</T>
        </View>)}
      </Card>
      {order.status === 'Completed' && <Card style={{...card, alignItems: 'center', paddingVertical: 28}}>
        <Icon name="checkmark-circle" size={66} color={S.teal} />
        <Heading style={{...title, textAlign: 'center'}}>Delivery Complete · Compartment Latched</Heading>
        <T style={{fontSize: 13, color: S.muted}}>Parcel collected and physical closure confirmed.</T>
        <Button onPress={() => router.push('/')} icon="home-outline">Return to Home Dashboard</Button>
        <Button onPress={() => router.push('/deliveries')} variant="secondary">View delivery history</Button>
      </Card>}
      <Pressable accessibilityRole="link" accessibilityLabel="Get delivery help" onPress={help}
        style={{minHeight: 48, backgroundColor: S.blue, padding: 14, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center'}}>
        <Icon name="headset-outline" /><T style={{flex: 1, fontFamily: 'DMSansBold'}}>Get help with {shortId(order.id)}</T>
      </Pressable>
    </> : <>
      {order.status === 'Pending' && order.bot && <Card style={card}>
        <Heading style={{fontSize: 17}}>Courier OTP · OTP 1</Heading>
        <T style={{fontSize: 12, lineHeight: 19}}>If Amazon, Flipkart or your delivery company sends a code, enter it here. HostelXpress forwards it once to the assigned rover display for the delivery person. OTP 1 does not open a compartment.</T>
        {session?.mode === 'real' && <>
          <TextInput accessibilityLabel="Delivery-company OTP 1" value={courierCode} onChangeText={setCourierCode}
            placeholder="4–8 digit courier OTP" keyboardType="number-pad" secureTextEntry
            maxLength={8} autoComplete="off" style={{backgroundColor: S.pale, borderRadius: 9,
            padding: 14, minHeight: 48, fontSize: 16, color: S.ink}}/>
          <Button onPress={() => void sendCourierCode()} disabled={otpBusy || !/^[0-9]{4,8}$/.test(courierCode)}
            loading={otpBusy} icon="send-outline" testID="courier-otp1-send">Send OTP 1 to rover display</Button>
          {courierQueued && <T accessibilityRole="alert" style={{fontSize: 12, color: S.teal}}>
            Code queued for one-time rover display. This does not confirm courier verification or authorize a lid.
          </T>}
        </>}
        {qa && <T style={{fontSize: 12}}>Offline preview · No courier code is transmitted.</T>}
        {demo && <T style={{fontSize: 12}}>Courier relay requires a real assigned delivery.</T>}
      </Card>}
      <Card style={{...card, backgroundColor: S.dark, padding: 16, gap: 10}}>
        <View style={{backgroundColor: S.orange, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start'}}>
          <T style={{fontSize: 10, fontFamily: 'DMSansBold', color: S.white}}>{qa ? 'QA SAMPLE DELIVERY' : order.status === 'Transit' ? 'LIVE EN ROUTE' : status.toUpperCase()}</T>
        </View>
        <Heading style={{fontSize: 26, lineHeight: 33, color: '#EAF1FF', letterSpacing: -.6}}>
          {order.status === 'Transit' ? 'ROVER EN ROUTE TO ' + destination.toUpperCase() + ' HOSTEL' : STATUS_COPY[order.status].title}
        </Heading>
        <T style={{fontSize: 13, lineHeight: 20, color: '#DAE2FD'}}>→ Next: Meet rover at Hostel Porch upon arrival</T>
        {!qa && ['Pending', 'Loaded', 'Transit'].includes(order.status) &&
          <T style={{fontSize: 12, color: '#DAE2FD'}}>Payment opens when the rover arrives.</T>}
      </Card>
      <Card style={card}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Icon name="git-branch-outline" color="#A63B00" /><Heading style={title}>Campus route overview</Heading></View>
        <CampusMap status={order.status} hostel={order.destination_hostel_block}
          rover={order.bot && !stale ? 'ROVER ' + shortId(order.bot.id) : undefined} />
        {session?.mode === 'real' && <T style={{fontSize: 12, color: S.muted}}>
          {roverPosition
            ? 'Latest rover GPS fix ' + roverPosition.lat.toFixed(6) + ', ' + roverPosition.lng.toFixed(6)
            : 'A fresh rover GPS fix is unavailable.'}
        </T>}
      </Card>
      <Card style={card}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <Label>Estimated arrival</Label><T style={{fontSize: 11, color: S.muted}}>{stale ? 'Telemetry unavailable' : 'Telemetry received'}</T>
        </View>
        <Heading style={{fontSize: 28, lineHeight: 36, color: '#A63B00'}}>ETA unavailable</Heading>
        <T style={{fontSize: 12, color: S.muted}}>An arrival estimate will appear when supplied by the backend.</T>
      </Card>
      <Card style={{...card, backgroundColor: S.blue}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Icon name="hardware-chip-outline" color="#A63B00" /><Heading style={{fontSize: 17, lineHeight: 24}}>Rover Telemetry</Heading></View>
        <View style={{flexDirection: 'row', gap: 8}}>
          {[{label: 'IDENTITY', value: order.bot ? shortId(order.bot.id) : 'Awaiting'},
            {label: 'BATTERY', value: order.bot?.battery_level != null ? order.bot.battery_level + '%' : 'Unknown'},
            {label: 'SECURITY', value: order.compartment_id ? 'Bay ' + order.compartment_id : 'Unassigned'}].map(item =>
              <View key={item.label} style={{flex: 1, minWidth: 0, alignItems: 'center', gap: 5, backgroundColor: S.white, borderRadius: 8, padding: 9}}>
                <T style={{fontSize: 10, color: S.muted}}>{item.label}</T>
                <T style={{fontSize: 16, lineHeight: 23, fontFamily: 'DMSansBold', textAlign: 'center'}}>{item.value}</T>
              </View>)}
        </View>
        <T style={{fontSize: 11, color: S.muted}}>{qa ? 'Sample data · Offline QA Preview' : 'Last received ' + formatTime(order.bot?.last_seen_at)}</T>
      </Card>
      <Card style={card}>
        <Heading style={title}>Order Progress</Heading>
        {stageNames.map((name, index) => {
          const entry = order.timeline.find(event => event.status === stageStatuses[index]);
          const done = progress >= (index < 2 ? 1 : index);
          return <View key={name} style={{flexDirection: 'row', gap: 12, minHeight: 62}}>
            <View style={{width: 28, height: 28, borderRadius: 14, backgroundColor: done ? S.teal : S.blue, alignItems: 'center', justifyContent: 'center'}}>
              <Icon name={done ? 'checkmark' : 'ellipse-outline'} size={17} color={done ? S.white : S.muted} />
            </View>
            <View style={{flex: 1, minWidth: 0, gap: 4}}>
              <T style={{fontFamily: 'DMSansBold', fontSize: 14, lineHeight: 21}}>{name}</T>
              <T style={{fontSize: 12, color: S.muted}}>{entry ? formatTime(entry.at) : 'Upcoming'}</T>
            </View>
          </View>;
        })}
      </Card>
      <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap'}}>
        <Button icon="headset-outline" variant="secondary" onPress={help}>Need Assistance</Button>
        <Button icon="pause-circle-outline" variant="secondary" onPress={help}>Hold Bot · Get help</Button>
      </View>
      <T style={{fontSize: 11, color: S.muted}}>Remote hold is not available. Contact the operator for assistance.</T>
    </>}
    {demo && next && <Card style={{...card, backgroundColor: S.pale}}>
      <Label>Demo controls · Simulation only</Label>
      <Button variant="secondary" loading={busy} disabled={order.status === 'Arrived' && (!payment || expired)}
        onPress={() => void advanceDemo()} testID="demo-next-action">{next.label}</Button>
    </Card>}
    {order.status === 'Failed' && <ErrorNotice message={order.failure_reason || 'This delivery needs operator attention.'} retry={() => void refresh()} />}
  </View>;
}
