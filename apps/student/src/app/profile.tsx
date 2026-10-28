import React, {useState} from 'react';
import {TextInput, View} from 'react-native';
import {useLocalSearchParams} from 'expo-router';
import {AUTH_MODE} from '../api';
import {HostelPicker} from '../components/HostelPicker';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, PageTitle, Pill, T} from '../ui';
export default function Profile() {
  const {user,session,signOut,orders,updateProfile}=useApp();
  const {edit}=useLocalSearchParams<{edit?:string}>();
  const [editing,setEditing]=useState(edit==='1');
  const [name,setName]=useState(user?.name||'');
  const [hostel,setHostel]=useState(user?.hostel_block||'C');
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [saved,setSaved]=useState(false);
  async function save() {
    if(busy||!name.trim())return;
    setBusy(true);setError(null);
    try{await updateProfile({name:name.trim(),hostel_block:hostel});setSaved(true);setEditing(false);}
    catch(err){setError((err as Error).message);}
    finally{setBusy(false);}
  }
  function cancel(){setName(user?.name||'');setHostel(user?.hostel_block||'C');setError(null);setSaved(false);setEditing(false);}
  return <View><PageTitle eyebrow="Your campus identity" title="Right at home." description="Your profile and a few things worth knowing."/>
    <View style={{flexDirection:'row',gap:22,flexWrap:'wrap'}}>
      <Card style={{flex:1,minWidth:260,maxWidth:640,gap:23}}>
        <View style={common.row}><View style={{height:69,width:69,borderRadius:23,backgroundColor:'#E5ECD9',alignItems:'center',justifyContent:'center'}}><T style={{fontFamily:'ManropeBold',fontSize:27}}>{user?.name.slice(0,1)}</T></View><View><Heading style={{fontSize:25,lineHeight:34,letterSpacing:-.6}}>{user?.name}</Heading><T style={{fontSize:12,color:C.muted}}>Student · {user?.hostel_block?'Hostel '+user.hostel_block:'Hostel not set'}</T></View></View>
        <View style={{height:1,backgroundColor:C.line}}/>
        {saved&&!editing&&<View><Pill tone="green" icon="checkmark-circle-outline">Profile saved</Pill></View>}
        {editing?<View style={{gap:17}}>
          <View><Label>Your name</Label><TextInput testID="profile-name-input" accessibilityLabel="Your name" autoComplete="name" textContentType="name" value={name} onChangeText={setName} maxLength={120} returnKeyType="done" onSubmitEditing={()=>void save()} style={[common.input,{marginTop:8}]}/></View>
          <HostelPicker hostel={hostel} setHostel={setHostel} note="Hostel blocks A–G, not a configured campus."/>
          {error&&<ErrorNotice message={error}/>}
          <View style={common.row}><Button icon="checkmark-outline" onPress={()=>void save()} loading={busy} disabled={!name.trim()} testID="profile-save">Save changes</Button><Button variant="ghost" icon="close-outline" onPress={cancel} disabled={busy}>Cancel</Button></View>
        </View>:<>
          <View style={common.between}><Label>Hostel block</Label><T style={{fontFamily:'DMSansBold'}}>{user?.hostel_block?'Hostel '+user.hostel_block:'Hostel not set'}</T></View>
          <View style={common.between}><Label>Completed deliveries</Label><T style={{fontFamily:'DMSansBold'}}>{orders.filter(order=>order.status==='Completed').length}</T></View>
          <View style={common.between}><Label>Environment</Label><Pill tone="orange">{session?.mode==='demo'?'Local demo':'Connected'}</Pill></View>
          <T style={{fontSize:11,color:C.muted,lineHeight:19}}>{AUTH_MODE==='demo'?'You can update your name and hostel block here. Existing orders keep their original delivery destination.':'Your name and hostel block are saved with your account. Existing orders keep their original delivery destination.'}</T>
          <View style={common.between}><Label>Profile</Label><Button small variant="secondary" icon="create-outline" onPress={()=>{setSaved(false);setError(null);setEditing(true);}} testID="profile-edit">Edit profile</Button></View>
        </>}
        <Button variant="ghost" icon="log-out-outline" onPress={signOut}>Sign out</Button>
      </Card>
      <View style={{flex:1,minWidth:260,maxWidth:500,gap:18}}>
        <Card style={{gap:14,backgroundColor:C.forest,borderColor:C.forest}}><Icon name="shield-checkmark-outline" size={28} color="#D9E8CA"/><Heading style={{fontSize:23,lineHeight:31,color:'#F5F7EE',letterSpacing:-.6}}>Your privacy,{'\n'}part of the delivery.</Heading><T style={{fontSize:12,lineHeight:20,color:'#BED1BC'}}>{AUTH_MODE==='demo'?'This demo keeps your session token in memory.':'Hostelxpress keeps your session token in memory.'} Reloading or signing out ends the session in the app. No payment or backend secrets are bundled here.</T></Card>
        <Card style={{gap:9}}><Label>Before campus launch</Label><T style={{fontSize:12,color:C.muted,lineHeight:20}}>University sign-in, confirmed hostel names, support contacts, live payments, and device enrollment must be configured and verified before real deliveries.</T></Card>
      </View>
    </View>
  </View>;
}
