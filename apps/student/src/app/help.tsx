import React, {useState} from 'react';
import {Linking, Pressable, View} from 'react-native';
import {AUTH_MODE} from '../api';
import {COLORS as C} from '../model';
import {Card, Heading, Icon, Label, PageTitle, T} from '../ui';

const items: {q: string; a: string; aReal?: string; tag: string}[] = [
  {
    q: 'Rover arrived but compartment latch hasn’t released?',
    tag: 'HARDWARE LOCK',
    a: 'Keep the compartment closed. Payment confirmation and physical latch release are separate hardware events. The rover acknowledges unlock over optical/hall-effect sensors. If the lid does not pop open within 15 seconds of confirmed payment, tap the Gate 2 radio line below.',
    aReal: 'Keep the compartment closed. Payment confirmation and physical latch release are separate events. Wait for a fresh device acknowledgement over the authenticated connector.',
  },
  {
    q: 'When do I pay the ₹10 fee?',
    tag: 'PAYMENT',
    a: 'Pay only after the parcel arrives. In the current demo the QR is nonpayable, and the explicitly labelled simulation records a test payment. A live delivery must use a verified Razorpay payment before the backend requests an unlock.',
    aReal: 'Pay only after the parcel arrives. Your payment is verified through Razorpay before the backend requests an unlock.',
  },
  {
    q: 'Why does tracking say “Telemetry stale”?',
    tag: 'TELEMETRY',
    a: 'The app marks rover telemetry stale after 15 seconds without an MQTT pulse. It preserves the last received status and never invents fake GPS coordinates or ETAs. The campus schematic provides stage progress, not live satellite routing.',
  },
  {
    q: 'What if my rider misses the 5-minute loading window?',
    tag: 'DISPATCH',
    a: 'The server automatically releases the reserved compartment if loading is not completed within 5 minutes at Gate 2. Once loaded, departure occurs when all three bays are full or the dispatch countdown expires.',
  },
  {
    q: 'What are the Night Delivery Curfew Rules (1:30 AM - 6:00 AM)?',
    tag: 'CURFEW',
    a: 'Autonomous rovers operate 24/7 during campus curfew. Parcels and late-night tuck shop orders are dropped exclusively at designated hostel security porches. Roaming outside hostel gates during curfew is strictly avoided.',
  },
  {
    q: 'What happens to incident security camera footage?',
    tag: 'SAFETY & RETENTION',
    a: 'Rover cameras record a rolling buffer during transit. Confirmed lid re-closure after safe retrieval permits buffer deletion. A forced lid, collision, or uncollected bay preserves the last 2 minutes for authorized campus security review.',
    aReal: 'Cameras record a rolling buffer until collection is confirmed. Tamper or collision triggers retain footage for operator review.',
  },
];

export default function Help() {
  const [open, setOpen] = useState<number | null>(0);
  const [probeActive, setProbeActive] = useState(false);

  return (
    <View style={{gap: 20}}>
      <PageTitle
        eyebrow="Campus Rover Support"
        title="Diagnostic & Help Desk"
        description="Live fleet telemetry status, instant operator line, and hardware troubleshooting."
      />

      {/* Stitch System Status Banner */}
      <Card style={{padding: 16, borderRadius: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 200, flex: 1}}>
            <View style={{position: 'relative', width: 28, height: 28, borderRadius: 14, backgroundColor: '#DDF4C5', alignItems: 'center', justifyContent: 'center'}}>
              <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: C.lime}} />
            </View>
            <View>
              <Heading style={{fontSize: 16, lineHeight: 22}}>Fleet Telemetry Active</Heading>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1}}>
                <Icon name="checkmark-circle" size={14} color={C.primary} />
                <T style={{fontSize: 11, fontFamily: 'DMSansBold', color: C.primary}}>All campus rovers operating normally</T>
              </View>
            </View>
          </View>
          <View style={{backgroundColor: C.pale, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignItems: 'center'}}>
            <Label style={{fontSize: 8, color: C.muted}}>Gate 2 Ping</Label>
            <T style={{fontSize: 12, fontFamily: 'DMSansBold', color: C.ink}}>14 ms</T>
          </View>
        </View>
      </Card>

      {/* Stitch Priority Emergency / Direct Dispatch Actions (2 Cards) */}
      <View style={{flexDirection: 'row', gap: 14, flexWrap: 'wrap'}}>
        {/* Gate 2 Post Direct Radio Line */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Call Gate 2 Post Radio Line"
          onPress={() => Linking.openURL('tel:+919876543210').catch(() => undefined)}
          style={({pressed}) => [{
            flex: 1,
            minWidth: 240,
            borderRadius: 14,
            backgroundColor: C.dark,
            padding: 18,
            gap: 16,
            opacity: pressed ? 0.85 : 1,
            shadowColor: '#141B2B',
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.1,
            shadowRadius: 8,
          }]}
        >
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <View style={{width: 38, height: 38, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name="call" size={20} color={C.orange} />
            </View>
            <View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: C.orange}}>
              <T style={{fontFamily: 'DMSansBold', fontSize: 9, color: '#102000', letterSpacing: 0.8}}>SOS 24/7</T>
            </View>
          </View>
          <View>
            <Heading style={{fontSize: 18, lineHeight: 24, color: '#FFFFFF'}}>Gate 2 Security Post</Heading>
            <T style={{fontSize: 12, color: '#C4C1FB', marginTop: 2}}>Direct Security Deck Radio Line</T>
          </View>
        </Pressable>

        {/* AI Dispatcher Diagnostic Probe */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Telemetry Diagnostic Probe"
          onPress={() => setProbeActive(!probeActive)}
          style={({pressed}) => [{
            flex: 1,
            minWidth: 240,
            borderRadius: 14,
            backgroundColor: C.lime,
            padding: 18,
            gap: 16,
            opacity: pressed ? 0.85 : 1,
            shadowColor: '#84CC16',
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.2,
            shadowRadius: 8,
          }]}
        >
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <View style={{width: 38, height: 38, borderRadius: 10, backgroundColor: '#65A30D', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name="hardware-chip" size={20} color={C.onLime} />
            </View>
            <View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: C.dark}}>
              <T style={{fontFamily: 'DMSansBold', fontSize: 9, color: C.lime, letterSpacing: 0.8}}>LIVE BOT</T>
            </View>
          </View>
          <View>
            <Heading style={{fontSize: 18, lineHeight: 24, color: C.onLime}}>AI Dispatcher</Heading>
            <T style={{fontSize: 12, color: C.onLime, marginTop: 2}}>Sensor Diagnostics & Latch Probe</T>
          </View>
        </Pressable>
      </View>

      {/* Interactive Telemetry Diagnostic Probe Box */}
      {probeActive && (
        <Card style={{padding: 18, borderRadius: 14, backgroundColor: '#E1E8FD', gap: 10}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <Icon name="pulse-outline" size={18} color={C.primary} />
              <Heading style={{fontSize: 15, lineHeight: 20}}>Telemetry Diagnostic Probe</Heading>
            </View>
            <Pressable onPress={() => setProbeActive(false)} style={{padding: 4}}>
              <Icon name="close-circle-outline" size={18} color={C.muted} />
            </Pressable>
          </View>
          <View style={{backgroundColor: C.white, borderRadius: 8, padding: 12, gap: 4}}>
            <T style={{fontFamily: 'DMSansBold', fontSize: 11, color: C.primary}}>[Rover #04-Vanguard Telemetry Stream]</T>
            <T style={{fontSize: 11, color: C.muted}}>LiDAR Grid: CLEAR · 4G LTE Ping: -58dBm</T>
            <T style={{fontSize: 11, color: C.muted}}>Compartment Solenoid Bays 1–3: ARMED &amp; HEALTHY</T>
          </View>
        </Card>
      )}

      {/* Frequently Asked Troubleshooting Accordion */}
      <View style={{gap: 12}}>
        <Heading style={{fontSize: 20, lineHeight: 28, letterSpacing: -0.4}}>Troubleshooting Guide</Heading>
        {items.map((item, i) => (
          <Card key={item.q} style={{padding: 18, borderRadius: 14}}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{expanded: open === i}}
              aria-expanded={open === i}
              accessibilityLabel={item.q}
              onPress={() => setOpen(open === i ? null : i)}
              style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44}}
            >
              <View style={{flex: 1, minWidth: 0, gap: 4}}>
                <View style={{alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, backgroundColor: C.lavender}}>
                  <Label style={{fontSize: 8, letterSpacing: 0.8, color: C.primary}}>{item.tag}</Label>
                </View>
                <T style={{fontFamily: 'DMSansBold', fontSize: 14, lineHeight: 21}}>{item.q}</T>
              </View>
              <Icon name={open === i ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={C.primary} />
            </Pressable>
            {open === i && (
              <View style={{borderTopWidth: 1, borderTopColor: C.line, marginTop: 12, paddingTop: 12}}>
                <T style={{color: C.muted, fontSize: 13, lineHeight: 22}}>
                  {AUTH_MODE === 'real' && item.aReal ? item.aReal : item.a}
                </T>
              </View>
            )}
          </Card>
        ))}
      </View>
    </View>
  );
}
