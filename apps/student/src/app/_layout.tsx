import React from 'react';
import {View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {useFonts} from 'expo-font';
import {AppProvider} from '../state';
import {AppShell} from '../components/AppShell';
import {COLORS} from '../model';
import {Loading} from '../ui';
export default function Layout() {
  const [loaded,error] = useFonts({
    DMSans:require('../../assets/fonts/PlusJakartaSans-Regular.ttf'),
    DMSansMedium:require('../../assets/fonts/PlusJakartaSans-Medium.ttf'),
    DMSansBold:require('../../assets/fonts/PlusJakartaSans-Bold.ttf'),
    ManropeBold:require('../../assets/fonts/PlusJakartaSans-Bold.ttf'),
    JakartaExtraBold:require('../../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
  });
  if (!loaded && !error) return <View style={{flex:1,backgroundColor:COLORS.canvas,justifyContent:'center'}}><Loading label="Opening your campus space…"/></View>;
  return <SafeAreaProvider><AppProvider><StatusBar style="dark"/><AppShell/></AppProvider></SafeAreaProvider>;
}
