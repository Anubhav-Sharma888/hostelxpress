import React, {useState} from 'react';
import {Pressable, useWindowDimensions, View} from 'react-native';
import {router} from 'expo-router';
import {AUTH_MODE} from '../api';
import {BookModal} from '../components/BookModal';
import {CampusMap} from '../components/CampusMap';
import {OrderCard} from '../components/OrderCard';
import {COLORS as C, isActive, isStale, STATUS_COPY} from '../model';
import {useApp} from '../state';
import {useClock} from '../hooks/useClock';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, Loading, PageTitle, Pill, T} from '../ui';
export default function Overview() {
  const {width}=useWindowDimensions(); const wide=width>=1250;
  const {user,session,orders,loading,error,refresh,updatedAt}=useApp(); const [booking,setBooking]=useState(false);
  const now=useClock();
  const active=orders.find(isActive); const completed=orders.filter(order=>order.status==='Completed');
  if(!session)return <Loading/>;
  return <View>
    <PageTitle eyebrow="Your campus, connected" title={'Good day, '+(user?.name.split(' ')[0]||'there')+'.'} description="Less waiting at the gate. More time for you." action={<Button icon="add-outline" variant="orange" onPress={()=>setBooking(true)} testID="booking-open">Book a delivery</Button>}/>
    {error&&<View style={{marginBottom:20}}><ErrorNotice message={error} retry={()=>void refresh()}/></View>}
    {session.mode==='real'&&user&&!user.hostel_block&&<View style={{marginBottom:20}}><Card style={{flexDirection:'row',alignItems:'center',gap:12,padding:16,flexWrap:'wrap'}}><Icon name="person-circle-outline" size={20}/><T style={{fontSize:12,flex:1,minWidth:200}}>Your hostel block is not set yet. Add it so deliveries reach the right place.</T><Button small variant="secondary" icon="create-outline" onPress={()=>router.push('/profile?edit=1')} testID="profile-complete-cta">Complete your profile</Button></Card></View>}
    {loading&&!updatedAt?<Loading/>:<>
      <View style={{flexDirection:wide?'row':'column',gap:21}}>
        <Card style={{flex:wide?2.08:undefined,padding:22,gap:19,minWidth:0}}>
          <View style={common.between}><View style={{flexDirection:'row',gap:7,alignItems:'center'}}><View style={{height:6,width:6,borderRadius:3,backgroundColor:active?C.orange:'#98AC8B'}}/><Label>{active?'Your active delivery':'Ready when you are'}</Label></View><Pill tone="neutral" icon="radio-outline">{active&&active.bot&&!isStale(active.bot.last_seen_at,now)?(AUTH_MODE==='demo'?'Demo updates':'Live updates'):(AUTH_MODE==='demo'?'Demo workspace':'Your workspace')}</Pill></View>
          <View style={{maxWidth:470}}><Heading style={{fontSize:26,lineHeight:34,letterSpacing:-1}}>{active?STATUS_COPY[active.status].title:'The last stretch, sorted.'}</Heading><T style={{marginTop:7,color:C.muted,fontSize:12,lineHeight:20}}>{active?STATUS_COPY[active.status].description:'From Gate 2 to your hostel. Reserve a secure compartment and let your parcel come to you.'}</T></View>
          <CampusMap status={active?.status} hostel={active?.destination_hostel_block||user?.hostel_block||'C'}/>
          <View style={[common.between,{flexWrap:'wrap',gap:9}]}>
            <View style={{flexDirection:'row',alignItems:'center',gap:9}}><Icon name="location-outline" size={17}/><T style={{fontSize:11,fontFamily:'DMSansMedium'}}>Gate 2</T><Icon name="arrow-forward-outline" size={13} color="#93A08D"/><T style={{fontSize:11,fontFamily:'DMSansMedium'}}>Hostel {active?.destination_hostel_block||user?.hostel_block||'—'}</T></View>
            {active?<Pressable accessibilityRole="button" accessibilityLabel="Open active delivery" onPress={()=>router.push({pathname:'/order/[id]',params:{id:active.id}})} style={{flexDirection:'row',gap:6,alignItems:'center'}}><T style={{fontFamily:'DMSansBold',fontSize:11,color:C.forest}}>View delivery</T><Icon name="arrow-forward-outline" size={14}/></Pressable>:<T style={{fontSize:10,color:C.muted}}>No active delivery yet</T>}
          </View>
        </Card>
        <View style={{flex:wide?1:undefined,gap:18,minWidth:wide?260:undefined}}>
          {active?<OrderCard order={active}/>:<Card style={{gap:19,backgroundColor:C.forest,borderColor:C.forest,padding:25}}>
            <View style={{width:46,height:46,borderRadius:13,backgroundColor:'#32634B',alignItems:'center',justifyContent:'center'}}><Icon name="bag-handle-outline" color="#E2EDCF" size={24}/></View>
            <Heading style={{fontSize:25,lineHeight:33,color:'#F3F6E9',letterSpacing:-.8}}>Your next delivery,{'\n'}a little easier.</Heading><T style={{color:'#B7CBB8',fontSize:12,lineHeight:20}}>Food, essentials, or that thing you forgot. Reserve a spot for the last stretch.</T>
            <Button onPress={()=>setBooking(true)} variant="orange" icon="arrow-forward-outline">Reserve a compartment</Button>
            <View style={{borderTopWidth:1,borderTopColor:'#3E6B52',paddingTop:16}}><T style={{fontSize:11,color:'#CFDEC5'}}>Flat ₹10 · Pay after arrival</T></View>
          </Card>}
          <Card style={{padding:18,backgroundColor:'#F0F2E7',gap:10}}>
            <View style={common.row}><View style={{height:31,width:31,borderRadius:10,backgroundColor:'#E0E7D2',alignItems:'center',justifyContent:'center'}}><Icon name="shield-checkmark-outline" size={17}/></View><T style={{fontFamily:'DMSansBold',fontSize:12}}>Your parcel. Your compartment.</T></View>
            <T style={{fontSize:11,lineHeight:18,color:C.muted}}>Separate lids for loading and collection. Only verified payment authorizes the inner lid.</T>
          </Card>
        </View>
      </View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:16,marginTop:23}}>
        {[{icon:'wallet-outline' as const,value:'₹10',title:'One simple delivery fee',note:'Pay when your parcel arrives',background:C.peach},{icon:'lock-closed-outline' as const,value:'3',title:'Secure compartments',note:active?.compartment_id?'You’re assigned compartment '+active.compartment_id:'A dedicated space for every parcel',background:'#E5EBD9'},{icon:'checkmark-circle-outline' as const,value:String(completed.length).padStart(2,'0'),title:'Your completed deliveries',note:'A little more time back in your day',background:'#E8EDE4'}].map(item=><Card key={item.title} style={{flex:1,minWidth:230,padding:19}}>
          <View style={common.between}><View style={{width:34,height:34,borderRadius:10,backgroundColor:item.background,alignItems:'center',justifyContent:'center'}}><Icon name={item.icon} size={18}/></View><T style={{fontFamily:'ManropeBold',fontSize:28,lineHeight:35,letterSpacing:-1}}>{item.value}</T></View><T style={{fontFamily:'DMSansBold',fontSize:11,marginTop:13}}>{item.title}</T><T style={{fontSize:10,color:C.muted,marginTop:3}}>{item.note}</T>
        </Card>)}
      </View>
      <Card style={{marginTop:23,padding:23}}>
        <View style={common.between}><View><Heading style={{fontSize:18,lineHeight:26,letterSpacing:-.5}}>Recent deliveries</Heading><T style={{fontSize:11,color:C.muted,marginTop:3}}>The little journeys that make your day.</T></View><Pressable accessibilityRole="link" accessibilityLabel="View all deliveries" onPress={()=>router.push('/deliveries')}><T style={{fontSize:11,fontFamily:'DMSansBold',color:C.forest}}>View all →</T></Pressable></View>
        {orders.length?orders.slice(0,3).map(order=><OrderCard key={order.id} order={order} compact/>):<View style={{paddingVertical:28,alignItems:'center',gap:9}}><Icon name="cube-outline" size={27} color="#A5B399"/><T style={{fontSize:12,color:C.muted}}>Your first delivery starts here.</T><T style={{fontSize:10,color:'#687268'}}>Book a delivery to see its journey in this space.</T></View>}
      </Card>
    </>}
    {booking&&<BookModal onClose={()=>setBooking(false)}/>}
  </View>;
}
