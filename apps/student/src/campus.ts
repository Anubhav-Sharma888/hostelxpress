// Design labels map to the existing API block IDs. Confirm names with campus operations before launch.
export const HOSTELS = [
  {id:'A',name:'Kaveri'}, {id:'B',name:'Krishna'}, {id:'C',name:'Godavari'},
  {id:'D',name:'Brahmaputra'}, {id:'E',name:'Ganga'}, {id:'F',name:'Yamuna'}, {id:'G',name:'Narmada'},
];
export function hostelName(code?: string | null) {
  return HOSTELS.find(hostel => hostel.id === code)?.name || (code ? 'Hostel ' + code : 'Your hostel');
}
