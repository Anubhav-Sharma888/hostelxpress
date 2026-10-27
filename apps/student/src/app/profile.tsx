import React from 'react';
import {View} from 'react-native';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Button, Card, common, Heading, Icon, Label, PageTitle, Pill, T} from '../ui';
export default function Profile() {
  const {user,session,signOut,orders}=useApp();
  return <View><PageTitle eyebrow="Your campus identity" title="Right at home." description="Your profile and a few things worth knowing."/>
    <View style={{flexDirection:'row',gap:22,flexWrap:'wrap'}}>
      <Card style={{flex:1,minWidth:260,maxWidth:640,gap:23}}>
        <View style={common.row}><View style={{height:69,width:69,borderRadius:23,backgroundColor:'#E5ECD9',alignItems:'center',justifyContent:'center'}}><T style={{fontFamily:'ManropeBold',fontSize:27}}>{user?.name.slice(0,1)}</T></View><View><Heading style={{fontSize:25,lineHeight:34,letterSpacing:-.6}}>{user?.name}</Heading><T style={{fontSize:12,color:C.muted}}>Student · Hostel {user?.hostel_block}</T></View></View>
        <View style={{height:1,backgroundColor:C.line}}/>
        <View style={common.between}><Label>Hostel block</Label><T style={{fontFamily:'DMSansBold'}}>Hostel {user?.hostel_block}</T></View>
        <View style={common.between}><Label>Completed deliveries</Label><T style={{fontFamily:'DMSansBold'}}>{orders.filter(order=>order.status==='Completed').length}</T></View>
        <View style={common.between}><Label>Environment</Label><Pill tone="orange">{session?.mode==='demo'?'Local demo':'Connected'}</Pill></View>
        <T style={{fontSize:11,color:C.muted,lineHeight:19}}>In this demo, your profile is selected at sign-in. Sign out to try another name or hostel. Existing orders keep their original delivery destination.</T>
        <Button variant="ghost" icon="log-out-outline" onPress={signOut}>Sign out</Button>
      </Card>
      <View style={{flex:1,minWidth:260,maxWidth:500,gap:18}}>
        <Card style={{gap:14,backgroundColor:C.forest,borderColor:C.forest}}><Icon name="shield-checkmark-outline" size={28} color="#D9E8CA"/><Heading style={{fontSize:23,lineHeight:31,color:'#F5F7EE',letterSpacing:-.6}}>Your privacy,{'\n'}part of the delivery.</Heading><T style={{fontSize:12,lineHeight:20,color:'#BED1BC'}}>This demo keeps your session token in memory. Reloading or signing out ends the session in the app. No payment or backend secrets are bundled here.</T></Card>
        <Card style={{gap:9}}><Label>Before campus launch</Label><T style={{fontSize:12,color:C.muted,lineHeight:20}}>University sign-in, confirmed hostel names, support contacts, live payments, and device enrollment must be configured and verified before real deliveries.</T></Card>
      </View>
    </View>
  </View>;
}
