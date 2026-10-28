import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View} from 'react-native';
import {router} from 'expo-router';
import {AUTH_MODE, newRequestId} from '../api';
import {HostelPicker} from './HostelPicker';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Button, common, ErrorNotice, Heading, Icon, Label, Pill, T} from '../ui';

export function BookModal({onClose}: {onClose: () => void}) {
  const {user,createOrder} = useApp();
  const [hostel,setHostel] = useState(user?.hostel_block||'C');
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
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,backgroundColor:'#10291F80',alignItems:'center',justifyContent:'center',padding:20}}>
      <View accessibilityViewIsModal style={{width:'100%',maxWidth:500,maxHeight:'95%',backgroundColor:C.canvas,borderRadius:23,overflow:'hidden'}}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:29,gap:20}}>
          <View style={common.between}><Pill icon="sparkles-outline">A smarter last stretch</Pill><Pressable accessibilityRole="button" accessibilityLabel="Close booking" disabled={busy} onPress={onClose} hitSlop={8} style={{padding:12,margin:-12}}><Icon name="close-outline"/></Pressable></View>
          <View><Heading style={{fontSize:28}}>Let’s bring it home.</Heading><T style={{marginTop:8,color:C.muted,fontSize:13}}>Reserve a compartment for your next parcel.</T></View>
          <View style={{gap:9}}><Label>What’s coming?</Label><TextInput autoFocus testID="booking-label" accessibilityLabel="Parcel label" placeholder="e.g. Dinner from the gate" placeholderTextColor="#8D9789" value={label} onChangeText={setLabel} maxLength={80} style={common.input}/></View>
          <HostelPicker label="Deliver to hostel" hostel={hostel} setHostel={setHostel} note={AUTH_MODE==='real'?'Hostel blocks A–G. Campus configuration is pending.':'Demo hostel labels. Campus configuration is pending.'}/>
          <View style={{borderWidth:1,borderColor:C.line,backgroundColor:C.white,padding:17,borderRadius:12,gap:10}}>
            <View style={common.between}><T style={{fontSize:12,color:C.muted}}>Pickup point</T><T style={{fontSize:12,fontFamily:'DMSansMedium'}}>Gate 2</T></View>
            <View style={common.between}><T style={{fontSize:12,color:C.muted}}>Delivery fee</T><T style={{fontSize:17,fontFamily:'ManropeBold'}}>₹10</T></View>
            <T style={{fontSize:10,color:C.muted}}>Pay after arrival, before collection. No charge is made here.</T>
          </View>
          {error && <ErrorNotice message={error}/>}
          <Button icon="arrow-forward-outline" variant="orange" onPress={()=>void submit()} loading={busy} disabled={!label.trim()} testID="booking-submit">Reserve my compartment</Button>
          <T style={{fontSize:10,lineHeight:16,color:C.muted,textAlign:'center'}}>The rider has 5 minutes to load after reservation. Delivery-platform OTP integration is pending.</T>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
