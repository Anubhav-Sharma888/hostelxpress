import React, {useState} from 'react';
import {Linking, Pressable, View} from 'react-native';
import {router} from 'expo-router';
import {AUTH_MODE} from '../api';
import {COLORS as C} from '../model';
import {Card, Heading, Icon, Label, PageTitle, T} from '../ui';

const supportPhone = process.env.EXPO_PUBLIC_SUPPORT_PHONE?.trim() ?? '';
const hasSupportPhone = /^\+[1-9]\d{7,14}$/.test(supportPhone);

const items: {q: string; a: string; aReal?: string; tag: string}[] = [
  {
    q: 'Rover arrived but compartment latch hasn’t released?',
    tag: 'HARDWARE LOCK',
    a: 'Keep the compartment closed. Payment confirmation and physical latch release are separate hardware events. The rover acknowledges unlock over optical/hall-effect sensors. If the lid does not pop open within 15 seconds of confirmed payment, call HostelXpress support.',
    aReal: 'Keep the compartment closed. Payment confirmation and physical latch release are separate events. Wait for the order screen to confirm that your bay is open. If it stays closed, call HostelXpress support.',
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
  const [dialError, setDialError] = useState(false);

  return (
    <View style={{gap: 20}}>
      <PageTitle
        eyebrow="Campus Rover Support"
        title="Diagnostic & Help Desk"
        description="Contact the HostelXpress team, check your delivery, or get pickup help."
      />

      <View style={{flexDirection: 'row', gap: 14, flexWrap: 'wrap'}}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Call HostelXpress support"
          accessibilityState={{disabled: !hasSupportPhone}}
          disabled={!hasSupportPhone}
          onPress={() => {
            setDialError(false);
            void Linking.openURL('tel:' + supportPhone).catch(() => setDialError(true));
          }}
          style={({pressed}) => ({
            flex: 1,
            minWidth: 240,
            borderRadius: 14,
            backgroundColor: C.dark,
            padding: 18,
            gap: 12,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="call" size={22} color={C.orange} />
          <View>
            <Heading style={{fontSize: 18, lineHeight: 24, color: C.white}}>HostelXpress support</Heading>
            <T style={{fontSize: 12, color: C.lavender, marginTop: 2}}>
              {hasSupportPhone ? supportPhone : 'Support phone unavailable in this build'}
            </T>
            {dialError && <T accessibilityRole="alert" style={{fontSize: 12, color: C.lavender}}>Open your phone app to call this number.</T>}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/deliveries')}
          style={({pressed}) => ({
            flex: 1,
            minWidth: 240,
            borderRadius: 14,
            backgroundColor: C.pale,
            padding: 18,
            gap: 12,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="pulse-outline" size={22} color={C.primary} />
          <View>
            <Heading style={{fontSize: 18, lineHeight: 24}}>Track your delivery</Heading>
            <T style={{fontSize: 12, color: C.muted, marginTop: 2}}>Open an active delivery to check its rover and pickup status.</T>
          </View>
        </Pressable>
      </View>

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
