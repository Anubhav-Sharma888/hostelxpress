import React, {useState} from 'react';
import {Pressable, View} from 'react-native';
import {AUTH_MODE} from '../api';
import {COLORS as C} from '../model';
import {Card, Heading, Icon, Label, PageTitle, T} from '../ui';
const items: {q: string; a: string; aReal?: string}[] = [
  {q:'How does a delivery work?',a:'Book a compartment before the rider reaches Gate 2. The rider has a five-minute reservation window to load. The bot departs when all three compartments are loaded or the separate loading timer expires. Arrival, payment, and confirmed collection appear in your delivery timeline.'},
  {q:'When do I pay the ₹10 fee?',a:'Pay only after the parcel arrives. In the current demo the QR is nonpayable, and the explicitly labelled simulation records a test payment. A live delivery must use a verified Razorpay payment before the backend requests an unlock.',aReal:'Pay only after the parcel arrives. Your payment is verified through Razorpay before the backend requests an unlock.'},
  {q:'Payment is confirmed, but the lid hasn’t opened.',a:'Keep the compartment closed. Payment confirmation and physical unlock are separate events. Wait for a fresh device acknowledgement. If the lid does not open, contact the authorized campus operator; this demo has no real support number configured.',aReal:'Keep the compartment closed. Payment confirmation and physical unlock are separate events. Wait for a fresh device acknowledgement. If the lid does not open, contact the authorized campus operator.'},
  {q:'Why does tracking say “stale”?',a:'The app marks device telemetry stale after 15 seconds without an update. It keeps the last received information visible and does not invent a current location or ETA. The campus diagram is illustrative, not a map of a real route.'},
  {q:'What if my rider does not arrive?',a:'The server cancels a still-pending reservation after five minutes. Once a parcel is loaded, a separate loading deadline controls dispatch. Closing and re-opening the app does not reset either server timer.'},
  {q:'What happens to security footage?',a:'The intended device contract keeps a rolling buffer until the handover outcome is known. Successful payment plus confirmed lid closure permits deletion. A forced lid, payment failure, collision, or stuck bot preserves the last two minutes for authorized incident handling. Camera/storage integration is outside this application demo.',aReal:'The intended device contract keeps a rolling buffer until the handover outcome is known. Successful payment plus confirmed lid closure permits deletion. A forced lid, payment failure, collision, or stuck bot preserves the last two minutes for authorized incident handling. Camera/storage integration sits outside the student application.'},
];
export default function Help() {
  const [open,setOpen]=useState<number|null>(0);
  return <View><PageTitle eyebrow="A little help along the way" title="Good questions. Clear answers." description="A few things to make your next delivery easier."/>
    <View style={{maxWidth:850,gap:14}}>
      {items.map((item,i)=><Card key={item.q} style={{padding:21}}><Pressable accessibilityRole="button" accessibilityState={{expanded:open===i}} aria-expanded={open===i} accessibilityLabel={item.q} onPress={()=>setOpen(open===i?null:i)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:15,minHeight:44}}><T style={{fontFamily:'DMSansBold',fontSize:13,flex:1}}>{item.q}</T><Icon name={open===i?'remove-outline':'add-outline'} size={18}/></Pressable>{open===i&&<T style={{color:C.muted,fontSize:12,lineHeight:21,marginTop:15}}>{AUTH_MODE==='real'&&item.aReal?item.aReal:item.a}</T>}</Card>)}
      <View style={{backgroundColor:'#E7EDDD',padding:25,borderRadius:15,marginTop:8,gap:8}}><Label>Campus support</Label><Heading style={{fontSize:22,lineHeight:30,letterSpacing:-.6}}>A real person, when you need one.</Heading><T style={{fontSize:12,lineHeight:20,color:C.forest}}>The campus operator’s verified contact will appear here before launch.{AUTH_MODE==='demo'?' This demo does not connect to a live support desk.':''}</T></View>
    </View>
  </View>;
}
