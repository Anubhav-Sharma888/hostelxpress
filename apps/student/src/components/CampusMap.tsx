import React from 'react';
import {View} from 'react-native';
import Svg, {Circle, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import type {OrderStatus} from '../api';
import {hostelName} from '../campus';
import {Icon, T} from '../ui';

export function CampusMap({status, hostel = 'C'}: {status?: OrderStatus; hostel?: string}) {
  const arrived = status && ['Arrived', 'Paid', 'Completed'].includes(status);
  const position = arrived ? {x: 306, y: 65} : status === 'Transit' ? {x: 201, y: 120} : {x: 42, y: 191};
  return <View style={{gap: 12}}>
    <View style={{backgroundColor: '#E5EEFF', borderRadius: 10, overflow: 'hidden'}}>
      <Svg width="100%" height={205} viewBox="0 0 350 240" accessibilityLabel="Illustrative route map">
        <Rect width={350} height={240} fill="#E5EEFF" />
        {Array.from({length: 19}, (_, x) => Array.from({length: 13}, (_, y) =>
          <Circle key={x + '-' + y} cx={x * 19} cy={y * 19} r={.8} fill="#9DAFCB" />))}
        <Path d="M42 191 C85 192 90 139 145 135 S208 127 233 103 S276 71 306 65"
          fill="none" stroke="#CCDCF5" strokeWidth={10} strokeLinecap="round" />
        <Path d="M42 191 C85 192 90 139 145 135 S208 127 233 103 S276 71 306 65"
          fill="none" stroke="#FF5E00" strokeWidth={5} strokeLinecap="round" />
        <Circle cx={42} cy={191} r={13} fill="#565E74" />
        <Rect x={35} y={185} width={14} height={10} rx={2} fill="#FFFFFF" />
        <Circle cx={306} cy={65} r={15} fill="#2DA498" />
        <Circle cx={306} cy={63} r={5} fill="none" stroke="#005049" strokeWidth={2} />
        <Line x1={306} y1={68} x2={306} y2={73} stroke="#005049" strokeWidth={2} />
        <Circle cx={position.x} cy={position.y} r={18} fill="#FF5E00" />
        <Rect x={position.x - 9} y={position.y - 6} width={18} height={13} rx={3} fill="#FFFFFF" />
        <Circle cx={position.x - 4} cy={position.y} r={1.6} fill="#FF5E00" />
        <Circle cx={position.x + 4} cy={position.y} r={1.6} fill="#FF5E00" />
        <SvgText x={41} y={220} fontFamily="sans-serif" textAnchor="middle" fontSize={11} fontWeight="600" fill="#0B1C30">Gate 2</SvgText>
        <SvgText x={190} y={151} fontFamily="sans-serif" textAnchor="middle" fontSize={10} fill="#565E74">Academic Ring</SvgText>
        <SvgText x={300} y={94} fontFamily="sans-serif" textAnchor="middle" fontSize={10} fill="#0B1C30">{hostelName(hostel)}</SvgText>
      </Svg>
    </View>
    <View style={{flexDirection: 'row', gap: 7, alignItems: 'flex-start'}}>
      <Icon name="information-circle-outline" size={16} color="#565E74" />
      <T style={{flex: 1, color: '#565E74', fontSize: 12, lineHeight: 18}}>
        Illustrative route map · Position reflects delivery stage. Subject to pedestrian path clearance.
      </T>
    </View>
  </View>;
}
