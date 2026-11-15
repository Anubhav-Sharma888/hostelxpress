import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View} from 'react-native';
import {router} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AUTH_MODE} from '../api';
import {QA_PREVIEW} from '../qa';
import {HostelPicker} from '../components/HostelPicker';
import {Wordmark} from '../components/AppShell';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Button, common, ErrorNotice, Heading, Icon, Label, T} from '../ui';

function DemoForm({hostel, setHostel}: {hostel: string; setHostel: (value: string) => void}) {
  const {signIn} = useApp();
  const [name, setName] = useState('Anubhav');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(targetName = name, targetHostel = hostel) {
    if (busy || !targetName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(targetName.trim(), targetHostel);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{gap: 16}}>
      <View>
        <Label style={{fontSize: 10, letterSpacing: 0.8, color: C.muted}}>Student Name</Label>
        <TextInput
          testID="name-input"
          accessibilityLabel="Your name"
          autoComplete="name"
          textContentType="givenName"
          value={name}
          onChangeText={setName}
          maxLength={80}
          returnKeyType="next"
          style={[common.input, {marginTop: 6}]}
        />
      </View>
      <HostelPicker hostel={hostel} setHostel={setHostel} note="Select your hostel drop-off point (Blocks A–G)." />
      {error && <ErrorNotice message={error} />}
      <Button
        variant="primary"
        icon="flash-outline"
        onPress={() => void submit()}
        loading={busy}
        disabled={!name.trim()}
        testID="sign-in-submit"
        accessibilityLabel="Sign in to Mission Console"
      >
        Sign In to Mission Console
      </Button>

      {/* Stitch Demo Fast-Track Card */}
      <View style={{marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: C.lavender, borderWidth: 1, borderColor: '#DCE2F7', gap: 10}}>
        <View style={common.between}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <Icon name="speedometer-outline" size={18} color="#9D4300" />
            <T style={{fontFamily: 'DMSansBold', fontSize: 13, color: C.ink}}>Demo Fast-Track</T>
          </View>
          <View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: C.peach}}>
            <T style={{fontFamily: 'DMSansBold', fontSize: 9, color: '#7C3300', letterSpacing: 0.5}}>INSTANT ROLE SWITCH</T>
          </View>
        </View>
        <T style={{fontSize: 11, lineHeight: 16, color: C.muted}}>
          Bypass standard authentication to test telemetry, delivery compartments, and merchant dispatch nodes.
        </T>
        <View style={{gap: 8, marginTop: 2}}>
          {/* Student Fast-Track Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fast track as Student Alex"
            onPress={() => void submit('Alex Rivers', 'B')}
            style={({pressed}) => [{
              minHeight: 48,
              padding: 10,
              borderRadius: 8,
              backgroundColor: C.white,
              borderWidth: 1,
              borderColor: C.line,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <View style={{width: 32, height: 32, borderRadius: 16, backgroundColor: '#D8D4FF', alignItems: 'center', justifyContent: 'center'}}>
                <Icon name="person" size={17} color={C.primary} />
              </View>
              <View>
                <T style={{fontFamily: 'DMSansBold', fontSize: 12}}>Student</T>
                <T style={{fontSize: 10, color: C.muted}}>Alex · Tagore B Dropoff</T>
              </View>
            </View>
            <Icon name="flash" size={16} color={C.lime} />
          </Pressable>

          {/* Merchant Staff Fast-Track Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fast track as Merchant Domino's"
            onPress={() => router.push('/merchant' as never)}
            style={({pressed}) => [{
              minHeight: 48,
              padding: 10,
              borderRadius: 8,
              backgroundColor: C.white,
              borderWidth: 1,
              borderColor: C.line,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <View style={{width: 32, height: 32, borderRadius: 16, backgroundColor: C.peach, alignItems: 'center', justifyContent: 'center'}}>
                <Icon name="storefront-outline" size={17} color="#9D4300" />
              </View>
              <View>
                <T style={{fontFamily: 'DMSansBold', fontSize: 12}}>Merchant Staff</T>
                <T style={{fontSize: 10, color: C.muted}}>Domino&apos;s Campus Hub</T>
              </View>
            </View>
            <Icon name="flash" size={16} color={C.lime} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function RealForm({hostel, setHostel}: {hostel: string; setHostel: (value: string) => void}) {
  const {signIn, signUp, enterQaPreview} = useApp();
  const [create, setCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || !email.trim() || !password || (create && !name.trim())) return;
    setBusy(true);
    setError(null);
    try {
      if (create) await signUp(email.trim(), password, name, hostel);
      else await signIn(email.trim(), password);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{gap: 16}}>
      {create && (
        <View>
          <Label style={{fontSize: 10, letterSpacing: 0.8, color: C.muted}}>Your name</Label>
          <TextInput
            testID="name-input"
            accessibilityLabel="Your name"
            autoComplete="name"
            textContentType="name"
            value={name}
            onChangeText={setName}
            maxLength={80}
            returnKeyType="next"
            style={[common.input, {marginTop: 6}]}
          />
        </View>
      )}
      <View>
        <Label style={{fontSize: 10, letterSpacing: 0.8, color: C.muted}}>Campus Email</Label>
        <TextInput
          testID="email-input"
          accessibilityLabel="Email"
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          maxLength={254}
          returnKeyType="next"
          placeholder="e.g. alex.tagoreb@campus.edu"
          placeholderTextColor={C.muted}
          style={[common.input, {marginTop: 6}]}
        />
      </View>
      <View>
        <Label style={{fontSize: 10, letterSpacing: 0.8, color: C.muted}}>Password</Label>
        <TextInput
          testID="password-input"
          accessibilityLabel="Password"
          secureTextEntry
          autoComplete={create ? 'new-password' : 'current-password'}
          textContentType={create ? 'newPassword' : 'password'}
          value={password}
          onChangeText={setPassword}
          maxLength={72}
          returnKeyType="go"
          returnKeyLabel={create ? 'Create account' : 'Sign in'}
          onSubmitEditing={() => void submit()}
          style={[common.input, {marginTop: 6}]}
        />
      </View>
      {create && <HostelPicker hostel={hostel} setHostel={setHostel} note="Hostel blocks A–G, not a configured campus." />}
      {error && <ErrorNotice message={error} />}
      <Button
        variant="primary"
        icon="flash-outline"
        onPress={() => void submit()}
        loading={busy}
        disabled={!email.trim() || !password || (create && !name.trim())}
        testID={create ? 'sign-up-submit' : 'sign-in-submit'}
        accessibilityLabel={create ? 'Create account' : 'Sign in'}
      >
        {create ? 'Create Mission Account' : 'Sign In to Mission Console'}
      </Button>
      <Pressable
        accessibilityRole="link"
        testID="mode-toggle"
        accessibilityLabel={create ? 'Sign in instead' : 'Create an account'}
        onPress={() => {
          setCreate(!create);
          setError(null);
        }}
        style={{alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center'}}
      >
        <T style={{fontFamily: 'DMSansBold', fontSize: 12, color: C.primary}}>
          {create ? 'Already registered? Sign in' : 'New student? Register hostel room'}
        </T>
      </Pressable>
      {QA_PREVIEW && (
        <View style={{marginTop: 10, padding: 14, borderRadius: 12, backgroundColor: C.dark, borderWidth: 1, borderColor: C.dark, gap: 8}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Icon name="construct-outline" size={17} color={C.lime} />
            <T style={{fontFamily: 'DMSansBold', fontSize: 13, color: C.lime}}>QA PREVIEW</T>
            <T style={{fontSize: 10, color: '#CBD5E1'}}>offline · no backend calls</T>
          </View>
          <T style={{fontSize: 11, lineHeight: 16, color: '#CBD5E1'}}>
            Skips authentication entirely. The app runs on sample data from memory; nothing reaches Supabase, the API, payments, or rovers.
          </T>
          <Button
            variant="secondary"
            icon="play-skip-forward-outline"
            onPress={() => {
              enterQaPreview();
              router.replace('/');
            }}
            disabled={busy}
            testID="qa-skip-sign-in"
            accessibilityLabel="Skip sign-in for testing"
          >
            Skip sign-in for testing
          </Button>
        </View>
      )}
    </View>
  );
}

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [hostel, setHostel] = useState('C');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1, backgroundColor: C.canvas}}>
      {/* Stitch Deep Indigo Header */}
      <View style={{paddingTop: insets.top, minHeight: 64 + insets.top, paddingHorizontal: 20, backgroundColor: C.dark, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12}}>
        <Wordmark light small subtitle="CAMPUS ROVER LOGISTICS" />
        <View style={{backgroundColor: '#1E293B', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10, flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: '#334155'}}>
          <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime}} />
          <T style={{fontSize: 9, lineHeight: 15, color: '#ACF847', fontFamily: 'DMSansBold', letterSpacing: 0.8}}>GATE 2 LIVE</T>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow: 1, padding: 20, paddingTop: 16, paddingBottom: 28 + insets.bottom, alignItems: 'center'}}>
        <View style={{width: '100%', maxWidth: 448, gap: 20}}>
          {/* Stitch Hero Section */}
          <View style={{alignItems: 'center', gap: 10, paddingVertical: 8}}>
            <View style={{width: 56, height: 56, borderRadius: 16, backgroundColor: C.dark, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.15, shadowRadius: 8}}>
              <Icon name="flash" size={32} color={C.lime} />
            </View>
            <Heading style={{fontSize: 24, lineHeight: 32, letterSpacing: -0.6, textAlign: 'center', color: C.ink}}>
              Autonomous Gate 2 Deliveries.
            </Heading>
            <T style={{fontSize: 13, lineHeight: 20, color: C.muted, textAlign: 'center', maxWidth: 360}}>
              Food, parcels, and essentials routed to Tagore, Sarojini, and Bhabha hostels.
            </T>
          </View>

          {/* Stitch Primary Card */}
          <View style={{padding: 22, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, gap: 20, shadowColor: '#141B2B', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.05, shadowRadius: 10}}>
            <View style={{gap: 4}}>
              <Heading style={{fontSize: 20, lineHeight: 27, letterSpacing: -0.4}}>Campus Sign In</Heading>
              <T style={{fontSize: 12, lineHeight: 18, color: C.muted}}>
                {AUTH_MODE === 'demo' ? 'Enter university name or demo fast-track' : 'Enter university credentials or demo fast-track'}
              </T>
            </View>
            {AUTH_MODE === 'real' ? <RealForm hostel={hostel} setHostel={setHostel} /> : <DemoForm hostel={hostel} setHostel={setHostel} />}
          </View>

          {/* Curfew Operating Policy Pill */}
          <View style={{alignSelf: 'center', backgroundColor: '#E1E8FD', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Icon name="moon-outline" color="#9D4300" size={16} />
            <T style={{fontSize: 11, lineHeight: 16, color: C.ink, fontFamily: 'DMSansMedium'}}>
              Curfew Operating Policy <T style={{fontFamily: 'DMSansBold', color: '#9D4300'}}>(1:30 AM - 6:00 AM)</T>
            </T>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
