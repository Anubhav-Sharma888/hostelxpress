import React, {useState} from 'react';
import {Image, Pressable, useWindowDimensions, View} from 'react-native';
import {router, useLocalSearchParams} from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {Payment, request} from '../../api';
import {CampusMap} from '../../components/CampusMap';
import {Timeline} from '../../components/Timeline';
import {COLORS as C, FLOW, formatAmount, formatTime, isStale, nextDemoAction, shortId, STATUS_COPY} from '../../model';
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
  const stage=FLOW.indexOf(order.status)+1;
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
  const pickupStage = order.status==='Completed' ? 3 : confirmedUnlock ? 2 : order.status==='Paid' ? 1 : 0;
  const handover = ['Arrived','Paid','Completed'].includes(order.status);
  const paymentPanel = <>
        {handover&&<Card style={{padding:14,borderRadius:12,backgroundColor:C.lavender,gap:10}}>
          <View style={common.between}><Label style={{color:C.ink}}>Pickup sequence</Label><Pill tone="neutral">{'Stage '+(pickupStage+1)+' of 4'}</Pill></View>
          <View style={{flexDirection:'row',gap:6}}>
            {(['Payment','Unlock','Collect','Complete'] as const).map((label,index)=>
              <View key={label} style={{flex:1,minWidth:0,alignItems:'center',gap:6}}>
                <View style={{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:index<=pickupStage?C.lime:'#DCE2F7'}}>
                  <Icon name={index<pickupStage||pickupStage===3?'checkmark':(['card-outline','key-outline','cube-outline','checkmark-done-outline'] as const)[index]} size={17} color={C.ink}/>
                </View>
                <T style={{fontSize:10,lineHeight:15,textAlign:'center',fontFamily:index===pickupStage?'DMSansBold':'DMSans'}}>{label}</T>
              </View>)}
          </View>
          <View style={{height:5,borderRadius:3,backgroundColor:'#DCE2F7'}}><View style={{width:`${(pickupStage+1)*25}%`,height:5,borderRadius:3,backgroundColor:C.lime}}/></View>
        </Card>}
        {order.status==='Paid'&&<Card style={{padding:20,gap:16,alignItems:confirmedUnlock?'flex-start':'center',
          backgroundColor:confirmedUnlock?C.lime:C.dark,borderColor:confirmedUnlock?C.lime:C.dark}}>
          <View style={{width:68,height:68,borderRadius:34,backgroundColor:confirmedUnlock?'#FFFFFFCC':C.lime,alignItems:'center',justifyContent:'center'}}>
            <Icon name={confirmedUnlock?'lock-open-outline':'key-outline'} size={33} color={C.ink}/>
          </View>
          <Heading style={{fontSize:23,lineHeight:30,textAlign:confirmedUnlock?'left':'center',color:confirmedUnlock?C.ink:'#EDF0FF'}}>
            {confirmedUnlock?'Ready to collect':'Waiting for compartment unlock…'}
          </Heading>
          <T style={{fontSize:13,lineHeight:21,color:confirmedUnlock?C.ink:'#D8D4FF',textAlign:confirmedUnlock?'left':'center'}}>
            {confirmedUnlock?'Collect only after your physical lid opens.':'Payment confirmed. Waiting for acknowledgement from the rover.'}
          </T>
        </Card>}
        {confirmedUnlock&&<Card style={{padding:16,gap:14}}>
          <Heading style={{fontSize:18,lineHeight:26}}>Rover Bay Orientation</Heading>
          <View style={{flexDirection:'row',gap:8}}>
            {[1,2,3].map(bay=><View key={bay} style={{flex:1,minWidth:0,padding:8,gap:8,alignItems:'center',borderRadius:9,
              backgroundColor:order.compartment_id===bay?C.dark:C.lavender}}>
              <T style={{fontFamily:'DMSansBold',fontSize:11,color:order.compartment_id===bay?'#BEF264':C.muted}}>BAY {String(bay).padStart(2,'0')}</T>
              <Icon name={order.compartment_id===bay?'cube-outline':'lock-closed-outline'} size={24} color={order.compartment_id===bay?C.lime:C.muted}/>
            </View>)}
          </View>
          <View style={{flexDirection:'row',gap:12,alignItems:'center'}}>
            <Image source={require('../../../assets/stitch/pickup-parcel.jpg')} accessibilityLabel="Illustration of a parcel in a rover bay" style={{width:58,height:58,borderRadius:10}}/>
            <View style={{flex:1,minWidth:0}}><Label>Consignment item</Label><T style={{fontFamily:'DMSansBold'}}>{order.parcel_label||shortId(order.id)}</T></View>
          </View>
          <View style={{backgroundColor:C.lavender,padding:12,borderRadius:8,gap:5}}>
            <T style={{fontFamily:'DMSansBold'}}>Physical Closure Notice</T>
            <T style={{fontSize:12,lineHeight:18}}>Close the compartment after collecting. The delivery completes after the rover confirms closure.</T>
          </View>
        </Card>}
        {order.status==='Completed'&&<View style={{alignItems:'center',gap:12}}>
          <View style={{width:74,height:74,borderRadius:37,backgroundColor:C.lime,alignItems:'center',justifyContent:'center'}}><Icon name="checkmark-done-circle-outline" size={44} color={C.ink}/></View>
          <Heading style={{fontSize:24,lineHeight:32,textAlign:'center'}}>Delivery Complete &amp; Compartment Secured!</Heading>
          <T style={{fontSize:13,lineHeight:20,textAlign:'center',color:C.muted}}>The parcel was collected and the compartment closed.</T>
          <Image source={require('../../../assets/stitch/pickup-campus.jpg')} accessibilityLabel="Illustration of the rover after delivery" style={{height:135,width:'100%',borderRadius:12}}/>
          <Button icon="home-outline" onPress={()=>router.push('/')}>Back to Campus Home</Button>
        </View>}

        {(order.status==='Arrived'||order.status==='Paid'||order.status==='Completed')&&<Card style={{gap:19,backgroundColor:order.status==='Completed'?C.lavender:C.white}}>
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
          {order.status==='Arrived'&&<View style={{padding:16,borderRadius:12,backgroundColor:C.lavender,gap:8}}>
            <Label>Compartment control</Label>
            <View style={common.row}><Icon name="lock-closed-outline"/><T style={{flex:1,fontFamily:'DMSansBold'}}>Compartment latch locked</T></View>
            <T style={{fontSize:12,color:C.muted}}>The rover can release the latch after the server verifies payment.</T>
          </View>}
          {order.status==='Paid'&&<View style={{padding:17,borderRadius:12,backgroundColor:C.pale,gap:7}}><T style={{fontFamily:'DMSansBold',fontSize:13}}>Compartment {order.compartment_id||'—'}</T><T style={{fontSize:11,color:C.muted,lineHeight:19}}>{confirmedUnlock?'Collect your parcel only when the physical lid opens. Close it after collection so the delivery can complete.':'Payment is recorded. Keep the compartment closed while the backend waits for a fresh, acknowledged unlock.'}</T></View>}
        </Card>}
  </>;
  return <View>
    <Pressable accessibilityRole="link" accessibilityLabel="Back to deliveries" onPress={()=>router.push('/deliveries')} style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:19,minHeight:48,minWidth:48}}><Icon name="arrow-back-outline" size={14}/><T style={{fontSize:11,color:C.muted}}>My deliveries</T></Pressable>
    <PageTitle eyebrow={shortId(order.id)} title={copy.title} description={copy.description} action={confirmedUnlock?<Pill>Ready to collect</Pill>:order.status==='Arrived'?<Pill tone="orange">Arrived · Awaiting payment</Pill>:<StatusPill status={order.status}/>}/>
    <Card style={{marginBottom: 16, backgroundColor: C.dark, borderColor: C.dark, padding: 22, gap: 18}}>
      <View style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
        <View style={{width: 48, height: 48, borderRadius: 13, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center'}}><Icon name={order.status === 'Completed' ? 'checkmark-circle-outline' : 'cube-outline'} size={25} color={C.onLime}/></View>
        <View style={{flex: 1, gap: 4}}><Label style={{color: '#D8D4FF'}}>ACTIVE MISSION</Label><T style={{fontFamily: 'ManropeBold', fontSize: 20, lineHeight: 28, color: '#FFFFFF'}}>{order.parcel_label || 'Campus delivery'}</T></View>
      </View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 16}}>
        <View style={{flex: 1, minWidth: 110, gap: 5}}><Label style={{color: '#D8D4FF'}}>PICKUP POINT</Label><T style={{fontFamily: 'DMSansBold', color: '#FFFFFF'}}>Gate 2</T></View>
        <View style={{flex: 1, minWidth: 110, gap: 5}}><Label style={{color: '#D8D4FF'}}>DESTINATION</Label><T style={{fontFamily: 'DMSansBold', color: '#FFFFFF'}}>Hostel {order.destination_hostel_block}</T></View>
        <View style={{gap: 5}}><Label style={{color: '#D8D4FF'}}>DELIVERY FEE</Label><T style={{fontFamily: 'ManropeBold', fontSize: 23, lineHeight: 30, color: '#BEF264'}}>{formatAmount(order.amount)}</T></View>
      </View>
    </Card>
    {error&&<View style={{marginBottom:18}}><ErrorNotice message={error}/></View>}
    <View style={{flexDirection:wide?'row-reverse':'column',gap:22}}>

      <View style={{flex:wide?1.95:undefined,gap:20,minWidth:0}}>
        {!wide&&paymentPanel}
        {!wide&&<View style={{padding:12,borderRadius:24,backgroundColor:'#E1E8FD',flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <Label style={{color:C.ink}}>● {stale?'Telemetry unavailable':demo?'Demo telemetry':'Telemetry received'}</Label>
          <T style={{fontSize:11,color:C.muted}}>{order.bot?.last_seen_at?'Last update '+formatTime(order.bot.last_seen_at):'Awaiting bot update'}</T>
        </View>}
        {!wide&&<Card style={[common.between,{padding:16,borderRadius:12}]}>
          <View style={{flex:1,minWidth:0,gap:4}}><Label style={{color:'#9D4300'}}>Autonomous dispatch</Label>
            <Heading style={{fontSize:26,lineHeight:34}}>{STATUS_COPY[order.status].label}</Heading>
            <T style={{fontSize:12,color:C.muted}}>Hostel Delivery Zone {order.destination_hostel_block}</T>
          </View>
          <View style={{padding:13,borderRadius:12,backgroundColor:'#E1E8FD',gap:5,alignItems:'center'}}>
            <Icon name="hardware-chip-outline" size={28} color={C.primary}/>
            <Label style={{color:C.ink}}>ROVER</Label>
          </View>
        </Card>}
        <CampusMap status={order.status} hostel={order.destination_hostel_block}/>
        {stale&&order.bot&&<T style={{color:'#92400E',fontSize:12,lineHeight:19}}>The bot update is stale. Location and physical lid state are unconfirmed.</T>}
        {!wide&&<Card style={[common.row,{alignItems:'flex-start',backgroundColor:'#E6F0D8',padding:16,borderRadius:12}]}>
          <View style={{width:38,height:38,borderRadius:19,backgroundColor:C.lime,alignItems:'center',justifyContent:'center'}}><Icon name="notifications-outline" size={23}/></View>
          <View style={{flex:1,gap:5}}><T style={{fontFamily:'DMSansBold'}}>Student Pickup Advisory</T>
            <T style={{fontSize:12,lineHeight:18}}>Meet the rover at your hostel pickup point after arrival. Wait for the compartment to unlock before collecting.</T>
          </View>
        </Card>}
        {demo&&next&&<Card style={{gap:14,borderStyle:'dashed',borderColor:'#C7C3FE',backgroundColor:C.lavender,padding:20}}>
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
        {wide&&<Card style={{padding:20,gap:14}}>
          <Label>Estimated arrival</Label>
          <Heading style={{fontSize:31,lineHeight:40,color:C.primary}}>{order.status==='Transit'?'In transit':STATUS_COPY[order.status].label}</Heading>
          <View style={{padding:14,borderRadius:10,backgroundColor:C.lavender,gap:10}}>
            <T style={{fontFamily:'DMSansBold'}}>Gate 2 Main Security Post</T>
            <T style={{fontFamily:'DMSansBold'}}>→ Hostel Block {order.destination_hostel_block}</T>
          </View>
        </Card>}
        <Card style={{gap:20}}><View style={[common.between,{flexWrap:'wrap'}]}>
          <Heading style={{fontSize:20,lineHeight:28}}>Transit Timeline</Heading>
          {stage>0&&<Pill tone="neutral">{'Step '+stage+' of '+FLOW.length}</Pill>}
        </View><Timeline order={order}/></Card>
        <Card style={{gap:18}}><View style={common.between}><Heading style={{fontSize:18,lineHeight:27,letterSpacing:-.4}}>Your parcel</Heading><Icon name="bag-handle-outline"/></View><T style={{fontFamily:'DMSansBold',fontSize:15}}>{order.parcel_label||'Campus delivery'}</T><View style={{height:1,backgroundColor:C.line}}/>{[{k:'Order',v:shortId(order.id)},{k:'Destination',v:'Hostel '+order.destination_hostel_block},{k:'Compartment',v:order.compartment_id?'0'+order.compartment_id:'Awaiting assignment'},{k:'Payment',v:order.payment_status==='Captured'?'Confirmed':order.payment_status==='Failed'?'Failed — you can try again':order.payment_status||'Not yet requested'}].map(item=><View key={item.k} style={common.between}><T style={{fontSize:11,color:C.muted}}>{item.k}</T><T style={{fontSize:11,fontFamily:'DMSansMedium'}}>{item.v}</T></View>)}</Card>
        <Pressable accessibilityRole="link" accessibilityLabel="Get delivery help" onPress={()=>router.push('/help')} style={{padding:18,borderRadius:12,backgroundColor:C.lavender,flexDirection:'row',alignItems:'center',gap:12}}><Icon name="chatbubble-ellipses-outline" size={20}/><View style={{flex:1}}><T style={{fontFamily:'DMSansBold',fontSize:12}}>{'Get help with order '+shortId(order.id)}</T><T style={{fontSize:10,color:C.muted}}>We’ve got the next steps.</T></View><Icon name="arrow-forward-outline" size={16}/></Pressable>
      </View>
    </View>
  </View>;
}
