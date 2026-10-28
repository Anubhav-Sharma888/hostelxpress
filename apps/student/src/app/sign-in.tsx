import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View} from 'react-native';
import {router} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AUTH_MODE} from '../api';
import {HostelPicker} from '../components/HostelPicker';
import {Wordmark} from '../components/AppShell';
import {CampusMap} from '../components/CampusMap';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Button, common, ErrorNotice, Heading, Icon, Label, Pill, T} from '../ui';

function DemoForm({hostel, setHostel}: {hostel: string; setHostel: (value: string) => void}) {
  const {signIn} = useApp(); const [name,setName]=useState('Anubhav');
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  async function submit() {if(busy||!name.trim())return;setBusy(true);setError(null);try{await signIn(name,hostel);router.replace('/');}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  return <View style={{gap:17}}>
    <View><Label>Your name</Label><TextInput testID="name-input" accessibilityLabel="Your name" autoComplete="name" textContentType="givenName" value={name} onChangeText={setName} maxLength={80} returnKeyType="next" style={[common.input,{marginTop:8}]}/></View>
    <HostelPicker hostel={hostel} setHostel={setHostel} note="Demo hostel labels A–G, not a configured campus."/>
    {error&&<ErrorNotice message={error}/>}
    <Button variant="orange" icon="arrow-forward-outline" onPress={()=>void submit()} loading={busy} disabled={!name.trim()} testID="sign-in-submit">Enter demo workspace</Button>
    <View style={{flexDirection:'row',alignItems:'flex-start',gap:7}}><Icon name="shield-checkmark-outline" size={14} color="#7C8975"/><T style={{fontSize:10,lineHeight:17,color:C.muted,flex:1}}>Local demo sign-in. No university credentials needed.{'\n'}Your session ends when you reload or sign out.</T></View>
  </View>;
}
function RealForm({hostel, setHostel}: {hostel: string; setHostel: (value: string) => void}) {
  const {signIn,signUp} = useApp();
  const [create,setCreate]=useState(false);
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState('');
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  async function submit() {
    if(busy||!email.trim()||!password||(create&&!name.trim()))return;
    setBusy(true);setError(null);
    try{if(create)await signUp(email.trim(),password,name,hostel);else await signIn(email.trim(),password);router.replace('/');}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <View style={{gap:17}}>
    {create&&<View><Label>Your name</Label><TextInput testID="name-input" accessibilityLabel="Your name" autoComplete="name" textContentType="name" value={name} onChangeText={setName} maxLength={80} returnKeyType="next" style={[common.input,{marginTop:8}]}/></View>}
    <View><Label>Email</Label><TextInput testID="email-input" accessibilityLabel="Email" autoComplete="email" keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" value={email} onChangeText={setEmail} maxLength={254} returnKeyType="next" style={[common.input,{marginTop:8}]}/></View>
    <View><Label>Password</Label><TextInput testID="password-input" accessibilityLabel="Password" secureTextEntry autoComplete={create?'new-password':'current-password'} textContentType={create?'newPassword':'password'} value={password} onChangeText={setPassword} maxLength={72} returnKeyType="go" returnKeyLabel={create?'Create account':'Sign in'} onSubmitEditing={()=>void submit()} style={[common.input,{marginTop:8}]}/></View>
    {create&&<HostelPicker hostel={hostel} setHostel={setHostel} note="Hostel blocks A–G, not a configured campus."/>}
    {error&&<ErrorNotice message={error}/>}
    <Button variant="orange" icon="arrow-forward-outline" onPress={()=>void submit()} loading={busy} disabled={!email.trim()||!password||(create&&!name.trim())} testID={create?'sign-up-submit':'sign-in-submit'}>{create?'Create account':'Sign in'}</Button>
    <Pressable accessibilityRole="link" testID="mode-toggle" accessibilityLabel={create?'Sign in instead':'Create an account'} onPress={()=>{setCreate(!create);setError(null);}} style={{alignSelf:'flex-start'}}><T style={{fontFamily:'DMSansBold',fontSize:12,color:C.forest}}>{create?'Already have an account? Sign in':'New here? Create an account'}</T></Pressable>
    <View style={{flexDirection:'row',alignItems:'flex-start',gap:7}}><Icon name="shield-checkmark-outline" size={14} color="#7C8975"/><T style={{fontSize:10,lineHeight:17,color:C.muted,flex:1}}>Your session stays on this device and ends when you sign out or reload.</T></View>
  </View>;
}
export default function SignIn() {
  const {width} = useWindowDimensions(); const desktop=width>=950; const insets=useSafeAreaInsets();
  const [hostel,setHostel]=useState('C');
  return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,backgroundColor:C.canvas}}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1}}>
      <View style={{flex:1,flexDirection:desktop?'row':'column',minHeight:desktop?780:undefined}}>
        <View style={{flex:1,paddingHorizontal:desktop?72:25,paddingTop:desktop?42:30+insets.top,paddingBottom:40}}>
          <Wordmark/>
          <View style={{maxWidth:410,width:'100%',alignSelf:'center',marginTop:desktop?74:39,gap:24}}>
            <View style={{gap:14}}><Pill icon="leaf-outline">A little closer. A lot easier.</Pill><Heading style={{fontSize:desktop?48:39,lineHeight:desktop?57:48,letterSpacing:-2}}>Campus life.{'\n'}Delivered.</Heading><T style={{fontSize:14,lineHeight:23,color:C.muted,maxWidth:330}}>Your parcels, from Gate 2 to your hostel.{'\n'}One small fee. One less trip.</T></View>
            <View style={{height:1,backgroundColor:C.line,marginVertical:3}}/>
            {AUTH_MODE==='real'?<RealForm hostel={hostel} setHostel={setHostel}/>:<DemoForm hostel={hostel} setHostel={setHostel}/>}
          </View>
          <T style={{fontSize:9,color:'#919A87',marginTop:desktop?66:32,textAlign:desktop?'left':'center'}}>DESIGNED AROUND YOUR CAMPUS DAY.</T>
        </View>
        {desktop&&<View style={{width:'47%',backgroundColor:C.dark,padding:49,justifyContent:'center',gap:28}}>
          <Label style={{color:'#A3BEA7',fontSize:9}}>The campus delivery companion</Label>
          <Heading style={{fontSize:42,lineHeight:52,color:'#F2F5E9',letterSpacing:-1.7}}>From your gate.{'\n'}To your good day.</Heading>
          <View style={{backgroundColor:'#27513D',borderRadius:22,padding:12,transform:[{rotate:'-2deg'}]}}><CampusMap hostel={hostel}/></View>
          <View style={{flexDirection:'row',gap:25,marginTop:8}}>{[{n:'₹10',l:'PER DELIVERY'},{n:'3',l:'SECURE COMPARTMENTS'},{n:'7',l:'PLANNED HOSTEL BLOCKS'}].map(item=><View key={item.l} style={{flex:1,gap:7}}><T style={{fontFamily:'ManropeBold',fontSize:29,lineHeight:36,color:'#F4F5E9'}}>{item.n}</T><Label style={{fontSize:7,letterSpacing:.8,color:'#93B29A'}}>{item.l}</Label></View>)}</View>
          <View style={{flexDirection:'row',gap:8,alignItems:'center',marginTop:14}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:C.orange}}/><T style={{fontSize:10,color:'#A6BFA8'}}>{AUTH_MODE==='demo'?'Demo environment · No real payments or robot movement':'Live campus environment · Sign in with your email'}</T></View>
        </View>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
