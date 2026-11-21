import React from 'react';
import {Pressable, View} from 'react-native';
import {HOSTELS, isCampusHostel} from '../campus';
import {COLORS as C} from '../model';
import {Label, T} from '../ui';

export function HostelPicker({hostel, setHostel, note, label = 'Your hostel'}: {
  hostel: string; setHostel: (value: string) => void; note: string; label?: string;
}) {
  return <View style={{gap: 12}}>
    <Label>{label}</Label>
    {(['Boys', 'Girls'] as const).map(group => <View key={group} style={{gap: 8}}>
      <T style={{fontFamily: 'DMSansBold', fontSize: 12, color: C.muted}}>{group} hostels</T>
      <View style={{gap: 8}}>
        {HOSTELS.filter(item => item.residents === group).map(item => <Pressable
          key={item.id} accessibilityRole="radio" accessibilityState={{checked: hostel === item.id}}
          aria-checked={hostel === item.id} accessibilityLabel={item.name + ', ' + group}
          onPress={() => setHostel(item.id)}
          style={{minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10,
            borderWidth: 1, borderColor: hostel === item.id ? C.lime : C.line,
            backgroundColor: hostel === item.id ? C.forest : C.white}}>
          <T style={{fontFamily: 'DMSansBold', color: hostel === item.id ? C.white : C.ink}}>
            {item.name}
          </T>
        </Pressable>)}
      </View>
    </View>)}
    <T style={{fontSize: 11, color: C.muted}}>
      {hostel && !isCampusHostel(hostel)
        ? 'Your saved hostel needs updating. Choose your current hostel from the list.'
        : note}
    </T>
  </View>;
}
