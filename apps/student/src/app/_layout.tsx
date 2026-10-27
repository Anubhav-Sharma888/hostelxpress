import React from 'react';
import {View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {useFonts} from 'expo-font';
import {DMSans_400Regular} from '@expo-google-fonts/dm-sans/400Regular';
import {DMSans_500Medium} from '@expo-google-fonts/dm-sans/500Medium';
import {DMSans_700Bold} from '@expo-google-fonts/dm-sans/700Bold';
import {Manrope_700Bold} from '@expo-google-fonts/manrope/700Bold';
import {AppProvider} from '../state';
import {AppShell} from '../components/AppShell';
import {COLORS} from '../model';
import {Loading} from '../ui';
export default function Layout() {
  const [loaded,error] = useFonts({DMSans:DMSans_400Regular,DMSansMedium:DMSans_500Medium,DMSansBold:DMSans_700Bold,ManropeBold:Manrope_700Bold});
  if (!loaded && !error) return <View style={{flex:1,backgroundColor:COLORS.canvas,justifyContent:'center'}}><Loading label="Opening your campus space…"/></View>;
  return <SafeAreaProvider><AppProvider><StatusBar style="dark"/><AppShell/></AppProvider></SafeAreaProvider>;
}
