import React, {ComponentProps} from 'react';
import {ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {COLORS as C, STATUS_COPY} from './model';
import type {OrderStatus} from './api';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({name, size = 20, color = C.forest}: {name: IconName; size?: number; color?: string}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function T({style, ...props}: TextProps) {
  return <Text {...props} style={[{fontFamily: 'DMSans', color: C.ink, fontSize: 14, lineHeight: 21}, style]} />;
}
export function Heading({children, style}: {children: React.ReactNode; style?: StyleProp<TextStyle>}) {
  return <T accessibilityRole="header" style={[{fontFamily: 'ManropeBold', fontSize: 30, lineHeight: 39, letterSpacing: -1.1}, style]}>{children}</T>;
}
export function Label({children, style}: {children: React.ReactNode; style?: StyleProp<TextStyle>}) {
  return <T style={[{fontFamily: 'DMSansBold', fontSize: 10, lineHeight: 16, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted}, style]}>{children}</T>;
}
export function Button({children, onPress, icon, variant = 'primary', loading, disabled, small, testID}: {
  children: string; onPress: () => void; icon?: IconName; variant?: 'primary' | 'orange' | 'secondary' | 'ghost';
  loading?: boolean; disabled?: boolean; small?: boolean; testID?: string;
}) {
  const light = variant === 'primary';
  const color = light ? C.white : C.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={children} accessibilityState={{disabled: disabled || loading}} disabled={disabled || loading} testID={testID} onPress={onPress}
    style={({pressed}) => [{minHeight: small ? 38 : 48, paddingHorizontal: small ? 14 : 20, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
      backgroundColor: variant === 'primary' ? C.forest : variant === 'orange' ? C.orange : variant === 'secondary' ? C.pale : 'transparent',
      borderWidth: variant === 'ghost' ? 1 : 0, borderColor: C.line, opacity: disabled || loading ? 0.55 : pressed ? 0.8 : 1}]}>
      {loading ? <ActivityIndicator size="small" color={color} /> : icon ? <Icon name={icon} color={color} size={17} /> : null}
      <T style={{fontFamily: 'DMSansBold', color, fontSize: small ? 12 : 13}}>{children}</T>
    </Pressable>;
}
export function Pill({children, tone = 'green', icon}: {children: string; tone?: 'green' | 'orange' | 'neutral' | 'red'; icon?: IconName}) {
  const foreground = tone === 'red' ? C.danger : tone === 'orange' ? '#9D542B' : tone === 'neutral' ? '#687268' : C.forest;
  const background = tone === 'red' ? '#FBE8E4' : tone === 'orange' ? C.peach : tone === 'neutral' ? C.pale : '#E8F1E8';
  return <View style={{flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5, backgroundColor: background, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20}}>
    {icon && <Icon name={icon} size={12} color={foreground} />}<T style={{fontFamily: 'DMSansMedium', fontSize: 10, lineHeight: 16, color: foreground}}>{children}</T>
  </View>;
}
export function StatusPill({status}: {status: OrderStatus}) {
  return <Pill tone={status === 'Failed' ? 'red' : status === 'Arrived' || status === 'Paid' ? 'orange' : 'green'}>{STATUS_COPY[status].label}</Pill>;
}
export function Card({children, style}: {children: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  return <View style={[{backgroundColor: C.white, borderRadius: 17, borderWidth: 1, borderColor: C.line, padding: 23}, style]}>{children}</View>;
}
export function ErrorNotice({message, retry}: {message: string; retry?: () => void}) {
  return <View accessibilityRole="alert" style={{backgroundColor: '#FDF0E9', borderColor: '#EDC9B9', borderWidth: 1, padding: 14, borderRadius: 10, gap: 8}}>
    <T style={{color: C.danger, fontSize: 12}}>{message}</T>{retry && <Button small variant="ghost" onPress={retry}>Try again</Button>}
  </View>;
}
export function Loading({label = 'Checking your deliveries…'}: {label?: string}) {
  return <View style={{padding: 55, gap: 15, alignItems: 'center'}}><ActivityIndicator color={C.forest} /><T style={{color: C.muted}}>{label}</T></View>;
}
export function PageTitle({eyebrow, title, description, action}: {eyebrow: string; title: string; description?: string; action?: React.ReactNode}) {
  return <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between', marginBottom: 27}}>
    <View style={{gap: 7, flexShrink: 1}}><Label>{eyebrow}</Label><Heading>{title}</Heading>{description && <T style={{color: C.muted, fontSize: 13}}>{description}</T>}</View>{action}
  </View>;
}
export const common = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  between: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  muted: {color: C.muted}, gap: {gap: 20}, divider: {height: 1, backgroundColor: C.line},
  input: {fontFamily: 'DMSans', backgroundColor: C.white, color: C.ink, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 14, minHeight: 48},
});
