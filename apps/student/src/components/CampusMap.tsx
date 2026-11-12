import React from 'react';
import {View} from 'react-native';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import {AUTH_MODE, type OrderStatus} from '../api';
import {COLORS as C} from '../model';
import {Icon, T} from '../ui';

const buildings = [
  {x: 65, y: 65, w: 100, h: 65, label: 'A'},
  {x: 238, y: 52, w: 100, h: 80, label: 'B'},
  {x: 530, y: 50, w: 115, h: 95, label: 'C'},
  {x: 67, y: 162, w: 100, h: 62, label: 'D'},
  {x: 280, y: 155, w: 100, h: 65, label: 'E'},
  {x: 505, y: 185, w: 105, h: 65, label: 'F'},
  {x: 548, y: 277, w: 100, h: 54, label: 'G'},
];
export function CampusMap({status, hostel = 'C'}: {status?: OrderStatus; hostel?: string}) {
  const destination = buildings.find(building => building.label === hostel) ?? buildings[2];
  const moving = status === 'Transit';
  const arrived = Boolean(status && ['Arrived', 'Paid', 'Completed'].includes(status));
  const target = {x: destination.x + destination.w / 2, y: destination.y + destination.h / 2};
  const position = arrived ? target : moving ? {x: 355, y: 250} : {x: 125, y: 285};
  const route = `M75 285 H210 V250 H445 V${target.y} H${target.x}`;
  return <View style={{backgroundColor: '#141B2B', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#293349'}}>
    <View style={{paddingHorizontal: 16, paddingVertical: 13, backgroundColor: C.dark, flexDirection: 'row', gap: 9, alignItems: 'center'}}>
      <Icon name="navigate-outline" size={19} color={C.lime} />
      <T style={{fontFamily: 'ManropeBold', fontSize: 13, color: '#FFFFFF', flex: 1}}>Campus route</T>
      <View style={{backgroundColor: '#FFFFFF12', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 6}}>
        <T style={{fontSize: 9, color: '#D8D4FF'}}>SCHEMATIC</T>
      </View>
    </View>
    <Svg width="100%" height={280} viewBox="0 0 700 350" accessibilityLabel="Illustrative campus route, not a real navigation map">
      <Rect width={700} height={350} fill="#141B2B" />
      {Array.from({length: 18}, (_, i) => <Line key={'v' + i} x1={i * 42} y1={0} x2={i * 42} y2={350} stroke="#253047" strokeWidth={.7} />)}
      {Array.from({length: 9}, (_, i) => <Line key={'h' + i} x1={0} y1={i * 42} x2={700} y2={i * 42} stroke="#253047" strokeWidth={.7} />)}
      <Rect x={278} y={275} width={125} height={55} rx={12} fill="#1A302A" stroke="#345E46" />
      <SvgText x={340} y={305} textAnchor="middle" fontSize={10} fill="#A3C8AB">CAMPUS GREEN</SvgText>
      {buildings.map(building => <G key={building.label}>
        <Rect x={building.x} y={building.y} width={building.w} height={building.h} rx={8}
          fill={building.label === hostel ? '#2B2644' : '#1D2639'}
          stroke={building.label === hostel ? '#B9ABFF' : '#35425D'} />
        <SvgText x={building.x + building.w / 2} y={building.y + building.h / 2 + 4} textAnchor="middle"
          fontSize={11} fontWeight="600" fill={building.label === hostel ? '#BEF264' : '#B6C0D9'}>
          {'HOSTEL ' + building.label}
        </SvgText>
      </G>)}
      <Path d={route} fill="none" stroke="#35445F" strokeWidth={17} strokeLinejoin="round" strokeLinecap="round" />
      <Path d={route} fill="none" stroke={C.lime} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="10 5" />
      <Circle cx={75} cy={285} r={8} fill={C.lime} stroke="#141B2B" strokeWidth={3} />
      <Rect x={30} y={305} width={90} height={23} rx={6} fill="#293349" />
      <SvgText x={75} y={321} textAnchor="middle" fontSize={10} fill="#FFFFFF">GATE 2</SvgText>
      <Circle cx={position.x} cy={position.y} r={29} fill={C.lime} opacity={.12} />
      <Rect x={position.x - 20} y={position.y - 20} width={40} height={40} rx={12} fill={C.lime} stroke="#172010" strokeWidth={3} />
      <Rect x={position.x - 12} y={position.y - 8} width={24} height={16} rx={5} fill="#1E293B" />
      <Circle cx={position.x - 5} cy={position.y - 1} r={2} fill="#BEF264" />
      <Circle cx={position.x + 5} cy={position.y - 1} r={2} fill="#BEF264" />
      <Line x1={position.x} y1={position.y - 8} x2={position.x} y2={position.y - 13} stroke="#1E293B" strokeWidth={2} />
      <Circle cx={position.x} cy={position.y - 14} r={2} fill="#1E293B" />
    </Svg>
    <View style={{padding: 13, borderTopWidth: 1, borderTopColor: '#293349', gap: 5}}>
      <T style={{fontFamily: 'DMSansMedium', fontSize: 11, color: '#E2E8F0'}}>Gate 2 → Hostel {hostel}</T>
      <T style={{fontSize: 10, lineHeight: 16, color: '#AAB6D1'}}>
        {AUTH_MODE === 'demo' ? 'Demo illustration' : 'Illustrative route'} · Position reflects delivery stage, not live coordinates.
      </T>
    </View>
  </View>;
}
