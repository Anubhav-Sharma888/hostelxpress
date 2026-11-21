// Campus names and resident groups confirmed by the owner on 21 November 2026.
// New identifiers do not reinterpret legacy A-G destinations in saved orders.
export const HOSTELS = [
  {id: 'bhagat-singh', name: 'Bhagat Singh Hostel', residents: 'Boys'},
  {id: 'ratan-tata', name: 'Ratan Tata Hostel', residents: 'Boys'},
  {id: 'apj-abdul-kalam', name: 'APJ Abdul Kalam Hostel', residents: 'Boys'},
  {id: 'vikram-sarabhai', name: 'Vikram Sarabhai Hostel', residents: 'Boys'},
  {id: 'kalpana-chawla', name: 'Kalpana Chawla Hostel', residents: 'Girls'},
  {id: 'gargi', name: 'Gargi Hostel', residents: 'Girls'},
] as const;

export const DEFAULT_HOSTEL = 'apj-abdul-kalam';

export function isCampusHostel(code?: string | null): boolean {
  return HOSTELS.some(hostel => hostel.id === code);
}

export function hostelName(code?: string | null): string {
  return HOSTELS.find(hostel => hostel.id === code)?.name
    || (code ? 'Saved hostel ' + code : 'Your hostel');
}
