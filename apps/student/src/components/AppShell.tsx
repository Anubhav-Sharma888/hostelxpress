import React, {useEffect} from 'react';
import {Pressable, ScrollView, useWindowDimensions, View} from 'react-native';
import {router, Slot, usePathname} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AUTH_MODE} from '../api';
import {COLORS as C, isActive} from '../model';
import {useApp} from '../state';
import {Icon, IconName, T} from '../ui';

const links: {path: '/'|'/deliveries'|'/tracking'|'/profile'|'/help'; label: string; title: string; icon: IconName}[] = [
  {path:'/',label:'Overview',title:'Home',icon:'hardware-chip-outline'},
  {path:'/deliveries',label:'My deliveries',title:'Deliveries History',icon:'car-outline'},
  {path:'/tracking',label:'Open active delivery',title:'Live Tracking',icon:'compass-outline'},
  {path:'/help',label:'Help & support',title:'Support & Help',icon:'help-circle-outline'},
  {path:'/profile',label:'My profile',title:'Profile',icon:'person-circle-outline'},
];
export function Wordmark({light = false, small = false, subtitle = 'CAMPUS ROVER GRID'}: {light?: boolean; small?: boolean; subtitle?: string}) {
  return <View style={{flexDirection:'row',alignItems:'center',gap:9,flexShrink:1,minWidth:0}}>
    <View style={{width:small?34:40,height:small?34:40,borderRadius:10,backgroundColor:light?C.lime:C.dark,alignItems:'center',justifyContent:'center'}}><Icon name="hardware-chip-outline" color={light?C.onLime:C.lime} size={small?22:26}/></View>
    <View style={{flexShrink:1,minWidth:0}}><T style={{fontFamily:'ManropeBold',fontSize:small?20:21,lineHeight:27,letterSpacing:-.8,color:light?'#EDF0FF':C.ink}}>Hostel<T style={{fontFamily:'ManropeBold',color:light?'#EDF0FF':C.primary}}>Xpress</T></T><T style={{fontFamily:'DMSansMedium',fontSize:8,lineHeight:12,letterSpacing:1.1,color:light?'#C4C1FB':C.muted}}>{subtitle}</T></View>
  </View>;
}
export function AppShell() {
  const {width} = useWindowDimensions(); const desktop = width >= 1000;
  const insets = useSafeAreaInsets(); const path = usePathname();
  const {session,user,signOut,orders} = useApp();
  useEffect(() => {
    if (!session && path !== '/sign-in') router.replace('/sign-in');
    if (session && path === '/sign-in') router.replace('/');
  },[session,path]);
  if (path === '/sign-in' || !session) return <Slot/>;
  const active = (item: typeof links[number]) => item.path === '/' ? path==='/' : item.path==='/tracking' ? path.startsWith('/order') : item.path==='/deliveries' ? path.startsWith('/deliveries') : path.startsWith(item.path);
  const navigate = (item: typeof links[number]) => {
    if(item.path==='/tracking'){const order=orders.find(isActive); if(order)router.push({pathname:'/order/[id]',params:{id:order.id}});else router.push('/deliveries');}
    else router.push(item.path);
  };
  const section = links.find(active)?.title || 'Campus delivery';
  return <View style={{flex:1,backgroundColor:C.canvas}}>
    <View style={{height:desktop?72:64+insets.top,paddingTop:desktop?0:insets.top,paddingHorizontal:desktop?32:20,borderBottomWidth:1,borderBottomColor:desktop?C.line:'#42495C',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,backgroundColor:desktop?C.canvas:C.dark}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:18,flexShrink:1}}><Wordmark small={!desktop} light={!desktop} subtitle={desktop?'CAMPUS ROVER GRID':section==='Live Tracking'?'TRACKING':section.toUpperCase()}/>{desktop&&width>=1250&&<View style={{backgroundColor:C.lavender,borderRadius:20,paddingHorizontal:10,paddingVertical:5}}><T style={{fontFamily:'DMSansBold',fontSize:9,lineHeight:15,color:C.primary,letterSpacing:.7}}>{AUTH_MODE==='demo'?'DEMO WORKSPACE':'STUDENT WORKSPACE'}</T></View>}</View>
      {desktop&&<View style={{flexDirection:'row',alignItems:'center',gap:5}}>{links.map(item=><Pressable key={item.path} accessibilityRole="link" accessibilityLabel={item.label} onPress={()=>navigate(item)} style={{minHeight:48,paddingHorizontal:width>=1250?17:10,borderRadius:9,justifyContent:'center',backgroundColor:active(item)?C.lime:'transparent'}}><T style={{fontSize:12,fontFamily:active(item)?'DMSansBold':'DMSans',color:active(item)?C.onLime:C.ink}}>{item.title}</T></Pressable>)}</View>}
      <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
        {!desktop&&<View style={{backgroundColor:'#495161',borderRadius:20,paddingHorizontal:9,paddingVertical:5}}><T style={{fontSize:9,lineHeight:15,fontFamily:'DMSansBold',color:'#ACF847',letterSpacing:.7}}>{AUTH_MODE==='demo'?'DEMO':section.toUpperCase()}</T></View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Open my profile" onPress={()=>router.push('/profile')} style={{minHeight:48,minWidth:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10}}>
          {desktop&&<View><T style={{fontFamily:'DMSansBold',fontSize:12,lineHeight:18,textAlign:'right'}}>{user?.name}</T><T style={{fontSize:10,lineHeight:15,color:C.muted,textAlign:'right'}}>{user?.hostel_block?'Hostel '+user.hostel_block:'Hostel not set'}</T></View>}
          <View style={{height:34,width:34,borderRadius:17,backgroundColor:desktop?C.primary:C.lavender,borderWidth:2,borderColor:desktop?'#C8DCA7':'#C4C1FB',alignItems:'center',justifyContent:'center'}}><T style={{fontFamily:'DMSansBold',fontSize:13,color:desktop?C.white:C.dark}}>{user?.name.slice(0,1).toUpperCase()}</T></View>
        </Pressable>
      </View>
    </View>
    <ScrollView style={{flex:1}} contentContainerStyle={{paddingHorizontal:desktop?36:20,paddingTop:desktop?26:8,paddingBottom:desktop?0:24,alignItems:'center'}} keyboardShouldPersistTaps="handled">
      <View style={{width:'100%',maxWidth:1360}}><Slot/></View>
      {desktop&&<View style={{width:'100%',maxWidth:1432,marginTop:desktop?48:26,paddingVertical:desktop?22:14,paddingHorizontal:desktop?16:0,backgroundColor:desktop?C.pale:'transparent',flexDirection:desktop?'row':'column',alignItems:desktop?'center':'flex-start',justifyContent:'space-between',gap:10}}>
        <T style={{fontFamily:'DMSansBold',fontSize:11,color:C.ink}}>HostelXpress · Campus delivery</T><T style={{fontSize:10,color:C.muted}}>{AUTH_MODE==='demo'?'Demo · No real payments or robot movement':'Gate 2 to your hostel · Student workspace'}</T>
        {desktop&&<Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={signOut} style={{minHeight:48,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:7}}><Icon name="log-out-outline" size={17}/><T style={{fontSize:11}}>Sign out</T></Pressable>}
      </View>}
    </ScrollView>
    {!desktop&&<View style={{flexDirection:'row',paddingTop:0,paddingBottom:insets.bottom,height:64+insets.bottom,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.line}}>{links.filter(item=>item.path!=='/help').map(item=><Pressable key={item.path} accessibilityRole="link" accessibilityLabel={item.label} onPress={()=>navigate(item)} style={{flex:1,minHeight:50,alignItems:'center',justifyContent:'center',gap:3}}><Icon name={item.icon} color={active(item)?C.lime:C.muted} size={23}/><T style={{fontSize:10,lineHeight:15,color:active(item)?C.lime:C.muted,fontFamily:active(item)?'DMSansBold':'DMSans'}}>{item.path==='/deliveries'?'Bookings':item.path==='/tracking'?'Tracking':item.title}</T></Pressable>)}</View>}
  </View>;
}
