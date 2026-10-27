import React from 'react';
import {View} from 'react-native';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import type {OrderStatus} from '../api';
import {COLORS as C} from '../model';
import {Icon, Label, T} from '../ui';

const buildings = [{x: 74,y: 50,w: 92,h: 62,label:'A'}, {x: 240,y: 45,w: 70,h: 74,label:'B'}, {x: 536,y: 47,w: 112,h: 76,label:'C'}, {x: 78,y: 153,w: 67,h: 55,label:'D'}, {x: 290,y: 128,w: 91,h: 55,label:'E'}, {x: 508,y: 164,w: 90,h: 66,label:'F'}, {x: 573,y: 269,w: 68,h: 50,label:'G'}];
export function CampusMap({status, hostel = 'C'}: {status?: OrderStatus; hostel?: string}) {
  const moving = status === 'Transit';
  const arrived = status && ['Arrived','Paid','Completed'].includes(status);
  const position = arrived ? {x: 465,y: 95} : moving ? {x: 354,y: 224} : {x: 198,y: 281};
  return <View style={{backgroundColor: '#EDF1E7', borderRadius: 13, overflow: 'hidden', position: 'relative', minHeight: 260}}>
    <View style={{position:'absolute',top:15,left:17,zIndex:1}}><Label style={{color:'#7E8D7B',fontSize:8}}>Illustrative campus · Demo</Label></View>
    <Svg width="100%" height={280} viewBox="0 0 700 350" accessibilityLabel="Illustrative campus route, not a real navigation map">
      <Rect width={700} height={350} fill="#EDF1E7" />
      <Path d="M-20 239 L175 239 L175 5 M15 132 L700 132 M422 -10 L422 370 M674 -10 L674 350 M0 326 L700 326" fill="none" stroke="#FBFCF7" strokeWidth={18} />
      <Path d="M-20 239 L175 239 L175 5 M15 132 L700 132 M422 -10 L422 370 M674 -10 L674 350" fill="none" stroke="#DDE3D6" strokeWidth={1} />
      <Rect x={241} y={264} width={128} height={45} rx={18} fill="#DEE6D5" />
      <Rect x={474} y={265} width={60} height={42} rx={7} fill="#DFE6D8" />
      <Path d="M490 270 L490 300 M481 285 L527 285" stroke="#CBD8C6" strokeWidth={1} />
      {[{x:35,y:62},{x:207,y:175},{x:325,y:230},{x:492,y:41},{x:648,y:198},{x:398,y:306},{x:51,y:302},{x:454,y:161}].map((p,i) => <G key={i}><Circle cx={p.x} cy={p.y} r={9} fill="#CBDAC3"/><Circle cx={p.x-3} cy={p.y-3} r={6} fill="#D7E2CF"/></G>)}
      {buildings.map((b) => <G key={b.label}>
        <Rect x={b.x+4} y={b.y+5} width={b.w} height={b.h} rx={6} fill="#DCE2D4" />
        <Rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill={b.label===hostel ? '#D7E4D3' : '#E3E8DC'} stroke={b.label===hostel ? '#A3B99B' : '#CED8C7'} />
        <Line x1={b.x+12} y1={b.y+12} x2={b.x+b.w-12} y2={b.y+12} stroke="#CCD7C5" strokeWidth={2}/>
        <SvgText x={b.x+b.w/2} y={b.y+b.h/2+7} textAnchor="middle" fontSize={13} fontWeight="600" fill="#8A9B83">{'HOSTEL '+b.label}</SvgText>
      </G>)}
      <Path d="M74 281 L198 281 L198 224 L465 224 L465 95 L531 95" fill="none" stroke="#B8CBB0" strokeWidth={8} strokeLinejoin="round" />
      <Path d="M74 281 L198 281 L198 224 L465 224 L465 95 L531 95" fill="none" stroke={C.forest} strokeWidth={3} strokeDasharray="5 6" strokeLinejoin="round" />
      <Circle cx={74} cy={281} r={7} fill={C.orange} stroke="#FFFFFF" strokeWidth={3} />
      <Rect x={23} y={248} width={93} height={22} rx={6} fill="#FFFFFF" />
      <SvgText x={69} y={263} textAnchor="middle" fontSize={9} fill={C.ink}>GATE 2 · PICKUP</SvgText>
      <Circle cx={position.x} cy={position.y} r={25} fill={C.forest} opacity={0.10}/>
      <Circle cx={position.x} cy={position.y} r={18} fill={C.forest} stroke="#FFFFFF" strokeWidth={3}/>
      <Rect x={position.x-9} y={position.y-7} width={18} height={12} rx={4} fill="#FFFFFF"/>
      <Circle cx={position.x-4} cy={position.y-2} r={1.6} fill={C.forest}/><Circle cx={position.x+4} cy={position.y-2} r={1.6} fill={C.forest}/>
      <Line x1={position.x-5} y1={position.y+6} x2={position.x+5} y2={position.y+6} stroke="#FFFFFF" strokeWidth={2}/>
    </Svg>
    <View style={{position:'absolute',bottom:13,left:15,right:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
      <View style={{backgroundColor:'#FFFFFFEE',borderRadius:7,paddingHorizontal:10,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:6}}><Icon name="navigate-outline" size={12}/><T style={{fontSize:9,lineHeight:13}}>Gate 2 → Hostel {hostel}</T></View>
      <T style={{fontSize:8,color:'#88917F'}}>Schematic only · No live coordinates</T>
    </View>
  </View>;
}
