import React, {useEffect} from 'react';
import {Pressable, ScrollView, useWindowDimensions, View} from 'react-native';
import {router, Slot, usePathname} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Icon, IconName, Label, T} from '../ui';

const links: {path: '/'|'/deliveries'|'/profile'|'/help'; label: string; icon: IconName}[] = [
  {path:'/',label:'Overview',icon:'grid-outline'}, {path:'/deliveries',label:'My deliveries',icon:'cube-outline'},
  {path:'/profile',label:'My profile',icon:'person-outline'}, {path:'/help',label:'Help & support',icon:'help-circle-outline'},
];
export function Wordmark({light = false, small = false}: {light?: boolean; small?: boolean}) {
  return <View style={{flexDirection:'row',alignItems:'center',gap:9}}>
    <View style={{width:small?30:34,height:small?30:34,borderRadius:10,backgroundColor:C.orange,alignItems:'center',justifyContent:'center'}}><Icon name="cube-outline" color={C.dark} size={20}/></View>
    <T style={{fontFamily:'ManropeBold',fontSize:small?17:19,letterSpacing:-0.7,color:light?'#FFFFFF':C.forest}}>hostel<T style={{fontFamily:'ManropeBold',fontSize:small?17:19,color:light?'#FFFFFF':C.forest}}>xpress</T><T style={{color:C.orange,fontSize:20}}>.</T></T>
  </View>;
}
export function AppShell() {
  const {width} = useWindowDimensions();
  const desktop = width >= 1000;
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const {session,user,signOut} = useApp();
  useEffect(() => {
    if (!session && path !== '/sign-in') router.replace('/sign-in');
    if (session && path === '/sign-in') router.replace('/');
  },[session,path]);
  if (path === '/sign-in' || !session) return <Slot/>;
  const active = (item: typeof links[number]) => item.path === '/' ? path==='/' : item.path==='/deliveries' ? path.startsWith('/deliveries') || path.startsWith('/order') : path.startsWith(item.path);
  return <View style={{flex:1,backgroundColor:C.canvas,flexDirection:'row'}}>
    {desktop && <View style={{width:228,backgroundColor:C.dark,paddingTop:32,paddingHorizontal:24,paddingBottom:24}}>
      <Wordmark light/>
      <View style={{marginTop:45,marginBottom:15}}><Label style={{color:'#84A092',fontSize:9}}>Your campus space</Label></View>
      <View style={{gap:8}}>{links.map(item=><Pressable key={item.path} accessibilityRole="link" accessibilityLabel={item.label} onPress={()=>router.push(item.path)} style={{paddingHorizontal:13,paddingVertical:12,borderRadius:9,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:active(item)?'#275444':'transparent'}}>
        <Icon name={item.icon} color={active(item)?'#FFFFFF':'#9AB1A5'} size={18}/><T style={{fontFamily:active(item)?'DMSansBold':'DMSans',fontSize:12,color:active(item)?'#FFFFFF':'#B1C4B8'}}>{item.label}</T>
        {active(item) && <View style={{height:5,width:5,borderRadius:3,backgroundColor:C.orange,marginLeft:'auto'}}/>}
      </Pressable>)}</View>
      <View style={{flex:1}}/>
      <View style={{borderWidth:1,borderColor:'#3A6251',borderRadius:14,padding:18,marginBottom:24}}>
        <View style={{height:31,width:31,borderRadius:16,backgroundColor:'#2C5B47',justifyContent:'center',alignItems:'center',marginBottom:12}}><Icon name="leaf-outline" size={16} color="#BFD5B0"/></View>
        <T style={{fontFamily:'ManropeBold',fontSize:16,lineHeight:22,color:'#EFF6EA',letterSpacing:-.4}}>Little trips.{'\n'}More campus time.</T>
        <T style={{fontSize:10,lineHeight:16,color:'#A8BFB0',marginTop:8}}>A smarter last stretch,{'\n'}from the gate to your hostel.</T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={signOut} style={{flexDirection:'row',alignItems:'center',gap:11,padding:10}}><Icon name="log-out-outline" size={18} color="#A8BFB0"/><T style={{fontSize:12,color:'#B1C4B8'}}>Sign out</T></Pressable>
      <T style={{fontSize:9,color:'#6D9180',marginTop:20,paddingLeft:10}}>HOSTELXPRESS · STUDENT APP</T>
    </View>}
    <View style={{flex:1,minWidth:0}}>
      <View style={{height:desktop?78:70+insets.top,paddingTop:desktop?0:insets.top,paddingHorizontal:desktop?39:20,borderBottomWidth:1,borderBottomColor:C.line,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:C.canvas}}>
        {desktop ? <T style={{fontSize:12,color:C.muted}}>Your everyday, a little easier.</T> : <Wordmark small/>}
        <View style={{flexDirection:'row',alignItems:'center',gap:desktop?19:11}}>
          <View style={{flexDirection:'row',gap:6,alignItems:'center',backgroundColor:'#ECEFE5',paddingHorizontal:9,paddingVertical:5,borderRadius:20}}><View style={{width:5,height:5,borderRadius:3,backgroundColor:'#D38B52'}}/><T style={{fontSize:9,lineHeight:15,color:'#69735F'}}>Demo environment</T></View>
          {desktop && <View style={{width:1,height:24,backgroundColor:C.line}}/>}
          <Pressable accessibilityRole="button" accessibilityLabel="Open my profile" onPress={()=>router.push('/profile')} style={{flexDirection:'row',alignItems:'center',gap:10}}>
            <View style={{height:32,width:32,borderRadius:16,backgroundColor:'#E2E9D9',alignItems:'center',justifyContent:'center'}}><T style={{fontFamily:'DMSansBold',fontSize:11,color:C.forest}}>{user?.name.slice(0,1).toUpperCase()}</T></View>
            {desktop && <View><T style={{fontFamily:'DMSansBold',fontSize:11,lineHeight:16}}>{user?.name}</T><T style={{fontSize:9,lineHeight:13,color:C.muted}}>Hostel {user?.hostel_block}</T></View>}
          </Pressable>
        </View>
      </View>
      <ScrollView style={{flex:1}} contentContainerStyle={{padding:desktop?36:20,paddingBottom:desktop?28:28+insets.bottom,alignItems:'center'}} keyboardShouldPersistTaps="handled">
        <View style={{width:'100%',maxWidth:1320}}><Slot/></View>
        <View style={{width:'100%',maxWidth:1320,marginTop:34,paddingTop:18,borderTopWidth:1,borderTopColor:C.line,flexDirection:'row',justifyContent:'space-between',gap:15}}>
          <T style={{fontSize:9,color:'#939B8D'}}>Made for life on campus.</T><T style={{fontSize:9,color:'#939B8D'}}>Demo · No real payments or robot movement</T>
        </View>
      </ScrollView>
      {!desktop && <View style={{flexDirection:'row',paddingTop:9,paddingBottom:9+insets.bottom,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.line}}>
        {links.slice(0,3).map(item=><Pressable key={item.path} accessibilityRole="link" accessibilityLabel={item.label} onPress={()=>router.push(item.path)} style={{flex:1,alignItems:'center',gap:3,padding:5}}>
          <Icon name={item.icon} color={active(item)?C.forest:'#8D9789'} size={22}/><T style={{fontSize:9,color:active(item)?C.forest:'#8D9789',fontFamily:active(item)?'DMSansBold':'DMSans'}}>{item.label==='Overview'?'Home':item.label==='My deliveries'?'Deliveries':'Profile'}</T>
        </Pressable>)}
        <Pressable accessibilityRole="link" accessibilityLabel="Help and support" onPress={()=>router.push('/help')} style={{flex:1,alignItems:'center',gap:3,padding:5}}><Icon name="help-circle-outline" color={path==='/help'?C.forest:'#8D9789'} size={22}/><T style={{fontSize:9,color:C.muted}}>Help</T></Pressable>
      </View>}
    </View>
  </View>;
}
