import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View} from 'react-native';
import {router} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {newRequestId} from '../api';
import {HOSTELS} from '../campus';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, T} from '../ui';

export function BookModal({onClose,initialHostel}: {onClose:()=>void;initialHostel?:string}) {
  const {user,createOrder} = useApp();
  const {width} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mobile = width < 720;
  const [hostel,setHostel] = useState(initialHostel||user?.hostel_block||'A');
  const [room,setRoom] = useState('');
  const [carrier,setCarrier] = useState('Amazon');
  const [label,setLabel] = useState('');
  const [key] = useState(newRequestId);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [reduceMotion,setReduceMotion] = useState(false);
  const bookingLabel = [carrier,label.trim(),room.trim()].filter(Boolean).join(' · ');
  const valid = !!label.trim() && !!room.trim() && bookingLabel.length<=80;
  useEffect(()=>{
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(()=>undefined);
  },[]);
  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const order = await createOrder(bookingLabel,hostel,key);
      onClose();
      router.push({pathname:'/order/[id]',params:{id:order.id}});
    } catch(err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <Modal transparent animationType={reduceMotion?'none':'fade'} onRequestClose={()=>{if(!busy)onClose();}}>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}
      style={{flex:1,backgroundColor:mobile?C.canvas:'#0B1C3099',alignItems:'center',justifyContent:'center',padding:mobile?0:20}}>
      <View accessibilityViewIsModal style={{width:'100%',maxWidth:mobile?undefined:540,height:mobile?'100%':undefined,maxHeight:'100%',backgroundColor:C.canvas,borderRadius:mobile?0:16,overflow:'hidden',paddingTop:mobile?insets.top:0}}>
        <View style={{minHeight:72,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.canvas}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close booking" disabled={busy} onPress={onClose}
            style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}}><Icon name="arrow-back-outline"/></Pressable>
          <View style={{flex:1}}><Heading style={{fontSize:20,lineHeight:27}}>Book Gate 2 Delivery</Heading><T style={{fontSize:11,color:C.muted}}>Campus Gate 2 Delivery Dropzone</T></View>
          <Icon name="cube-outline" color={C.primary}/>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:16,paddingBottom:24}}>
          <Card style={{padding:16,flexDirection:'row',gap:10}}>
            <View style={{width:40,height:40,borderRadius:20,backgroundColor:C.lavender,alignItems:'center',justifyContent:'center'}}><Icon name="business-outline" color={C.muted}/></View>
            <View style={{flex:1,gap:4}}><Label style={{color:C.primary,letterSpacing:.5}}>Autonomous Pickup · Fixed Hub</Label><Heading style={{fontSize:14,lineHeight:20,letterSpacing:-.3}}>Campus Gate 2 Delivery Dropzone</Heading><T style={{fontSize:12,lineHeight:18,color:C.muted}}>External couriers hand off packages directly to loading bay rovers here.</T></View>
          </Card>
          <Card style={{padding:16,gap:10}}>
            <View style={common.between}><Heading style={{fontSize:18,lineHeight:25,letterSpacing:-.3}}>Destination Hostel</Heading><Label style={{letterSpacing:0}}>Step 1 of 3</Label></View>
            <T style={{fontFamily:'DMSansBold',fontSize:12,color:C.muted}}>Select Residence Hall (7 Campus Hostels)</T>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {HOSTELS.map(block=><Pressable key={block.id} accessibilityRole="radio" accessibilityLabel={'Hostel '+block.id} accessibilityState={{checked:hostel===block.id}}
                onPress={()=>setHostel(block.id)} disabled={busy} style={{width:block.id==='G'?'100%':'48%',flexGrow:1,minHeight:48,paddingHorizontal:10,borderRadius:10,backgroundColor:hostel===block.id?'#E5EEFF':C.pale,flexDirection:'row',alignItems:'center',gap:8}}>
                <Icon name={hostel===block.id?'radio-button-on-outline':'radio-button-off-outline'} color={hostel===block.id?C.primary:C.muted} size={20}/>
                <T style={{fontFamily:'DMSansBold',fontSize:12,flex:1}}>{block.name}{block.id==='G'?' Hostel (West Quad)':''}</T>
              </Pressable>)}
            </View>
            <T style={{fontFamily:'DMSansBold',fontSize:12,color:C.muted}}>Room &amp; Wing details</T>
            <TextInput testID="room-input" accessibilityLabel="Room and Wing details" value={room} onChangeText={setRoom} editable={!busy}
              placeholder="e.g. Room 304, Wing A" placeholderTextColor={C.muted} maxLength={40} style={[common.input,{backgroundColor:C.white}]}/>
          </Card>
          <Card style={{padding:16,gap:10}}>
            <View style={common.between}><Heading style={{fontSize:18,lineHeight:25,letterSpacing:-.3}}>Parcel Details</Heading><Label style={{letterSpacing:0}}>Step 2 of 3</Label></View>
            <T style={{fontFamily:'DMSansBold',fontSize:12,color:C.muted}}>Courier Carrier</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
              {['Amazon','Flipkart','Instamart','Bluedart','Other'].map(name=><Pressable key={name} accessibilityRole="button" accessibilityState={{selected:carrier===name}} onPress={()=>setCarrier(name)} disabled={busy}
                style={{minHeight:48,paddingHorizontal:14,borderRadius:24,backgroundColor:carrier===name?C.primary:C.lavender,justifyContent:'center'}}>
                <T style={{fontFamily:'DMSansBold',fontSize:12,color:carrier===name?C.white:C.muted}}>{name}</T>
              </Pressable>)}
            </ScrollView>
            <T style={{fontFamily:'DMSansBold',fontSize:12,color:C.muted}}>AWB / Delivery Slip ID</T>
            <TextInput testID="booking-label" accessibilityLabel="Parcel label" placeholder="Tracking ID on package slip" placeholderTextColor={C.muted}
              value={label} onChangeText={setLabel} editable={!busy} maxLength={60} autoCapitalize="characters"
              style={[common.input,{backgroundColor:C.white,fontFamily:'JakartaExtraBold',fontSize:21,letterSpacing:1}]}/>
            <T style={{fontSize:12,lineHeight:18,color:C.muted}}>Hub supervisor verifies this ID prior to latching the rover compartment.</T>
            <View style={{backgroundColor:C.pale,borderRadius:10,padding:10,flexDirection:'row',gap:8,alignItems:'center'}}>
              <Icon name="cube-outline" color={C.teal}/><T style={{flex:1,fontSize:11,lineHeight:17}}>Standard Modular Hatch — Confirm package size and weight with the hub operator.</T>
            </View>
            <T style={{fontSize:10,lineHeight:15,color:bookingLabel.length>80?C.danger:C.muted}}>Saved parcel note ({bookingLabel.length}/80): {bookingLabel}</T>
            {bookingLabel.length>80 && <T accessibilityRole="alert" style={{color:C.danger,fontSize:12}}>Shorten the room details or tracking ID to 80 characters total.</T>}
          </Card>
          <Card style={{padding:16,gap:12}}>
            <View style={common.between}><Heading style={{fontSize:18,lineHeight:25,letterSpacing:-.3,flex:1}}>Autonomous Bay Allocation</Heading><T style={{fontSize:11,color:C.teal}}>On confirmation</T></View>
            <View style={{flexDirection:'row',gap:8}}>
              {[1,2,3].map(bay=><View key={bay} style={{flex:1,backgroundColor:C.pale,borderRadius:10,padding:12,alignItems:'center',gap:6}}>
                <Label style={{letterSpacing:.4}}>Bay {bay}</Label><Icon name="cube-outline" color={C.muted}/><T style={{fontSize:10,color:C.muted}}>Not assigned</T>
              </View>)}
            </View>
            <T style={{fontSize:12,lineHeight:18,color:C.muted}}>Your bay is assigned by the server when the booking is confirmed. Availability is checked at that time.</T>
          </Card>
          <Card style={{padding:16,gap:12}}>
            <Heading style={{fontSize:18,lineHeight:25,letterSpacing:-.3}}>Campus Student Tariff</Heading>
            <View style={common.between}><T style={{fontSize:12,color:C.muted,flex:1}}>Gate-to-Hostel Autonomous Dispatch</T><T style={{fontFamily:'DMSansBold'}}>₹10.00</T></View>
            <View style={common.between}><T style={{fontSize:12,color:C.muted,flex:1}}>Surge &amp; Peak Campus Surcharge</T><T style={{fontSize:12,color:C.teal,fontFamily:'DMSansBold'}}>₹0.00 (Zero Surge)</T></View>
            <View style={common.divider}/>
            <View style={common.between}><View><Heading style={{fontSize:18,lineHeight:24}}>Total Payable</Heading><T style={{fontSize:10,color:C.muted}}>Pay at arrival before collection</T></View><Heading style={{fontSize:28,lineHeight:35,color:C.primary}}>₹10.00</Heading></View>
          </Card>
          {error && <ErrorNotice message={error}/>}
          <View style={{flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'}}><Icon name="shield-checkmark-outline" color={C.teal} size={18}/><T style={{fontSize:11,color:C.muted,flexShrink:1}}>Wait for confirmed unlock before collecting your parcel.</T></View>
        </ScrollView>
        <View style={{backgroundColor:C.canvas,padding:16,paddingBottom:16+(mobile?insets.bottom:0),borderTopWidth:1,borderTopColor:C.line,flexDirection:'row',alignItems:'center',gap:12}}>
          <View style={{minWidth:60}}><Label style={{letterSpacing:.4}}>Amount</Label><Heading style={{fontSize:24,lineHeight:30}}>₹10</Heading></View>
          <View style={{flex:1}}><Button icon="hardware-chip-outline" variant="orange" onPress={()=>void submit()} loading={busy} disabled={!valid} testID="booking-submit" accessibilityLabel="Reserve my compartment">Confirm & Dispatch Rover</Button></View>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
