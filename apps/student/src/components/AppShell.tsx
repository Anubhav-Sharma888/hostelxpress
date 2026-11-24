import React, {ComponentProps, useEffect, useRef} from 'react';
import {Pressable, ScrollView, useWindowDimensions, View} from 'react-native';
import {router, Slot, usePathname} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {COLORS as C, isActive} from '../model';
import {useApp} from '../state';
import {Icon, T} from '../ui';

const links: {path:'/'|'/deliveries'|'/help';label:string;icon:ComponentProps<typeof MaterialCommunityIcons>['name']}[] = [
  {path:'/',label:'Deliveries',icon:'truck-delivery-outline'},
  {path:'/deliveries',label:'Active Orders',icon:'access-point'},
  {path:'/help',label:'Help & History',icon:'history'},
];
export function Wordmark({light=false,small=false,subtitle='Gate 2 Campus Hub'}:{light?:boolean;small?:boolean;subtitle?:string}) {
  return <View style={{flexDirection:'row',alignItems:'center',gap:8,flexShrink:1}}>
    <View style={{width:small?32:40,height:small?32:40,borderRadius:10,backgroundColor:C.orange,alignItems:'center',justifyContent:'center'}}>
      <Icon name="cube-outline" color={C.white} size={small?21:26}/>
    </View>
    <View style={{flexShrink:1}}>
      <T style={{fontFamily:'ManropeBold',fontSize:small?15:21,lineHeight:24,letterSpacing:-.6,color:light?C.white:C.ink}}>HostelXpress{small?' Deliveries':''}</T>
      <View style={{backgroundColor:C.lavender,borderRadius:12,paddingHorizontal:8,paddingVertical:1,alignSelf:'flex-start'}}>
        <T style={{fontFamily:'DMSansBold',fontSize:9,lineHeight:15,color:C.muted}}>⌖ {subtitle}</T>
      </View>
    </View>
  </View>;
}
export function AppShell() {
  const {width} = useWindowDimensions();
  const desktop = width>=1000;
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {scrollRef.current?.scrollTo({y: 0, animated: false});}, [path]);
  const {session,user,signOut,orders} = useApp();
  useEffect(()=>{
    if (!session && path!=='/sign-in') router.replace('/sign-in');
    if (session && path==='/sign-in') router.replace('/');
  },[session,path]);
  if (path==='/sign-in' || !session) return <Slot/>;
  const segments = path.split('/').filter(Boolean);
  const shownOrder = segments[0]==='order' && segments[1] ? orders.find(item=>item.id===decodeURIComponent(segments[1])) : undefined;
  const handover = !!shownOrder && ['Arrived','Paid','Completed'].includes(shownOrder.status);
  const orderTitle = session.mode==='real' && shownOrder?.is_demo ? 'Test booking' : handover ? 'Locker Pin Pickup' : 'Rover Live Tracking';
  const historyOrder = !!shownOrder && !isActive(shownOrder);
  const selected = (target:string) => {
    if (target==='/deliveries') return path==='/deliveries'||(segments[0]==='order'&&!historyOrder);
    if (target==='/help') return path==='/help'||path==='/history'||historyOrder;
    return path==='/';
  };
  function navigate(target:typeof links[number]['path']) {
    if (target==='/deliveries') {
      const order=orders.find(isActive);
      if (order) router.push({pathname:'/order/[id]',params:{id:order.id}});
      else router.push({pathname:'/deliveries',params:{view:'active'}});
    } else router.push(target);
  }
  return <View style={{flex:1,backgroundColor:C.canvas}}>
    <View style={{minHeight:64+insets.top,paddingTop:insets.top,paddingHorizontal:16,backgroundColor:C.canvas,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4,borderBottomWidth:1,borderBottomColor:'#EEF0F8'}}>
      {segments[0]==='order' ? <View style={{flexDirection:'row',alignItems:'center',gap:2,flexShrink:1}}>
        <Pressable accessibilityRole="button" accessibilityLabel={historyOrder?'Back to delivery history':'Back to active orders'} onPress={()=>router.push(historyOrder?'/history':{pathname:'/deliveries',params:{view:'active'}})}
          style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center',marginLeft:-10}}>
          <Icon name="arrow-back-outline" size={23} color={C.ink}/>
        </Pressable>
        <T style={{fontFamily:'ManropeBold',fontSize:19,lineHeight:26,letterSpacing:-.5,color:C.ink}}>{orderTitle}</T>
      </View> : <Wordmark small={!desktop}/>}
      {desktop && <View style={{flexDirection:'row',gap:12}}>{links.map(item=><Pressable key={item.path} accessibilityRole="link" onPress={()=>navigate(item.path)} style={{minHeight:48,justifyContent:'center',paddingHorizontal:16}}><T style={{fontFamily:'DMSansBold',color:selected(item.path)?C.primary:C.muted}}>{item.label}</T></Pressable>)}</View>}
      <View style={{flexDirection:'row',alignItems:'center'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications and alerts" onPress={()=>router.push('/deliveries')} style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}}><Icon name="notifications-outline" color={C.muted} size={23}/></Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Open my profile" onPress={()=>router.push('/profile')} style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}}>
          <View style={{width:28,height:28,borderRadius:14,backgroundColor:C.primary,alignItems:'center',justifyContent:'center'}}><T style={{color:C.white,fontSize:12,fontFamily:'DMSansBold'}}>{user?.name.slice(0,1).toUpperCase()||'S'}</T></View>
        </Pressable>
      </View>
    </View>
    <ScrollView ref={scrollRef} style={{flex:1}} contentContainerStyle={{paddingHorizontal:16,paddingTop:16,paddingBottom:24,alignItems:'center'}} keyboardShouldPersistTaps="handled">
      <View style={{width:'100%',maxWidth:desktop?920:680}}><Slot/></View>
      {desktop && <View style={{width:'100%',maxWidth:920,marginTop:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><T style={{fontSize:11,color:C.muted}}>HostelXpress · Campus delivery</T><Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={signOut} style={{minHeight:48,justifyContent:'center',paddingHorizontal:12}}><T style={{fontSize:12}}>Sign out</T></Pressable></View>}
    </ScrollView>
    {!desktop && <View style={{flexDirection:'row',paddingBottom:insets.bottom,minHeight:64+insets.bottom,backgroundColor:C.canvas,borderTopWidth:1,borderTopColor:'#EEF0F8'}}>
      {links.map(item=><Pressable key={item.path} accessibilityRole="link" accessibilityLabel={item.label} accessibilityState={{selected:selected(item.path)}} onPress={()=>navigate(item.path)}
        style={{flex:1,minHeight:64,alignItems:'center',justifyContent:'center',gap:5}}>
        <MaterialCommunityIcons name={item.icon} color={selected(item.path)?C.primary:C.muted} size={23}/>
        <T style={{fontSize:11,lineHeight:16,color:selected(item.path)?C.primary:C.muted,fontFamily:'DMSansBold'}}>{item.label}</T>
      </Pressable>)}
    </View>}
  </View>;
}
