import React from 'react';
import {Pressable, View} from 'react-native';
import {COLORS as C} from '../model';
import {Label, T} from '../ui';

const BLOCKS = ['A','B','C','D','E','F','G'];
export function HostelPicker({hostel, setHostel, note, label = 'Your hostel'}: {hostel: string; setHostel: (value: string) => void; note: string; label?: string}) {
  return <View style={{gap:9}}><Label>{label}</Label><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{BLOCKS.map(item=><Pressable key={item} accessibilityRole="radio" accessibilityState={{selected:hostel===item}} aria-checked={hostel===item} accessibilityLabel={'Hostel '+item} onPress={()=>setHostel(item)} style={{width:44,height:44,borderRadius:10,borderWidth:1,borderColor:hostel===item?C.forest:C.line,backgroundColor:hostel===item?C.forest:C.white,alignItems:'center',justifyContent:'center'}}><T style={{fontFamily:'DMSansBold',color:hostel===item?C.white:C.ink}}>{item}</T></Pressable>)}</View><T style={{fontSize:10,color:C.muted}}>{note}</T></View>;
}
