import React, {useState} from 'react';
import {Pressable, TextInput, useWindowDimensions, View} from 'react-native';
import {router, useLocalSearchParams} from 'expo-router';
import {AUTH_MODE} from '../api';
import {HostelPicker} from '../components/HostelPicker';
import {COLORS as C} from '../model';
import {useApp} from '../state';
import {Button, Card, common, ErrorNotice, Heading, Icon, Label, PageTitle, Pill, T} from '../ui';

export default function Profile() {
  const {user, session, signOut, orders, updateProfile} = useApp();
  const {width} = useWindowDimensions();
  const desktop = width >= 1000;
  const {edit} = useLocalSearchParams<{edit?: string}>();
  const [editing, setEditing] = useState(edit === '1');
  const [name, setName] = useState(user?.name || '');
  const [hostel, setHostel] = useState(user?.hostel_block || 'C');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const completedCount = orders.filter(order => order.status === 'Completed').length;

  async function save() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile({name: name.trim(), hostel_block: hostel});
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setName(user?.name || '');
    setHostel(user?.hostel_block || 'C');
    setError(null);
    setSaved(false);
    setEditing(false);
  }

  return (
    <View style={{gap: 20}}>
      <PageTitle
        eyebrow="Campus Profile Settings"
        title="Right at home."
        description="Your profile, verified hostel room, telemetry impact, and rover dispatch presets."
      />

      <View style={{flexDirection: desktop ? 'row' : 'column', gap: 20, alignItems: 'flex-start'}}>
        <View style={{flex: desktop ? 1.4 : undefined, width: '100%', gap: 18}}>
          {/* Stitch Profile Header Card */}
          <Card style={{padding: 20, gap: 18, borderRadius: 16}}>
            <View style={common.between}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
                <View style={{position: 'relative'}}>
                  <View style={{width: 60, height: 60, borderRadius: 16, backgroundColor: C.lavender, borderWidth: 2, borderColor: '#C7C3FE', alignItems: 'center', justifyContent: 'center'}}>
                    <T style={{fontFamily: 'ManropeBold', fontSize: 24, color: C.primary}}>
                      {user?.name.slice(0, 1).toUpperCase()}
                    </T>
                  </View>
                  <View style={{position: 'absolute', bottom: -3, right: -3, width: 20, height: 20, borderRadius: 10, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white}}>
                    <Icon name="checkmark" size={12} color={C.onLime} />
                  </View>
                </View>
                <View style={{flex: 1, minWidth: 0}}>
                  <Heading style={{fontSize: 20, lineHeight: 28, letterSpacing: -0.4}}>{user?.name}</Heading>
                  <T style={{fontSize: 11, color: C.muted}}>Student ID: 2022-CS-084</T>
                  <T style={{fontSize: 10, color: C.primary, marginTop: 1}}>
                    {user?.hostel_block ? 'Hostel Block ' + user.hostel_block + ' Resident' : 'Hostel not configured'}
                  </T>
                </View>
              </View>
              <View style={{backgroundColor: '#E5F0D0', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5}}>
                <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime}} />
                <T style={{fontSize: 10, fontFamily: 'DMSansBold', color: C.primary, letterSpacing: 0.6}}>SYNC OK</T>
              </View>
            </View>

            {/* Stitch Campus Mobility Impact Ticker */}
            <View style={{backgroundColor: C.dark, borderRadius: 12, padding: 16, gap: 10}}>
              <View style={common.between}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <Icon name="flash" size={14} color={C.lime} />
                  <Label style={{color: '#ACF847', letterSpacing: 1.1, fontSize: 10}}>Campus Rover Telemetry</Label>
                </View>
                <T style={{fontSize: 10, color: '#C4C1FB'}}>Semester Total</T>
              </View>
              <View style={{flexDirection: 'row', gap: 10, paddingTop: 4}}>
                <View style={{flex: 1}}>
                  <T style={{fontFamily: 'ManropeBold', fontSize: 24, lineHeight: 30, color: C.lime}}>{completedCount}</T>
                  <T style={{fontSize: 10, color: '#EDF0FF', marginTop: 2}}>Safe Handoffs</T>
                </View>
                <View style={{flex: 1}}>
                  <T style={{fontFamily: 'ManropeBold', fontSize: 24, lineHeight: 30, color: '#EDF0FF'}}>0</T>
                  <T style={{fontSize: 10, color: '#EDF0FF', marginTop: 2}}>Loss Events</T>
                </View>
                <View style={{flex: 1}}>
                  <T style={{fontFamily: 'ManropeBold', fontSize: 24, lineHeight: 30, color: C.orange}}>42m</T>
                  <T style={{fontSize: 10, color: '#EDF0FF', marginTop: 2}}>Saved vs Gate 2</T>
                </View>
              </View>
            </View>

            {saved && !editing && (
              <View>
                <Pill tone="green" icon="checkmark-circle-outline">Profile saved successfully</Pill>
              </View>
            )}

            {/* Drop Dock Preset Section */}
            <View style={{borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16, gap: 14}}>
              <View style={common.between}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Icon name="business-outline" size={20} color={C.primary} />
                  <Heading style={{fontSize: 18, lineHeight: 26}}>Drop Dock Preset</Heading>
                </View>
                {!editing && (
                  <Button
                    small
                    variant="secondary"
                    icon="create-outline"
                    onPress={() => {
                      setSaved(false);
                      setError(null);
                      setEditing(true);
                    }}
                    testID="profile-edit"
                    accessibilityLabel="Edit profile"
                  >
                    Edit
                  </Button>
                )}
              </View>

              {editing ? (
                <View style={{gap: 16}}>
                  <View>
                    <Label style={{fontSize: 10, letterSpacing: 0.8, color: C.muted}}>Student Name</Label>
                    <TextInput
                      testID="profile-name-input"
                      accessibilityLabel="Your name"
                      autoComplete="name"
                      textContentType="name"
                      value={name}
                      onChangeText={setName}
                      maxLength={120}
                      returnKeyType="done"
                      onSubmitEditing={() => void save()}
                      style={[common.input, {marginTop: 6}]}
                    />
                  </View>
                  <HostelPicker hostel={hostel} setHostel={setHostel} note="Select your primary hostel block (A–G)." />
                  {error && <ErrorNotice message={error} />}
                  <View style={[common.row, {flexWrap: 'wrap'}]}>
                    <Button
                      variant="primary"
                      icon="checkmark-outline"
                      onPress={() => void save()}
                      loading={busy}
                      disabled={!name.trim()}
                      testID="profile-save"
                      accessibilityLabel="Save changes"
                    >
                      Save changes
                    </Button>
                    <Button variant="ghost" icon="close-outline" onPress={cancel} disabled={busy}>
                      Cancel
                    </Button>
                  </View>
                </View>
              ) : (
                <View style={{backgroundColor: C.pale, borderRadius: 10, padding: 14, gap: 10}}>
                  <View style={common.between}>
                    <T style={{fontSize: 12, color: C.muted}}>Default Destination Drop</T>
                    <T style={{fontFamily: 'DMSansBold', fontSize: 13}}>
                      {user?.hostel_block ? 'Hostel Block ' + user.hostel_block + ' Porch' : 'Not configured'}
                    </T>
                  </View>
                  <View style={common.between}>
                    <T style={{fontSize: 12, color: C.muted}}>Autonomous Pickup Hub</T>
                    <T style={{fontFamily: 'DMSansBold', fontSize: 13}}>Gate 2 Security Deck</T>
                  </View>
                  <View style={common.between}>
                    <T style={{fontSize: 12, color: C.muted}}>Environment</T>
                    <Pill tone="orange">{session?.mode === 'demo' ? 'Local Demo Mode' : 'Campus Live'}</Pill>
                  </View>
                </View>
              )}
            </View>

            <View style={{borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Help and support"
                onPress={() => router.push('/help')}
                style={{minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8}}
              >
                <Icon name="help-circle-outline" size={18} color={C.primary} />
                <T style={{fontFamily: 'DMSansBold', fontSize: 12, color: C.primary}}>Help & Support Desk</T>
              </Pressable>
              <Button variant="ghost" icon="log-out-outline" onPress={signOut} accessibilityLabel="Sign out">
                Sign out
              </Button>
            </View>
          </Card>
        </View>

        {/* Stitch Curfew & Privacy Sidebar Cards */}
        <View style={{flex: desktop ? 1 : undefined, width: '100%', gap: 16}}>
          <Card style={{gap: 12, backgroundColor: C.dark, borderColor: '#293349', padding: 20, borderRadius: 16}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <Icon name="moon" size={24} color={C.orange} />
              <Heading style={{fontSize: 18, lineHeight: 24, color: '#FFFFFF'}}>Curfew Operating Policy</Heading>
            </View>
            <T style={{fontSize: 12, lineHeight: 19, color: '#C4C1FB'}}>
              Rover dispatches between 1:30 AM and 6:00 AM follow campus curfew safety protocols. Delivery to hostel main porch drop points only.
            </T>
            <View style={{backgroundColor: '#20293A', borderRadius: 8, padding: 10, marginTop: 4}}>
              <T style={{fontSize: 11, color: C.lime, fontFamily: 'DMSansBold'}}>✓ Autonomous fleet operating 24/7</T>
            </View>
          </Card>

          <Card style={{gap: 12, backgroundColor: C.white, borderRadius: 16, padding: 20}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <Icon name="shield-checkmark-outline" size={22} color={C.primary} />
              <Heading style={{fontSize: 17, lineHeight: 24}}>Privacy & Session Security</Heading>
            </View>
            <T style={{fontSize: 12, lineHeight: 19, color: C.muted}}>
              {AUTH_MODE === 'demo'
                ? 'Demo sessions remain securely in memory on this device. Closing or reloading the tab ends the session.'
                : 'Your session token is kept securely in memory. No payment or secret credentials are ever stored in client code.'}
            </T>
          </Card>
        </View>
      </View>
    </View>
  );
}
