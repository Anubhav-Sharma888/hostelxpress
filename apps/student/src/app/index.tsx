import React, {useState} from 'react';
import {Pressable, ScrollView, View} from 'react-native';
import {router} from 'expo-router';
import {AUTH_MODE} from '../api';
import {BookModal} from '../components/BookModal';
import {COLORS as C, FLOW, formatAmount, formatDate, isActive, isStale, shortId, STATUS_COPY} from '../model';
import {useApp} from '../state';
import {useClock} from '../hooks/useClock';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, Loading, T} from '../ui';

export default function Overview() {
  const {user,session,orders,loading,error,refresh,updatedAt}=useApp();
  const [booking,setBooking]=useState(false); const [selectedHostel,setSelectedHostel]=useState(user?.hostel_block||'C');
  const now=useClock(); const active=orders.find(isActive); const recent=orders[0];
  const hostel=active?.destination_hostel_block||user?.hostel_block;
  const phase=active?FLOW.indexOf(active.status)+1:0;
  const fresh=active?.bot&&!isStale(active.bot.last_seen_at,now);
  const weekCount=orders.filter(order=>now-Date.parse(order.created_at)<7*24*60*60*1000).length;
  const openDelivery=()=>{if(active)router.push({pathname:'/order/[id]',params:{id:active.id}});};
  if(!session)return <Loading/>;
  return <View style={{gap:16}}>
    <View style={[common.between,{gap:8}]}>
      <View style={{flex:1,minWidth:0}}><Heading style={{fontSize:20,lineHeight:28,letterSpacing:-.2}}>Hey {user?.name.split(' ')[0]||'there'} 👋</Heading><T style={{fontSize:12,lineHeight:18,color:C.muted}}>{user?.hostel_block?'Hostel Block '+user.hostel_block:'Hostel not set'}</T></View>
      <View style={{backgroundColor:'#E5F0D0',borderRadius:20,paddingHorizontal:12,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:6,maxWidth:'54%'}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:C.lime}}/><T style={{fontFamily:'DMSansBold',fontSize:10,lineHeight:16,letterSpacing:.6,color:C.primary,flexShrink:1}}>{active?STATUS_COPY[active.status].label.toUpperCase():'READY TO BOOK'}</T></View>
    </View>
    {error&&<ErrorNotice message={error} retry={()=>void refresh()}/>}
    {session.mode==='real'&&user&&!user.hostel_block&&<Card style={{padding:16,gap:12,backgroundColor:C.pale}}><T style={{fontSize:12}}>Add your hostel block so deliveries reach the right place.</T><Button small variant="secondary" icon="create-outline" onPress={()=>router.push('/profile?edit=1')} testID="profile-complete-cta">Complete your profile</Button></Card>}
    {loading&&!updatedAt?<Loading/>:<>
      <View style={{padding:16,borderRadius:12,backgroundColor:C.dark,gap:16,shadowColor:'#141B2B',shadowOffset:{width:0,height:8},shadowOpacity:.15,shadowRadius:12,elevation:4}}>
        <View style={[common.between,{gap:8}]}>
          <View style={{flexDirection:'row',alignItems:'center',gap:8,flexShrink:1}}><View style={{paddingHorizontal:8,paddingVertical:2,borderRadius:20,backgroundColor:'#535B6C'}}><Label style={{color:'#ACF847',fontSize:10,lineHeight:16,letterSpacing:1.2}}>{active?(AUTH_MODE==='demo'?'Demo dispatch':'Live dispatch'):'No active delivery'}</Label></View>{active&&<T style={{fontSize:10,lineHeight:14,color:'#C4C1FB',flexShrink:1}}>{shortId(active.id)}</T>}</View>
          <View style={{flexDirection:'row',gap:4,alignItems:'center',backgroundColor:'#505C63',borderRadius:20,paddingHorizontal:10,paddingVertical:4}}><Icon name="timer-outline" color='#ACF847' size={16}/><T style={{fontFamily:'ManropeBold',fontSize:11,lineHeight:17,color:'#ACF847'}}>Unavailable</T></View>
        </View>
        <View style={{gap:4}}>
          <View style={{flexDirection:'row',gap:4,alignItems:'flex-start'}}><Icon name="radio-button-off-outline" color='#ACF847' size={18}/><View style={{flex:1,minWidth:0}}><Label style={{color:'#C4C1FB',fontSize:10,lineHeight:14,letterSpacing:.4}}>Pickup point</Label><T style={{fontFamily:'DMSansBold',fontSize:14,lineHeight:22,color:'#EDF0FF'}}>Gate 2 Main Security Post</T></View></View>
          <View style={{height:16,width:2,backgroundColor:'#547333',marginLeft:8}}/>
          <View style={{flexDirection:'row',gap:4,alignItems:'flex-start'}}><Icon name="location-outline" color={C.orange} size={18}/><View style={{flex:1,minWidth:0}}><Label style={{color:'#C4C1FB',fontSize:10,lineHeight:14,letterSpacing:.4}}>Destination drop</Label><T style={{fontFamily:'DMSansBold',fontSize:14,lineHeight:22,color:'#EDF0FF'}}>{hostel?'Hostel Block '+hostel:'Choose your hostel'}</T></View></View>
        </View>
        <View style={{gap:6,paddingTop:4}}>
          <View style={common.between}><T style={{fontSize:10,lineHeight:14,color:'#C4C1FB'}}>Gate 2</T><T style={{fontSize:10,lineHeight:14,color:'#ACF847'}}>{active?'● Stage '+phase+' of 5':'No active delivery'}</T><T style={{fontSize:10,lineHeight:14,color:'#C4C1FB'}}>{hostel?'Hostel '+hostel:'Your hostel'}</T></View>
          <View style={{height:10,backgroundColor:'#596173',borderRadius:10,position:'relative'}}><View style={{width:active?`${phase*20}%`:'0%',height:10,backgroundColor:C.lime,borderRadius:10}}/><View style={{position:'absolute',left:active?`${Math.min(phase*20,96)}%`:'0%',top:-10,marginLeft:active?-14:0,width:28,height:28,borderRadius:14,borderWidth:2,borderColor:C.dark,backgroundColor:C.lime,alignItems:'center',justifyContent:'center'}}><Icon name="hardware-chip-outline" color={C.onLime} size={16}/></View></View>
        </View>
        <View style={{backgroundColor:'#4B5365',borderRadius:8,paddingHorizontal:8,paddingVertical:4,flexDirection:'row',gap:8,alignItems:'center'}}><Icon name="navigate-outline" color={C.lime} size={18}/><T numberOfLines={1} style={{fontSize:12,lineHeight:18,color:'#E3DFFF',flex:1}}>{active?(AUTH_MODE==='demo'?'Demo delivery · Simulated status updates':fresh?'Delivery status updated by your rover':'Telemetry unavailable · Open delivery details'):'Reserve a compartment to start your delivery'}</T></View>
        {active?<Button icon="locate-outline" accessibilityLabel="Open active delivery" onPress={openDelivery} prominent>Track Delivery →</Button>:<Button icon="add-circle-outline" onPress={()=>setBooking(true)} prominent>Book a Delivery →</Button>}
      </View>
      <View style={{flexDirection:'row',gap:4}}>{[
        {icon:'cube-outline' as const,value:String(weekCount),title:'Parcels this week'},
        {icon:'wallet-outline' as const,value:'₹10',title:'Student flat fare'},
        {icon:'speedometer-outline' as const,value:'—',title:'Avg trip stretch'},
      ].map(item=><Card key={item.title} style={{flex:1,padding:12,gap:4,minWidth:0,borderRadius:12}}><View style={{width:28,height:28,borderRadius:8,backgroundColor:C.mint,alignItems:'center',justifyContent:'center',marginBottom:4}}><Icon name={item.icon} color={C.primary} size={18}/></View><T style={{fontFamily:'JakartaExtraBold',fontSize:28,lineHeight:32,letterSpacing:-.6}}>{item.value}</T><T style={{fontSize:10,lineHeight:14,color:C.muted}}>{item.title}</T></Card>)}</View>
      <Card style={{padding:16,gap:0,borderRadius:12}}>
        <View style={[common.between,{alignItems:'flex-start',gap:8}]}><View style={{flex:1,gap:2}}><Label style={{color:C.primary,fontSize:10,lineHeight:16,letterSpacing:1.2}}>Autonomous dispatch</Label><Heading style={{fontSize:20,lineHeight:28,marginTop:2}}>Book a Delivery</Heading><T style={{fontSize:12,lineHeight:18,color:C.muted}}>Gate 2 Security <T style={{color:C.primary}}>→</T> Your Hostel Doorstep</T></View><View style={{width:56,height:56,borderRadius:16,backgroundColor:C.mint,alignItems:'center',justifyContent:'center'}}><Icon name="flash-outline" size={36} color={C.lime}/></View></View>
        <View style={{marginTop:8,paddingTop:4,gap:6}}><Label style={{fontSize:10,lineHeight:14,letterSpacing:.4,color:C.muted}}>Quick select block</Label><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:6,paddingBottom:4}}>{['A','B','C','D','E','F','G'].map(block=><Pressable key={block} accessibilityRole="button" accessibilityLabel={'Select hostel '+block} accessibilityState={{selected:selectedHostel===block}} onPress={()=>setSelectedHostel(block)} style={{minHeight:48,paddingHorizontal:12,paddingVertical:6,borderRadius:8,borderWidth:1,borderColor:selectedHostel===block?C.lime:'transparent',backgroundColor:selectedHostel===block?C.dark:'#DCE2F7',alignItems:'center',justifyContent:'center'}}><T style={{fontFamily:'DMSansBold',fontSize:12,lineHeight:18,color:selectedHostel===block?'#EDF0FF':C.ink}}>Hostel {block}</T></Pressable>)}</ScrollView></View>
        <View style={{marginTop:16}}><Button icon="add-circle-outline" variant="dark" onPress={()=>setBooking(true)} testID="booking-open" accessibilityLabel="Book a delivery">Book New Delivery (₹10)</Button></View>
      </Card>
      <Card style={{padding:16,borderRadius:12,gap:8}}>
        <View style={common.between}><Pressable accessibilityRole="link" accessibilityLabel="View all deliveries" onPress={()=>router.push('/deliveries')} style={{minHeight:28,justifyContent:'center'}}><Heading style={{fontSize:20,lineHeight:28}}>Recent Delivery</Heading></Pressable><View style={{paddingHorizontal:8,paddingVertical:2,borderRadius:20,backgroundColor:'#DCE2F7'}}><Label style={{fontSize:10,lineHeight:16,color:C.muted,letterSpacing:1.1}}>{recent?STATUS_COPY[recent.status].label:'No deliveries'}</Label></View></View>
        {recent?<Pressable accessibilityRole="button" accessibilityLabel={'View delivery '+shortId(recent.id)} onPress={()=>router.push({pathname:'/order/[id]',params:{id:recent.id}})} style={{padding:4,borderRadius:8,backgroundColor:C.pale,flexDirection:'row',alignItems:'center',gap:8,minHeight:48}}><View style={{height:40,width:40,borderRadius:8,backgroundColor:'#DCE2F7',alignItems:'center',justifyContent:'center'}}><Icon name={recent.status==='Completed'?'checkmark-circle-outline':'cube-outline'} color={C.primary} size={22}/></View><View style={{flex:1,minWidth:0}}><T numberOfLines={1} style={{fontFamily:'DMSansBold',fontSize:14,lineHeight:22}}>{recent.parcel_label||'Campus delivery'}</T><T numberOfLines={1} style={{fontSize:12,lineHeight:18,color:C.muted}}>{formatDate(recent.created_at)} · Hostel {recent.destination_hostel_block}</T></View><T style={{fontFamily:'DMSansBold',fontSize:14,lineHeight:22,color:C.muted,paddingRight:4}}>{formatAmount(recent.amount)}</T></Pressable>:<View style={{padding:8,borderRadius:8,backgroundColor:C.pale,flexDirection:'row',gap:8,alignItems:'center',minHeight:48}}><Icon name="cube-outline" color={C.primary} size={22}/><T style={{fontSize:12,color:C.muted,flex:1}}>Your first delivery starts here.</T></View>}
      </Card>
      <Pressable accessibilityRole="button" accessibilityLabel="Open After Hours" testID="afterhours-open" onPress={()=>router.push('/afterhours' as never)} style={{borderRadius:12,backgroundColor:C.mint,padding:8,flexDirection:'row',alignItems:'center',gap:12,minHeight:56}}><View style={{width:32,height:32,borderRadius:16,backgroundColor:'#D9E8BF',alignItems:'center',justifyContent:'center'}}><Icon name="shield-checkmark-outline" color={C.primary} size={18}/></View><View style={{flex:1,minWidth:0}}><Label style={{fontSize:10,lineHeight:14,color:C.primary,letterSpacing:.8}}>Campus logistics advisory</Label><T style={{fontSize:12,lineHeight:18}}>Open After Hours for late-night food delivery →</T></View></Pressable>
    </>}
    {booking&&<BookModal initialHostel={selectedHostel} onClose={()=>setBooking(false)}/>}
  </View>;
}
