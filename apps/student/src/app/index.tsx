import React, {ComponentProps, useState} from 'react';
import {Image, Pressable, View} from 'react-native';
import {router} from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {BookModal} from '../components/BookModal';
import {hostelName} from '../campus';
import {COLORS as C, FLOW, formatAmount, isActive, shortId, STATUS_COPY} from '../model';
import {useApp} from '../state';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, Loading, T} from '../ui';

export default function Overview() {
  const {user,session,orders,loading,error,refresh,updatedAt} = useApp();
  const [booking,setBooking] = useState(false);
  const [preview,setPreview] = useState<'idle'|'active'|null>(null);
  const active = orders.find(isActive);
  const showActive = !!active && preview !== 'idle';
  const sampleMode = session?.mode === 'qa-preview' || session?.mode === 'demo';
  const openDelivery = () => {
    if (active) router.push({pathname:'/order/[id]',params:{id:active.id}});
  };
  if (!session) return <Loading/>;
  const services: {title:string; subtitle:string; icon:ComponentProps<typeof MaterialCommunityIcons>['name']; action:()=>void; testID?:string}[] = [
    {title:'Night Delivery Window',subtitle:'After Hours food delivery',icon:'moon-waning-crescent',action:()=>router.push('/afterhours' as never),testID:'afterhours-open'},
    {title:'Campus Dropoff Rules',subtitle:'Cargo guidance, payment & collection',icon:'clipboard-list-outline',action:()=>router.push('/help')},
    {title:'Past Deliveries & Invoices',subtitle:'View '+orders.filter(order=>!isActive(order)).length+' previous dispatches',icon:'receipt-text-outline',action:()=>router.push('/deliveries')},
  ];
  return <View style={{gap:16}}>
    {sampleMode && <View style={{gap:6}}>
      <View style={{flexDirection:'row',padding:4,borderRadius:28,backgroundColor:C.lavender}}>
        {(['idle','active'] as const).map(state=><Pressable key={state} accessibilityRole="button"
          accessibilityState={{selected:(preview || (active?'active':'idle'))===state}}
          onPress={()=>setPreview(state)} style={{flex:1,minHeight:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:(preview || (active?'active':'idle'))===state?C.white:'transparent'}}>
          <T style={{fontFamily:'DMSansBold',fontSize:12,color:(preview || (active?'active':'idle'))===state?C.primary:C.muted}}>{state==='idle'?'◷ Idle State':'● Active Delivery'}</T>
        </Pressable>)}
      </View>
      <T style={{fontSize:10,lineHeight:15,color:C.muted}}>QA preview · Sample orders only. Payments and rover movement are simulated.</T>
    </View>}
    {error && <ErrorNotice message={error} retry={()=>void refresh()}/>}
    {session.mode==='real' && user && !user.hostel_block && <Card style={{padding:16,gap:10}}>
      <T>Add your hostel to make booking easier.</T>
      <Button small variant="secondary" onPress={()=>router.push('/profile?edit=1')} testID="profile-complete-cta">Complete your profile</Button>
    </Card>}
    {loading && !updatedAt ? <Loading/> : <>
      {showActive && active ? <>
        <Card style={{padding:20,gap:14}}>
          <View style={common.between}><Label style={{color:C.primary}}>Active delivery</Label><T style={{fontSize:11,color:C.muted}}>{shortId(active.id)}</T></View>
          <Heading style={{fontSize:24,lineHeight:31}}>On the way to {hostelName(active.destination_hostel_block)}</Heading>
          <T style={{color:C.muted,fontSize:12}}>{STATUS_COPY[active.status].description}</T>
          <View style={{height:8,borderRadius:8,backgroundColor:C.pale,overflow:'hidden'}}>
            <View style={{height:8,borderRadius:8,backgroundColor:C.orange,width:`${Math.max(1,FLOW.indexOf(active.status)+1)/FLOW.length*100}%`}}/>
          </View>
          <View style={{flexDirection:'row',padding:12,borderRadius:10,backgroundColor:C.pale}}>
            {[{title:'Bay Locker',value:active.compartment_id?'Assigned #'+active.compartment_id:'Awaiting assignment'},
              {title:'Fare',value:formatAmount(active.amount)+(active.payment_status==='paid'?' Paid':' Due')},
              {title:'Bot ID',value:active.bot?.id.slice(0,8)||'Awaiting rover'}].map(item=><View key={item.title} style={{flex:1,alignItems:'center',gap:4}}>
              <T style={{fontSize:10,color:C.muted}}>{item.title}</T><T style={{fontSize:12,fontFamily:'DMSansBold',textAlign:'center'}}>{item.value}</T>
            </View>)}
          </View>
          <Button icon="arrow-forward-outline" prominent onPress={openDelivery} accessibilityLabel="Open active delivery">Track Delivery</Button>
        </Card>
        <Card style={{padding:16,gap:10}}>
          <Heading style={{fontSize:16,lineHeight:23}}>Rover Pod Hatch</Heading>
          {[1,2,3].map(bay=><View key={bay} style={{padding:14,borderRadius:10,backgroundColor:active.compartment_id===bay?C.peach:C.pale,flexDirection:'row',alignItems:'center',gap:10}}>
            <Icon name={active.compartment_id===bay?'radio-button-on-outline':'lock-closed-outline'} color={active.compartment_id===bay?C.primary:C.muted}/>
            <T style={{flex:1,fontSize:12,fontFamily:'DMSansBold'}}>Bay {bay} ({['Upper','Center','Lower'][bay-1]} Hatch)</T>
            <T style={{fontSize:10,color:C.muted}}>{active.compartment_id===bay?'Your parcel':'Status unavailable'}</T>
          </View>)}
        </Card>
        <Button variant="secondary" onPress={()=>setBooking(true)} testID="booking-open" accessibilityLabel="Book a delivery">Book Another Delivery (₹10)</Button>
      </> : <Card style={{padding:24,gap:16,borderRadius:14}}>
        <View style={[common.between,{gap:6}]}>
          <View style={{backgroundColor:'#2DA498',borderRadius:20,paddingHorizontal:10,paddingVertical:4,flexDirection:'row',gap:5,alignItems:'center'}}>
            <Icon name="flash-outline" color="#00332E" size={14}/><Label style={{fontSize:9,letterSpacing:.4,color:'#00332E'}}>Autonomous Dispatch</Label>
          </View>
          <T style={{fontSize:11,fontFamily:'DMSansBold',color:C.teal}}>◷ ETA on dispatch</T>
        </View>
        <View style={{gap:4}}>
          <Heading style={{fontFamily:'JakartaExtraBold',fontSize:28,lineHeight:35,letterSpacing:-.7}}>Gate 2 <T style={{fontSize:28,color:C.orange}}>→</T> Your Hostel Room</Heading>
          <T style={{fontSize:14,lineHeight:21,color:C.muted}}>Food parcel, heavy laundry, or courier package waiting at main security? Let our autonomous campus rover bring it straight to your dormitory porch.</T>
        </View>
        <View style={{height:144,borderRadius:12,overflow:'hidden',backgroundColor:C.pale}}>
          <Image source={require('../../assets/stitch-nov17/hostelxpress_home_active_orders-1.jpg')} style={{width:'100%',height:'100%'}} resizeMode="cover" accessibilityLabel="Campus delivery rover illustration"/>
          <View style={{position:'absolute',bottom:0,left:0,right:0,padding:10,backgroundColor:'#213145B8',flexDirection:'row',justifyContent:'space-between',gap:4}}>
            <T style={{fontFamily:'DMSansBold',fontSize:11,color:C.white}}>▣ Campus Rover Network</T>
            <T style={{fontSize:10,color:C.white}}>Locker Protected</T>
          </View>
        </View>
        <Button icon="flash-outline" prominent onPress={()=>setBooking(true)} testID="booking-open" accessibilityLabel="Book a delivery">Book a Delivery (₹10)</Button>
      </Card>}
      {preview==='active' && !active && <T style={{color:C.muted,fontSize:12}}>No active sample delivery. Book one to preview the delivery flow.</T>}
      <Card style={{padding:16,backgroundColor:C.lavender,flexDirection:'row',gap:10}}>
        <Icon name="git-network-outline" color={C.ink}/>
        <View style={{flex:1,gap:5}}>
          <Heading style={{fontSize:16,lineHeight:23,letterSpacing:-.3}}>Autonomous 3-Compartment Network</Heading>
          <T style={{fontSize:12,lineHeight:19,color:C.muted}}>Routes between Gate 2 Security Booth and all 7 Campus Hostels: Kaveri, Krishna, Godavari, Brahmaputra, Ganga, Yamuna &amp; Narmada.</T>
        </View>
      </Card>
      <Heading style={{fontSize:18,lineHeight:24,letterSpacing:-.3}}>Campus Services &amp; Rules</Heading>
      <View style={{gap:8}}>
        {services.map((service,index)=><Pressable key={service.title} accessibilityRole="button" accessibilityLabel={service.title} onPress={service.action} testID={service.testID}
          style={{backgroundColor:C.white,borderRadius:14,padding:16,flexDirection:'row',gap:10,alignItems:'center',minHeight:80}}>
          <View style={{width:48,height:48,borderRadius:12,backgroundColor:index===0?'#D3EDE9':C.lavender,alignItems:'center',justifyContent:'center'}}>
            <MaterialCommunityIcons name={service.icon} color={index===0?C.teal:C.primary} size={24}/>
          </View>
          <View style={{flex:1}}><T style={{fontFamily:'DMSansBold',fontSize:16,lineHeight:22}}>{service.title}</T><T style={{fontSize:12,lineHeight:18,color:C.muted}}>{service.subtitle}</T></View>
          <Icon name="chevron-forward-outline" color={C.muted} size={18}/>
        </Pressable>)}
      </View>
      <View style={{padding:16,borderRadius:14,backgroundColor:C.pale,flexDirection:'row',gap:10,alignItems:'center'}}>
        <Icon name="bulb-outline" color={C.primary} size={24}/>
        <T style={{fontSize:12,lineHeight:18,color:C.muted,flex:1}}>Ordering food via Swiggy or Zomato? Set your drop address as &quot;Gate 2 HostelXpress Desk&quot; and request rover pickup.</T>
      </View>
    </>}
    {booking && <BookModal initialHostel={user?.hostel_block||'A'} onClose={()=>setBooking(false)}/>}
  </View>;
}
