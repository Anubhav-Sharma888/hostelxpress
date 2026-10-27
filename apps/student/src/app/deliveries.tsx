import React, {useState} from 'react';
import {Pressable, useWindowDimensions, View} from 'react-native';
import {BookModal} from '../components/BookModal';
import {OrderCard} from '../components/OrderCard';
import {COLORS as C,isActive} from '../model';
import {useApp} from '../state';
import {Button, Card, ErrorNotice, Icon, Loading, PageTitle, T} from '../ui';
export default function Deliveries() {
  const {orders,loading,error,refresh}=useApp(); const {width}=useWindowDimensions();
  const [tab,setTab]=useState<'all'|'active'|'completed'>('all'); const [booking,setBooking]=useState(false);
  const visible=orders.filter(order=>tab==='all'||(tab==='active'?isActive(order):order.status==='Completed'));
  return <View><PageTitle eyebrow="Your parcel journal" title="Every little journey." description="Track what’s on the way and revisit what’s arrived." action={<Button variant="orange" icon="add-outline" onPress={()=>setBooking(true)}>Book a delivery</Button>}/>
    <View style={{flexDirection:'row',gap:25,marginBottom:23,borderBottomWidth:1,borderBottomColor:C.line}}>{(['all','active','completed'] as const).map(item=><Pressable key={item} accessibilityRole="tab" accessibilityLabel={item==='all'?'All deliveries':item==='active'?'Active deliveries':'Completed deliveries'} accessibilityState={{selected:tab===item}} onPress={()=>setTab(item)} style={{borderBottomWidth:2,borderBottomColor:tab===item?C.forest:'transparent',paddingBottom:13}}><T style={{fontFamily:tab===item?'DMSansBold':'DMSans',fontSize:12,color:tab===item?C.forest:C.muted}}>{item==='all'?'All deliveries':item==='active'?'Active':'Completed'}{item==='all'?'  '+orders.length:''}</T></Pressable>)}</View>
    {error&&<ErrorNotice message={error} retry={()=>void refresh()}/>}
    {loading&&!orders.length?<Loading/>:visible.length?<View style={{flexDirection:'row',flexWrap:'wrap',gap:20}}>{visible.map(order=><View key={order.id} style={{width:width>1380?'31.9%':width>1000?'48.5%':'100%'}}><OrderCard order={order}/></View>)}</View>:<Card style={{paddingVertical:65,alignItems:'center',gap:13}}><View style={{height:66,width:66,borderRadius:23,backgroundColor:C.pale,justifyContent:'center',alignItems:'center'}}><Icon name="bag-handle-outline" size={31}/></View><T style={{fontFamily:'ManropeBold',fontSize:21,marginTop:7}}>Nothing here just yet.</T><T style={{fontSize:12,color:C.muted,marginBottom:10}}>Your deliveries will feel right at home here.</T><Button variant="secondary" onPress={()=>setBooking(true)}>Book your first delivery</Button></Card>}
    {booking&&<BookModal onClose={()=>setBooking(false)}/>}
  </View>;
}
