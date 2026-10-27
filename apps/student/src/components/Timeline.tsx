import React from 'react';
import {View} from 'react-native';
import type {Order} from '../api';
import {COLORS as C, FLOW, formatTime} from '../model';
import {Icon, T} from '../ui';
const names = ['Reserved', 'Loaded', 'On the way', 'Arrived', 'Paid', 'Collected'];
export function Timeline({order, compact = false}: {order: Order; compact?: boolean}) {
  const current = FLOW.indexOf(order.status);
  return <View style={{gap: compact ? 0 : 7}}>
    {FLOW.map((status,i) => {
      const entry = order.timeline.find(event => event.status === status);
      const done = current >= i;
      return <View key={status} style={{flexDirection:'row',gap:13,minHeight:compact?43:59}}>
        <View style={{alignItems:'center',width:20}}>
          <View style={{width:20,height:20,borderRadius:10,backgroundColor:done?C.forest:C.pale,borderWidth:done?0:1,borderColor:C.line,alignItems:'center',justifyContent:'center'}}>
            {done ? <Icon name="checkmark" size={11} color={C.white}/> : <View style={{height:4,width:4,borderRadius:2,backgroundColor:'#B8C2B1'}}/>}
          </View>
          {i<FLOW.length-1 && <View style={{width:1,backgroundColor:current>i?'#9BB49D':C.line,flex:1,marginVertical:3}}/>}
        </View>
        <View style={{flex:1,flexDirection:'row',justifyContent:'space-between',paddingBottom:compact?13:20}}>
          <T style={{fontFamily:done?'DMSansMedium':'DMSans',fontSize:12,color:done?C.ink:'#8F9889'}}>{names[i]}</T>
          <T style={{fontSize:10,color:C.muted}}>{entry?formatTime(entry.at):'—'}</T>
        </View>
      </View>;
    })}
  </View>;
}
export function HorizontalProgress({order}: {order: Order}) {
  const current = FLOW.indexOf(order.status);
  return <View style={{flexDirection:'row',gap:4,marginVertical:17}}>
    {FLOW.map((status,i)=><View key={status} style={{height:4,borderRadius:2,flex:1,backgroundColor:current>=i?C.forest:C.line}}/>)}
  </View>;
}
