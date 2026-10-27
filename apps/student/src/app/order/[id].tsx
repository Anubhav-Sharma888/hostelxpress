import React, {useState} from 'react';
import {Image, Pressable, useWindowDimensions, View} from 'react-native';
import {router, useLocalSearchParams} from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {Payment, request} from '../../api';
import {CampusMap} from '../../components/CampusMap';
import {Timeline} from '../../components/Timeline';
import {COLORS as C, formatAmount, formatTime, isStale, nextDemoAction, shortId, STATUS_COPY} from '../../model';
import {useApp} from '../../state';
import {useClock} from '../../hooks/useClock';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, Loading, PageTitle, Pill, StatusPill, T} from '../../ui';

export default function DeliveryDetail() {
  const {id}=useLocalSearchParams<{id:string}>();
  const {session}=useApp();
  return <DetailContent key={id+':'+(session?.access_token||'signed-out')}/>;
}
function DetailContent() {
  const {id}=useLocalSearchParams<{id:string}>(); const {width}=useWindowDimensions(); const wide=width>=1230;
  const {orders,loading,session,advance,refresh}=useApp(); const order=orders.find(item=>item.id===id);
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const [payment,setPayment]=useState<Payment|null>(null); const [paymentBusy,setPaymentBusy]=useState(false);
  const now=useClock();
  if(!order) return loading?<Loading/>:<View style={{gap:15}}><PageTitle eyebrow="Delivery" title="Delivery unavailable." description="It may belong to another session, or could not be loaded."/><Button variant="secondary" onPress={()=>router.replace('/deliveries')}>Back to my deliveries</Button></View>;
  const demo=session?.mode==='demo';
  const next=nextDemoAction(order.status); const stale=isStale(order.bot?.last_seen_at,now);
  const confirmedUnlock=order.status==='Paid'&&order.bot?.status==='UNLOCKED'&&!stale;
  const copy=confirmedUnlock?{...STATUS_COPY.Paid,title:'Your compartment is ready.',description:'The bot has acknowledged the unlock. Collect your parcel, then close the lid securely.'}:STATUS_COPY[order.status];
  const expired=payment?.expires_at?Date.parse(payment.expires_at)<now:false;
  async function nextStep() {
    if(!next||busy||!order)return;setBusy(true);setError(null);
    try{await advance(order.id,next.action);}catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function preparePayment() {
    if(!session||!order||paymentBusy)return;setPaymentBusy(true);setError(null);
    try{const result=await request<Payment>('/v1/orders/'+encodeURIComponent(order.id)+'/payment',session.access_token,{method:'POST'});setPayment(result);}
    catch(err){setError((err as Error).message);}finally{setPaymentBusy(false);}
  }
  const paymentPanel = <>
        {(order.status==='Arrived'||order.status==='Paid'||order.status==='Completed')&&<Card style={{gap:19,backgroundColor:order.status==='Completed'?'#EDF3E8':C.white}}>
          <View style={[common.between,{alignItems:'flex-start'}]}><View style={[common.row,{flex:1,minWidth:0,alignItems:'flex-start'}]}><View style={{height:34,width:34,borderRadius:10,backgroundColor:C.peach,alignItems:'center',justifyContent:'center'}}><Icon name={order.status==='Completed'?'checkmark-circle-outline':'wallet-outline'} size={20}/></View><View style={{flex:1,minWidth:0}}><Heading style={{fontSize:20,lineHeight:29,letterSpacing:-.5}}>{order.status==='Arrived'?'Arrived. Almost yours.':order.status==='Completed'?'Collected with care.':'Payment confirmed.'}</Heading><T style={{fontSize:11,color:C.muted}}>{order.status==='Arrived'?'One small fee for the last stretch.':order.status==='Completed'?'Parcel collected and compartment closed.':confirmedUnlock?(demo?'Unlock acknowledged by the demo bot.':'Unlock acknowledged by the bot.'):'Waiting for an acknowledged unlock.'}</T></View></View><T style={{fontFamily:'ManropeBold',fontSize:28,lineHeight:36}}>{formatAmount(order.amount)}</T></View>
          {order.status==='Arrived'&&<>
            <View style={{height:1,backgroundColor:C.line}}/>
            {!payment?<View style={{alignItems:'center',padding:12,gap:14}}><Icon name="qr-code-outline" size={50} color="#A6B59D"/><T style={{fontSize:12,color:C.muted,textAlign:'center'}}>Your payment preview is created securely by the server.</T><Button onPress={()=>void preparePayment()} loading={paymentBusy} icon="qr-code-outline" testID="payment-create">Prepare payment preview</Button></View>:
              <View style={{alignItems:'center',gap:14}}>
                <Pill tone="orange">{payment.provider==='demo'?'NONPAYABLE DEMO QR':'SECURE PAYMENT QR'}</Pill>
                <View style={{padding:18,backgroundColor:C.white,borderRadius:17,borderWidth:1,borderColor:C.line}}>
                  {payment.provider==='demo'&&payment.qr_payload&&!/^upi:/i.test(payment.qr_payload)?<QRCode value={payment.qr_payload} size={155} color={C.dark} backgroundColor="#FFFFFF"/>:payment.qr_image_url&&/^https:\/\//i.test(payment.qr_image_url)?<Image accessibilityLabel="Payment QR supplied by the payment provider" source={{uri:payment.qr_image_url}} style={{width:155,height:155}}/>:<Icon name="qr-code-outline" size={130} color="#B8C1AF"/>}
                </View>
                <T style={{fontSize:11,lineHeight:18,textAlign:'center',color:C.muted,maxWidth:340}}>{payment.provider==='demo'?'This code is a demo reference. It cannot accept UPI payments. Use the simulation below to test confirmation.':'Scan with a supported UPI app. The server must verify payment before sending an unlock request.'}</T>
                {payment.expires_at&&<T style={{fontSize:10,color:expired?C.danger:C.muted}}>{expired?'This preview expired. Request a new one.':'Valid until '+formatTime(payment.expires_at)}</T>}
                {expired&&<Button small variant="secondary" onPress={()=>void preparePayment()} loading={paymentBusy}>Refresh payment preview</Button>}
              </View>}
          </>}
          {order.status==='Paid'&&<View style={{padding:17,borderRadius:12,backgroundColor:C.pale,gap:7}}><T style={{fontFamily:'DMSansBold',fontSize:13}}>Compartment {order.compartment_id||'—'}</T><T style={{fontSize:11,color:C.muted,lineHeight:19}}>{confirmedUnlock?'Collect your parcel only when the physical lid opens. Close it after collection so the delivery can complete.':'Payment is recorded. Keep the compartment closed while the backend waits for a fresh, acknowledged unlock.'}</T></View>}
        </Card>}
  </>;
  return <View>
    <Pressable accessibilityRole="link" accessibilityLabel="Back to deliveries" onPress={()=>router.push('/deliveries')} style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:19}}><Icon name="arrow-back-outline" size={14}/><T style={{fontSize:11,color:C.muted}}>My deliveries</T></Pressable>
    <PageTitle eyebrow={shortId(order.id)} title={copy.title} description={copy.description} action={<StatusPill status={order.status}/>}/>
    {error&&<View style={{marginBottom:18}}><ErrorNotice message={error}/></View>}
    <View style={{flexDirection:wide?'row':'column',gap:22}}>
      <View style={{flex:wide?1.95:undefined,gap:20,minWidth:0}}>
        {!wide&&paymentPanel}
        <Card style={{gap:20}}>
          <View style={common.between}><View style={common.row}><Icon name="navigate-outline" size={18}/><T style={{fontFamily:'DMSansBold',fontSize:13}}>The last stretch</T></View><Pill tone={stale?'orange':'green'} icon={stale?'time-outline':'radio-outline'}>{stale?'Telemetry stale':demo?'Demo telemetry fresh':'Telemetry fresh'}</Pill></View>
          <CampusMap status={order.status} hostel={order.destination_hostel_block}/>
          <View style={{flexDirection:'row',gap:12,flexWrap:'wrap'}}>
            <View style={{flex:1,minWidth:120}}><Label>From</Label><T style={{fontFamily:'DMSansBold',marginTop:4}}>Gate 2</T><T style={{fontSize:10,color:C.muted}}>Campus pickup point</T></View>
            <View style={{flex:1,minWidth:120}}><Label>To</Label><T style={{fontFamily:'DMSansBold',marginTop:4}}>Hostel {order.destination_hostel_block}</T><T style={{fontSize:10,color:C.muted}}>{demo?'Demo destination':'Campus destination'}</T></View>
            <View style={{flex:1,minWidth:120}}><Label>Bot signal</Label><T style={{fontFamily:'DMSansBold',marginTop:4}}>{order.bot?.battery_level!=null?order.bot.battery_level+'% battery':'Awaiting bot'}</T><T style={{fontSize:10,color:C.muted}}>Last received {formatTime(order.bot?.last_seen_at)}</T></View>
          </View>
          {stale&&order.bot&&<T style={{color:'#9D693D',fontSize:10,lineHeight:17}}>The last bot update is over 15 seconds old or unavailable. Location and physical lid state are not confirmed.</T>}
        </Card>
        {demo&&next&&<Card style={{gap:14,borderStyle:'dashed',borderColor:'#B7C5AF',backgroundColor:'#F1F4EB',padding:20}}>
          <View style={common.row}><Icon name="flask-outline" size={18}/><Label>Demo controls</Label><Pill tone="neutral">Simulation only</Pill></View>
          <T style={{fontSize:11,lineHeight:18,color:C.muted}}>Move this delivery forward using server-processed events. No physical bot moves, no lid opens, and no money is charged.</T>
          {order.status==='Loaded'&&<T style={{fontSize:10,color:C.muted}}>Dispatch advances the demo clock to the loading deadline. The server still checks capacity and dispatch rules.</T>}
          <Button small variant="secondary" icon="play-outline" loading={busy} disabled={order.status==='Arrived'&&(!payment||expired)} onPress={()=>void nextStep()} testID="demo-next-action">{next.label}</Button>
          {order.status==='Arrived'&&!payment&&<T style={{fontSize:10,color:C.muted}}>Prepare the payment preview before simulating confirmation.</T>}
        </Card>}
        {order.status==='Completed'&&<Button variant="secondary" onPress={()=>router.push('/deliveries')} icon="arrow-forward-outline">View delivery history</Button>}
        {order.status==='Failed'&&<ErrorNotice message={order.failure_reason||'This delivery needs operator attention.'} retry={()=>void refresh()}/>}
      </View>
      <View style={{flex:wide?1:undefined,gap:20,minWidth:wide?260:undefined}}>
        {wide&&paymentPanel}
        <Card style={{gap:18}}><View style={common.between}><Heading style={{fontSize:18,lineHeight:27,letterSpacing:-.4}}>Your parcel</Heading><Icon name="bag-handle-outline"/></View><T style={{fontFamily:'DMSansBold',fontSize:15}}>{order.parcel_label||'Campus delivery'}</T><View style={{height:1,backgroundColor:C.line}}/>{[{k:'Order',v:shortId(order.id)},{k:'Destination',v:'Hostel '+order.destination_hostel_block},{k:'Compartment',v:order.compartment_id?'0'+order.compartment_id:'Awaiting assignment'},{k:'Payment',v:order.payment_status==='Captured'?'Confirmed':order.payment_status||'Not yet requested'}].map(item=><View key={item.k} style={common.between}><T style={{fontSize:11,color:C.muted}}>{item.k}</T><T style={{fontSize:11,fontFamily:'DMSansMedium'}}>{item.v}</T></View>)}</Card>
        <Card style={{gap:20}}><Heading style={{fontSize:18,lineHeight:27,letterSpacing:-.4}}>The journey so far</Heading><Timeline order={order}/></Card>
        <Pressable accessibilityRole="link" accessibilityLabel="Get delivery help" onPress={()=>router.push('/help')} style={{padding:18,borderRadius:12,backgroundColor:'#E9EDE1',flexDirection:'row',alignItems:'center',gap:12}}><Icon name="chatbubble-ellipses-outline" size={20}/><View style={{flex:1}}><T style={{fontFamily:'DMSansBold',fontSize:12}}>A little help?</T><T style={{fontSize:10,color:C.muted}}>We’ve got the next steps.</T></View><Icon name="arrow-forward-outline" size={16}/></Pressable>
      </View>
    </View>
  </View>;
}
