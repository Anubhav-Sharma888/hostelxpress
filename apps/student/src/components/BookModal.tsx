import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View} from 'react-native';
import {router} from 'expo-router';
import {newRequestId} from '../api';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, Pill, T} from '../ui';

export function BookModal({onClose,initialHostel}: {onClose: () => void; initialHostel?: string}) {
  const {user,createOrder} = useApp();
  const {width} = useWindowDimensions();
  const mobile = width < 720;
  const [hostel,setHostel] = useState(initialHostel||user?.hostel_block||'C');
  const [label,setLabel] = useState('');
  const [key] = useState(newRequestId);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [reduceMotion,setReduceMotion] = useState(false);
  useEffect(() => {AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);},[]);
  async function submit() {
    if (!label.trim() || busy) return;
    setBusy(true); setError(null);
    try { const order = await createOrder(label,hostel,key); onClose(); router.push({pathname:'/order/[id]',params:{id:order.id}}); }
    catch(err) {setError((err as Error).message);}
    finally {setBusy(false);}
  }
  return <Modal transparent animationType={reduceMotion?'none':'fade'} onRequestClose={()=>{if(!busy)onClose();}}>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
      style={{flex:1,backgroundColor:mobile?C.canvas:'#0F172A99',alignItems:'center',justifyContent:'center',padding:mobile?0:20}}>
      <View accessibilityViewIsModal style={{width:'100%',maxWidth:mobile?undefined:540,height:mobile?'100%':undefined,
        maxHeight:mobile?'100%':'95%',backgroundColor:C.canvas,borderRadius:mobile?0:16,overflow:'hidden'}}>
        <View style={{minHeight:64,backgroundColor:C.dark,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:10}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close booking" disabled={busy} onPress={onClose}
            style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}}><Icon name="arrow-back-outline" color="#EDF0FF"/></Pressable>
          <View style={{flex:1,minWidth:0}}>
            <Heading style={{fontSize:20,lineHeight:27,color:'#EDF0FF'}}>Book a Delivery</Heading>
            <Label style={{color:'#C4C1FB'}}>BOOKINGS</Label>
          </View>
          <Icon name="hardware-chip-outline" size={24} color={C.lime}/>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
          <Card style={{padding:16,backgroundColor:'#E1E8FD',gap:7,borderRadius:12}}>
            <Label style={{color:C.primary}}>● Origin checkpoint</Label>
            <View style={[common.row,{alignItems:'flex-start'}]}>
              <View style={{width:36,height:36,borderRadius:8,backgroundColor:C.dark,alignItems:'center',justifyContent:'center'}}>
                <Icon name="git-network-outline" size={20} color={C.lime}/>
              </View>
              <View style={{flex:1,minWidth:0}}>
                <Heading style={{fontSize:20,lineHeight:26}}>Gate 2 Central Security Post</Heading>
                <T style={{fontSize:12,lineHeight:18,color:C.muted}}>Parcel reception · Campus pickup point</T>
              </View>
            </View>
          </Card>
          <View style={{gap:8}}>
            <View style={common.between}><Heading style={{fontSize:20,lineHeight:28}}>Destination Hostel</Heading><T style={{fontSize:10,color:C.muted}}>Tap to pick</T></View>
            {['A','B','C','D','E','F','G'].map(block => {
              const selected = hostel===block;
              return <Pressable key={block} accessibilityRole="radio" accessibilityLabel={'Hostel '+block}
                accessibilityState={{checked:selected}} onPress={()=>setHostel(block)}
                style={{minHeight:58,padding:12,borderRadius:12,backgroundColor:selected?C.dark:'#E9EDFF',
                  flexDirection:'row',alignItems:'center',gap:12}}>
                <View style={{width:36,height:36,borderRadius:8,backgroundColor:selected?C.lime:'#DCE2F7',alignItems:'center',justifyContent:'center'}}>
                  <Icon name="business-outline" color={C.ink} size={18}/>
                </View>
                <T style={{flex:1,fontFamily:'DMSansBold',color:selected?'#EDF0FF':C.ink}}>Hostel Block {block}</T>
                {selected&&<Icon name="checkmark-circle" size={22} color={C.lime}/>}
              </Pressable>;
            })}
          </View>
          <Card style={{padding:16,gap:9,borderRadius:12}}>
            <Label>Hostel room &amp; block</Label>
            <View style={{backgroundColor:C.lavender,padding:12,borderRadius:8,flexDirection:'row',alignItems:'center',gap:10}}>
              <Icon name="business-outline" size={18}/><T style={{flex:1,fontFamily:'DMSansBold'}}>Block {hostel}</T>
            </View>
          </Card>
          <Card style={{padding:16,gap:12,borderRadius:12}}>
            <View style={common.between}><Heading style={{fontSize:20,lineHeight:28}}>Parcel Information</Heading><Icon name="scan-outline" color={C.primary}/></View>
            <Label>Courier / tracking ID / consignment</Label>
            <TextInput testID="booking-label" accessibilityLabel="Parcel label" placeholder="e.g. Dinner from the gate"
              placeholderTextColor={C.muted} value={label} onChangeText={setLabel} maxLength={80} style={common.input}/>
          </Card>
          <Card style={{padding:16,gap:12,backgroundColor:'#E1E8FD',borderRadius:12}}>
            <View style={common.between}><Heading style={{fontSize:20,lineHeight:28}}>Fare Summary</Heading><Pill>Flat campus fare</Pill></View>
            <View style={common.between}><T style={{fontSize:12,color:C.muted}}>Platform base delivery</T><T style={{fontSize:12}}>₹10.00</T></View>
            <View style={common.between}>
              <View><T style={{fontFamily:'DMSansBold'}}>Total Payable</T><T style={{fontSize:10,color:C.muted}}>Pay on arrival</T></View>
              <T style={{fontFamily:'JakartaExtraBold',fontSize:28,lineHeight:36}}>₹10</T>
            </View>
          </Card>
          {error&&<ErrorNotice message={error}/>}
          <Button icon="hardware-chip-outline" onPress={()=>void submit()} loading={busy} disabled={!label.trim()}
            testID="booking-submit" accessibilityLabel="Reserve my compartment">Confirm Rover Booking (₹10)</Button>
          <Card style={{padding:16,gap:7,backgroundColor:C.lavender,borderRadius:12}}>
            <T style={{fontFamily:'DMSansBold'}}>Student Handover Protocol</T>
            <T style={{fontSize:12,lineHeight:18,color:C.muted}}>The rider has 5 minutes to load after reservation. At arrival, wait for confirmed unlock before collecting.</T>
          </Card>
          <View style={{height:144,borderRadius:12,overflow:'hidden',backgroundColor:C.dark}}>
            <Image source={require('../../assets/stitch/booking-campus.jpg')} resizeMode="cover"
              accessibilityLabel="Illustration of a campus delivery rover" style={{width:'100%',height:'100%'}}/>
            <View style={{position:'absolute',bottom:0,left:0,right:0,backgroundColor:'#141B2BDC',padding:12}}>
              <Label style={{color:'#EDF0FF'}}>● Gate 2 pickup · Campus illustration</Label>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
