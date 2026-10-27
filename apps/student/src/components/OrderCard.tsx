import React from 'react';
import {Pressable, View} from 'react-native';
import {router} from 'expo-router';
import type {Order} from '../api';
import {COLORS as C, formatAmount, formatDate, shortId, STATUS_COPY} from '../model';
import {Button, Card, common, Heading, Icon, Label, StatusPill, T} from '../ui';
import {HorizontalProgress} from './Timeline';

export function OrderCard({order, compact = false}: {order: Order; compact?: boolean}) {
  const open = () => router.push({pathname:'/order/[id]',params:{id:order.id}});
  if (compact) return <Pressable accessibilityRole="button" accessibilityLabel={'View delivery '+shortId(order.id)} onPress={open} style={{flexDirection:'row',alignItems:'center',gap:13,paddingVertical:17,borderBottomWidth:1,borderBottomColor:C.line}}>
    <View style={{width:39,height:43,borderRadius:11,backgroundColor:C.pale,justifyContent:'center',alignItems:'center'}}><Icon name="bag-handle-outline" size={20}/></View>
    <View style={{flex:1,gap:2}}><T style={{fontFamily:'DMSansBold',fontSize:12}}>{order.parcel_label||'Campus delivery'}</T><T style={{fontSize:10,color:C.muted}}>{shortId(order.id)} · Hostel {order.destination_hostel_block} · {formatDate(order.created_at)}</T></View>
    <StatusPill status={order.status}/><Icon name="chevron-forward-outline" size={14} color="#929D8B"/>
  </Pressable>;
  return <Card style={{gap:17}}>
    <View style={common.between}><Label>{shortId(order.id)}</Label><StatusPill status={order.status}/></View>
    <View style={{height:45,width:45,borderRadius:13,backgroundColor:C.peach,justifyContent:'center',alignItems:'center'}}><Icon name="bag-handle-outline" size={23}/></View>
    <View><Heading style={{fontSize:20,lineHeight:28,letterSpacing:-.5}}>{order.parcel_label||'Your campus delivery'}</Heading><T style={{fontSize:12,color:C.muted,marginTop:5}}>Gate 2 → Hostel {order.destination_hostel_block}</T></View>
    <HorizontalProgress order={order}/>
    <T style={{fontSize:12,color:C.muted,lineHeight:19}}>{STATUS_COPY[order.status].description}</T>
    <View style={[common.between,{borderTopWidth:1,borderTopColor:C.line,paddingTop:15}]}>
      <View><Label>Delivery fee</Label><T style={{fontFamily:'ManropeBold',fontSize:22,lineHeight:30}}>{formatAmount(order.amount)}</T></View>
      <Button small onPress={open} icon="arrow-forward-outline">{order.status==='Arrived'?'Pay & collect':'View delivery'}</Button>
    </View>
  </Card>;
}
