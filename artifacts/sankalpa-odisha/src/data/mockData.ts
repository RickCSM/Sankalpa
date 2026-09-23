export type UserRole = 'admin' | 'chief_minister' | 'cmo_nodal' | 'cmo_reviewer' | 'ocac_viewer' | 'dept_head' | 'dept_nodal' | 'dept_reviewer' | 'dept_user' | 'dept_viewer';

export type WorkflowStatus = 'draft' | 'pending_cmo_review' | 'reverted_by_cmo' | 'pending_cmo_reconsideration' | 'published' | 'pending_dept_acceptance' | 'accepted' | 'in_progress' | 'pending_completion_review' | 'reverted_by_dept_reviewer' | 'pending_cmo_completion_review' | 'completed' | 'dropped' | 'on_hold';

export interface MockUser {
  id: number;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  department?: string;
  email: string;
  mobile?: string;
  status: 'Active' | 'Inactive';
}

export type House = 'R' | 'L' | 'A';

export const houseLabels: Record<House, string> = {
  R: 'Rajya Sabha',
  L: 'Lok Sabha',
  A: 'Legislative Assembly',
};

export const houseConstituencyMax: Record<House, number> = {
  R: 10,
  L: 21,
  A: 147,
};

export interface Constituency {
  number: number;
  name: string;
}

export const lokSabhaConstituencies: Constituency[] = [
  { number: 1, name: 'Bargarh' },
  { number: 2, name: 'Sundargarh' },
  { number: 3, name: 'Sambalpur' },
  { number: 4, name: 'Keonjhar' },
  { number: 5, name: 'Mayurbhanj' },
  { number: 6, name: 'Balasore' },
  { number: 7, name: 'Bhadrak' },
  { number: 8, name: 'Jajpur' },
  { number: 9, name: 'Dhenkanal' },
  { number: 10, name: 'Bolangir' },
  { number: 11, name: 'Kalahandi' },
  { number: 12, name: 'Nabarangpur' },
  { number: 13, name: 'Kandhamal' },
  { number: 14, name: 'Cuttack' },
  { number: 15, name: 'Kendrapara' },
  { number: 16, name: 'Jagatsinghpur' },
  { number: 17, name: 'Puri' },
  { number: 18, name: 'Bhubaneswar' },
  { number: 19, name: 'Aska' },
  { number: 20, name: 'Berhampur' },
  { number: 21, name: 'Koraput' },
];

export const vidhanSabhaConstituencies: Constituency[] = [
  { number: 1, name: 'Bargarh' },
  { number: 2, name: 'Padampur' },
  { number: 3, name: 'Bijepur' },
  { number: 4, name: 'Bhatli' },
  { number: 5, name: 'Brajarajnagar' },
  { number: 6, name: 'Jharsuguda' },
  { number: 7, name: 'Talsara' },
  { number: 8, name: 'Sundargarh' },
  { number: 9, name: 'Biramitrapur' },
  { number: 10, name: 'Raghunathpali' },
  { number: 11, name: 'Rourkela' },
  { number: 12, name: 'Rajgangpur' },
  { number: 13, name: 'Bonai' },
  { number: 14, name: 'Kuchinda' },
  { number: 15, name: 'Rengali' },
  { number: 16, name: 'Sambalpur' },
  { number: 17, name: 'Rairakhol' },
  { number: 18, name: 'Deogarh' },
  { number: 19, name: 'Telkoi' },
  { number: 20, name: 'Ghasipura' },
  { number: 21, name: 'Anandapur' },
  { number: 22, name: 'Patna' },
  { number: 23, name: 'Keonjhar' },
  { number: 24, name: 'Champua' },
  { number: 25, name: 'Jashipur' },
  { number: 26, name: 'Saraskana' },
  { number: 27, name: 'Rairangpur' },
  { number: 28, name: 'Bangriposi' },
  { number: 29, name: 'Karanjia' },
  { number: 30, name: 'Udala' },
  { number: 31, name: 'Badasahi' },
  { number: 32, name: 'Baripada' },
  { number: 33, name: 'Morada' },
  { number: 34, name: 'Jaleswar' },
  { number: 35, name: 'Bhograi' },
  { number: 36, name: 'Basta' },
  { number: 37, name: 'Balasore' },
  { number: 38, name: 'Remuna' },
  { number: 39, name: 'Nilgiri' },
  { number: 40, name: 'Soro' },
  { number: 41, name: 'Simulia' },
  { number: 42, name: 'Bhandaripokhari' },
  { number: 43, name: 'Bhadrak' },
  { number: 44, name: 'Basudevpur' },
  { number: 45, name: 'Dhamnagar' },
  { number: 46, name: 'Chandbali' },
  { number: 47, name: 'Binjharpur' },
  { number: 48, name: 'Bari' },
  { number: 49, name: 'Barchana' },
  { number: 50, name: 'Dharmasala' },
  { number: 51, name: 'Jajpur' },
  { number: 52, name: 'Korei' },
  { number: 53, name: 'Sukinda' },
  { number: 54, name: 'Dhenkanal' },
  { number: 55, name: 'Hindol' },
  { number: 56, name: 'Kamakhyanagar' },
  { number: 57, name: 'Parjang' },
  { number: 58, name: 'Pallahara' },
  { number: 59, name: 'Talcher' },
  { number: 60, name: 'Angul' },
  { number: 61, name: 'Chhendipada' },
  { number: 62, name: 'Athamallik' },
  { number: 63, name: 'Birmaharajpur' },
  { number: 64, name: 'Sonepur' },
  { number: 65, name: 'Loisingha' },
  { number: 66, name: 'Patnagarh' },
  { number: 67, name: 'Bolangir' },
  { number: 68, name: 'Titilagarh' },
  { number: 69, name: 'Kantabanji' },
  { number: 70, name: 'Nuapada' },
  { number: 71, name: 'Khariar' },
  { number: 72, name: 'Umarkote' },
  { number: 73, name: 'Jharigam' },
  { number: 74, name: 'Nabarangpur' },
  { number: 75, name: 'Dabugam' },
  { number: 76, name: 'Lanjigarh' },
  { number: 77, name: 'Junagarh' },
  { number: 78, name: 'Dharmagarh' },
  { number: 79, name: 'Bhawanipatna' },
  { number: 80, name: 'Narla' },
  { number: 81, name: 'Baliguda' },
  { number: 82, name: 'G. Udayagiri' },
  { number: 83, name: 'Phulbani' },
  { number: 84, name: 'Kantamal' },
  { number: 85, name: 'Boudh' },
  { number: 86, name: 'Badamba' },
  { number: 87, name: 'Banki' },
  { number: 88, name: 'Athgarh' },
  { number: 89, name: 'Barabati-Cuttack' },
  { number: 90, name: 'Choudwar-Cuttack' },
  { number: 91, name: 'Niali' },
  { number: 92, name: 'Cuttack Sadar' },
  { number: 93, name: 'Salepur' },
  { number: 94, name: 'Mahanga' },
  { number: 95, name: 'Patkura' },
  { number: 96, name: 'Kendrapara' },
  { number: 97, name: 'Aul' },
  { number: 98, name: 'Rajanagar' },
  { number: 99, name: 'Mahakalapada' },
  { number: 100, name: 'Paradeep' },
  { number: 101, name: 'Tirtol' },
  { number: 102, name: 'Balikuda-Erasama' },
  { number: 103, name: 'Jagatsinghpur' },
  { number: 104, name: 'Kakatpur' },
  { number: 105, name: 'Nimapara' },
  { number: 106, name: 'Puri' },
  { number: 107, name: 'Brahmagiri' },
  { number: 108, name: 'Satyabadi' },
  { number: 109, name: 'Pipili' },
  { number: 110, name: 'Jayadev' },
  { number: 111, name: 'Bhubaneswar Central' },
  { number: 112, name: 'Bhubaneswar (North)' },
  { number: 113, name: 'Ekamra-Bhubaneswar' },
  { number: 114, name: 'Jatani' },
  { number: 115, name: 'Begunia' },
  { number: 116, name: 'Khurda' },
  { number: 117, name: 'Chilika' },
  { number: 118, name: 'Ranpur' },
  { number: 119, name: 'Khandapada' },
  { number: 120, name: 'Daspalla' },
  { number: 121, name: 'Nayagarh' },
  { number: 122, name: 'Bhanjanagar' },
  { number: 123, name: 'Polasara' },
  { number: 124, name: 'Kabisuryanagar' },
  { number: 125, name: 'Khallikote' },
  { number: 126, name: 'Chhatrapur' },
  { number: 127, name: 'Aska' },
  { number: 128, name: 'Surada' },
  { number: 129, name: 'Sanakhemundi' },
  { number: 130, name: 'Hinjili' },
  { number: 131, name: 'Gopalpur' },
  { number: 132, name: 'Berhampur' },
  { number: 133, name: 'Digapahandi' },
  { number: 134, name: 'Chikiti' },
  { number: 135, name: 'Mohana' },
  { number: 136, name: 'Paralakhemundi' },
  { number: 137, name: 'Gunupur' },
  { number: 138, name: 'Bissam Cuttack' },
  { number: 139, name: 'Rayagada' },
  { number: 140, name: 'Laxmipur' },
  { number: 141, name: 'Kotpad' },
  { number: 142, name: 'Jeypore' },
  { number: 143, name: 'Koraput' },
  { number: 144, name: 'Pottangi' },
  { number: 145, name: 'Malkangiri' },
  { number: 146, name: 'Chitrakonda' },
  { number: 147, name: 'Korukonda' },
];

export const rajyaSabhaSeats: Constituency[] = Array.from({ length: 10 }, (_, i) => ({
  number: i + 1,
  name: `Rajya Sabha Seat ${i + 1}`,
}));

export const houseConstituencies: Record<House, Constituency[]> = {
  R: rajyaSabhaSeats,
  L: lokSabhaConstituencies,
  A: vidhanSabhaConstituencies,
};

export function getConstituencyName(house: House, number: number): string {
  const list = houseConstituencies[house];
  const found = list.find(c => c.number === number);
  return found ? found.name : `Constituency ${number}`;
}

export function formatConstituencyOption(c: Constituency): string {
  return `${String(c.number).padStart(3, '0')} — ${c.name}`;
}

export interface Announcement {
  id: number;
  uniqueId: string;
  // Legacy archival fields — populated on pre-existing rows seeded with the
  // old CMA-NNNX NNNN format, null on new rows created with the simpler
  // CMA-NNNN format.
  house: House | null;
  constituencyNumber: number | null;
  title: string;
  date: string;
  description: string;
  department: string;
  occasion: string;
  location: string;
  district?: string;
  block?: string;
  category?: string;
  // Free-text category captured when category is "Other".
  otherCategory?: string;
  tags?: string[];
  workflowStatus: WorkflowStatus;
  createdBy: number;
  assignedDeptUserId?: number;
  assignedCmoReviewerId?: number;
  acceptedByDeptNodalId?: number;
  // Parallel-state flag: when true, a reconsideration has been requested while
  // the announcement is still awaiting dept approval, so it appears in both the
  // Approval stage and the CMO Reconsideration queue at once.
  reconsiderationRequested?: boolean;
  // The workflow status the announcement held immediately before being put on
  // hold; used by the Resume action to restore it. Null/undefined unless
  // currently on hold.
  statusBeforeHold?: WorkflowStatus | null;
  // Optimistic-locking version from the server; required by transactional
  // workflow actions (e.g. Resume).
  version?: number;
  createdAt?: string;
}

export const prominentLocations: Record<string, { district: string; block?: string }> = {
  'Bhubaneswar': { district: 'Khordha' },
  'Cuttack': { district: 'Cuttack', block: 'Cuttack Sadar' },
  'Puri': { district: 'Puri', block: 'Puri Sadar' },
  'Rourkela': { district: 'Sundargarh' },
  'Sambalpur': { district: 'Sambalpur', block: 'Sambalpur' },
  'Berhampur': { district: 'Ganjam' },
  'Balasore': { district: 'Balasore', block: 'Balasore' },
  'Baripada': { district: 'Mayurbhanj', block: 'Baripada' },
  'Bhadrak': { district: 'Bhadrak', block: 'Bhadrak' },
  'Jharsuguda': { district: 'Jharsuguda', block: 'Jharsuguda' },
  'Angul': { district: 'Angul', block: 'Angul' },
  'Dhenkanal': { district: 'Dhenkanal' },
  'Koraput': { district: 'Koraput', block: 'Koraput' },
  'Jeypore': { district: 'Koraput', block: 'Jeypore' },
  'Bolangir': { district: 'Balangir', block: 'Balangir' },
  'Kalahandi': { district: 'Kalahandi' },
  'Bargarh': { district: 'Bargarh', block: 'Bargarh' },
  'Sundargarh': { district: 'Sundargarh', block: 'Sundargarh' },
  'Keonjhar': { district: 'Kendujhar' },
  'Khordha': { district: 'Khordha', block: 'Khordha' },
};

export function lookupProminentLocation(input: string): { district: string; block?: string } | null {
  if (!input) return null;
  const trimmed = input.trim();
  for (const [city, info] of Object.entries(prominentLocations)) {
    if (city.toLowerCase() === trimmed.toLowerCase()) return info;
  }
  return null;
}

export const defaultCategories = [
  'Infrastructure', 'Health', 'Education', 'Agriculture', 'Social Welfare',
  'Governance', 'Environment', 'Digital & Technology', 'Employment & Skill',
  'Finance & Revenue', 'Law & Order', 'Tourism & Culture',
];

export const defaultTags = [
  'Budget', 'Rural', 'Urban', 'Women', 'Youth', 'Digital', 'Employment',
  'Tribal', 'Coastal', 'Green Initiative', 'PPP', 'Flagship Scheme',
  'Infrastructure', 'Capacity Building', 'Awareness', 'Emergency',
  'Innovation', 'Welfare', 'Monitoring', 'Reform',
];

export interface AnnouncementComment {
  id: number;
  announcementId: number;
  userId: number;
  userName: string;
  role: UserRole;
  action: string;
  comment: string;
  timestamp: string;
}

export interface SubComponent {
  id: number;
  announcementId: number;
  title: string;
  description: string;
  assignedTo?: number;
  assignedToName?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
}

// Sub-component execution only begins once the Department Nodal clicks "Start
// Progress" (announcement → in_progress). Until then the work is locked, so a
// sub-component's stored status is not yet meaningful — any stale non-Pending
// value (e.g. left over from a prior cycle) must display as "Pending". This is
// the single source of truth for the *displayed* sub-component status; the
// stored value is never mutated here.
const SUB_PRE_EXECUTION_STATUSES: WorkflowStatus[] = [
  'draft',
  'pending_cmo_review',
  'reverted_by_cmo',
  'pending_cmo_reconsideration',
  'published',
  'pending_dept_acceptance',
  'accepted',
];

export function displaySubComponentStatus(
  subStatus: SubComponent['status'],
  announcementStatus: WorkflowStatus | undefined,
): SubComponent['status'] {
  if (announcementStatus && SUB_PRE_EXECUTION_STATUSES.includes(announcementStatus)) {
    return 'Pending';
  }
  return subStatus;
}

export interface Notification {
  id: number;
  userId: number;
  message: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
  timestamp: string;
  link?: string;
}

export const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  chief_minister: 'Chief Minister',
  cmo_nodal: 'CMO Nodal Officer',
  cmo_reviewer: 'CMO Reviewer',
  ocac_viewer: 'OCAC Viewer',
  dept_head: 'Department Head',
  dept_nodal: 'Department Nodal Officer',
  dept_reviewer: 'Department Reviewer',
  dept_user: 'Department User',
  dept_viewer: 'Department Viewer',
};

export const mockUsers: MockUser[] = [
  { id: 1, username: 'admin', password: 'Admin@123', name: 'System Administrator', role: 'admin', email: 'admin@sankalpa.gov.in', status: 'Active' },
  { id: 2, username: 'cm', password: 'Cm@123', name: 'Shri Mohan Charan Majhi', role: 'chief_minister', email: 'cm@odisha.gov.in', status: 'Active' },
  { id: 3, username: 'cmo_nodal', password: 'Cmo@123', name: 'Rajesh Kumar Sharma', role: 'cmo_nodal', email: 'cmo.nodal@odisha.gov.in', status: 'Active' },
  { id: 4, username: 'cmo_reviewer', password: 'Cmo@123', name: 'Anita Mishra', role: 'cmo_reviewer', email: 'cmo.reviewer@odisha.gov.in', status: 'Active' },
  { id: 5, username: 'dept_head', password: 'Dept@123', name: 'Dr. Sanjay Patel', role: 'dept_head', department: "Agriculture & Farmers' Emp", email: 'agri.head@odisha.gov.in', status: 'Active' },
  { id: 6, username: 'dept_nodal', password: 'Dept@123', name: 'Priya Mohanty', role: 'dept_nodal', department: "Agriculture & Farmers' Emp", email: 'agri.nodal@odisha.gov.in', status: 'Active' },
  { id: 7, username: 'dept_reviewer', password: 'Dept@123', name: 'Suresh Nayak', role: 'dept_reviewer', department: "Agriculture & Farmers' Emp", email: 'agri.reviewer@odisha.gov.in', status: 'Active' },
];

// NOTE: Generated mock/demo announcement data was removed. All announcement,
// comment, sub-component, and notification data now comes exclusively from the
// API server (real database), so demo counts can never leak into reports.
// This module only keeps static master lists (departments, districts, blocks)
// and shared labels/helpers.


export const departmentList = [
  "Agriculture & Farmers' Emp",
  "Co-operation",
  "Commerce & Transport",
  "Electronics & Information Tech.",
  "Energy",
  "Excise",
  "Finance",
  "Fisheries & ARD",
  "Forest, Environment and Climate Change",
  "FS & CW",
  "GA & PG",
  "H & UD",
  "Health & FW",
  "Higher Education",
  "Home",
  "Industries",
  "Labour & ESI",
  "Law",
  "MSME",
  "Panchayati Raj & DW",
  "Planning & Convergence",
  "Renewable Energy",
  "Revenue & Disaster Management",
  "Rural Development",
  "S&ME",
  "SC & ST Development",
  "Skill Development & Technical Education",
  "Sports & Youth Services",
  "Steel & Mines",
  "Textile & Handicraft",
  "Tourism",
  "W & CD and Mission Shakti",
  "Water Resources",
  "Works",
];

export const odishaDistrictBlocks: Record<string, string[]> = {
  "Angul": ["Angul", "Athamallik", "Banarpal", "Chhendipada", "Kishorenagar", "Kaniha", "Pallahara", "Talcher"],
  "Balangir": ["Agalpur", "Balangir", "Bangomunda", "Belpara", "Deogaon", "Gudvella", "Khaprakhol", "Loisingha", "Muribahal", "Patnagarh", "Puintala", "Saintala", "Titlagarh", "Turekela"],
  "Balasore": ["Balasore", "Basta", "Bhograi", "Jaleswar", "Khaira", "Nilagiri", "Oupada", "Remuna", "Simulia", "Soro"],
  "Bargarh": ["Ambabhona", "Attabira", "Bargarh", "Barpali", "Bhatli", "Bijepur", "Gaisilet", "Jharbandh", "Padampur", "Paikmal", "Rajborasambar", "Sohela"],
  "Bhadrak": ["Basudevpur", "Bhadrak", "Bhandaripokhari", "Bonth", "Chandbali", "Dhamnagar", "Tihidi"],
  "Boudh": ["Boudh", "Harbhanga", "Kantamal"],
  "Cuttack": ["Athagarh", "Badamba", "Banki", "Baramba", "Cuttack Sadar", "Dampara", "Kantapada", "Mahanga", "Narsinghpur", "Niali", "Salepur", "Tangi-Choudwar", "Tigiria"],
  "Deogarh": ["Barkote", "Deogarh", "Reamal"],
  "Dhenkanal": ["Bhuban", "Dhenkanal Sadar", "Gondia", "Hindol", "Kamakhyanagar", "Kankadahad", "Mahimagadi", "Odapada"],
  "Gajapati": ["Gosani", "Gumma", "Kashinagar", "Mohana", "Nuagada", "R.Udayagiri", "Rayagada"],
  "Ganjam": ["Aska", "Beguniapada", "Bellaguntha", "Bhanjanagar", "Buguda", "Chatrapur", "Chikiti", "Dharakote", "Digapahandi", "Ganjam", "Hinjilicut", "Jagannathprasad", "Kabisuryanagar", "Khallikote", "Kodala", "Kukudakhandi", "Patrapur", "Polasara", "Purusottampur", "Rangeilunda", "Sanakhemundi", "Sheragada"],
  "Jagatsinghpur": ["Balikuda", "Biridi", "Erasama", "Jagatsinghpur", "Kujanga", "Naugaon", "Raghunathpur", "Tirtol"],
  "Jajpur": ["Bari", "Binjharpur", "Dasarathpur", "Dharmasala", "Jajpur", "Rasulpur", "Sukinda", "Vyasanagar"],
  "Jharsuguda": ["Jharsuguda", "Kirmira", "Kolabira", "Lakhanpur", "Laikera"],
  "Kalahandi": ["Bhawanipatna", "Dharmagarh", "Golamunda", "Jaypatna", "Junagarh", "Kalampur", "Karlamunda", "Kesinga", "Kokasara", "Lanjigarh", "Madanpur Rampur", "Narla", "Thuamul Rampur"],
  "Kandhamal": ["Balliguda", "Chakapad", "Daringbadi", "G. Udayagiri", "K. Nuagaon", "Khajuripada", "Kotagarh", "Phiringia", "Phulbani", "Raikia", "Tikabali", "Tumudibandha"],
  "Kendrapara": ["Aul", "Derabis", "Garadpur", "Kendrapara", "Mahakalapada", "Marshaghai", "Pattamundai", "Rajkanika", "Rajnagar"],
  "Kendujhar": ["Anandapur", "Banspal", "Champua", "Ghasipura", "Ghatgaon", "Harichandanpur", "Jhumpura", "Joda", "Kendujhar Sadar", "Patna", "Saharpada", "Telkoi", "Ukhunda"],
  "Khordha": ["Balianta", "Balipatna", "Banapur", "Begunia", "Bolagarh", "Chilika", "Jatni", "Khordha", "Tangi"],
  "Koraput": ["Bandhugaon", "Boipariguda", "Borigumma", "Dasmantpur", "Jeypore", "Koraput", "Kotpad", "Kundra", "Laxmipur", "Narayanpatna", "Nandapur", "Pottangi", "Semiliguda", "Sunabeda"],
  "Malkangiri": ["Kalimela", "Khairput", "Korukonda", "Kudumulgumma", "Malkangiri", "Mathili", "Podia"],
  "Mayurbhanj": ["Bangiriposi", "Baripada", "Basipur", "Betnoti", "Bijatala", "Bisoi", "Gopabandhunagar", "Jamda", "Jashipur", "Kaptipada", "Karanjia", "Khunta", "Kuliana", "Morada", "Moroshimalia", "Rairangpur", "Raruan", "Samakhunta", "Saraskana", "Suliapada", "Thakurmunda", "Tiring", "Udala"],
  "Nabarangpur": ["Chandahandi", "Dabugam", "Jharigaon", "Kosagumuda", "Nabarangpur", "Nandahandi", "Papadahandi", "Raighar", "Tentulikhunti", "Umerkote"],
  "Nayagarh": ["Bhapur", "Daspalla", "Gania", "Khandapada", "Nayagarh", "Nuagaon", "Odagaon", "Ranpur"],
  "Nuapada": ["Boden", "Khariar", "Komna", "Nuapada", "Sinapali"],
  "Puri": ["Astaranga", "Brahmagiri", "Delanga", "Gop", "Kakatpur", "Kanas", "Krushnaprasad", "Nimapara", "Pipili", "Puri Sadar", "Satyabadi"],
  "Rayagada": ["Bissamcuttack", "Chandrapur", "Gudari", "Gunupur", "Kalyansinghpur", "Kolnara", "Muniguda", "Padampur", "Ramanaguda", "Rayagada", "K. Singhpur"],
  "Sambalpur": ["Dhankauda", "Jamankira", "Jujumura", "Kuchinda", "Maneswar", "Naktideul", "Rairakhol", "Rengali", "Sambalpur"],
  "Subarnapur": ["Binka", "Birmaharajpur", "Dunguripali", "Sonepur", "Tarbha", "Ullunda"],
  "Sundargarh": ["Balisankara", "Bargaon", "Bisra", "Bonai", "Gurundia", "Hemgir", "Koida", "Kuanrmunda", "Lahunipara", "Lefripara", "Nuagaon", "Rajgangpur", "Subdega", "Sundargarh", "Tangarpali", "Lathikata", "Kutra"],
};

export const odishaDistricts = Object.keys(odishaDistrictBlocks).sort();

export const workflowStatusLabels: Record<WorkflowStatus, string> = {
  draft: 'Draft',
  pending_cmo_review: 'Pending CMO Review',
  reverted_by_cmo: 'Reverted by CMO',
  pending_cmo_reconsideration: 'Pending CMO Reconsideration',
  published: 'Published',
  pending_dept_acceptance: 'Pending Final Acceptance',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  pending_completion_review: 'Pending Completion Review',
  reverted_by_dept_reviewer: 'Reverted by Dept Reviewer',
  pending_cmo_completion_review: 'Pending CMO Completion Review',
  completed: 'Completed',
  dropped: 'Dropped',
  on_hold: 'On Hold',
};

// Statuses that count as "post publication". A CMO Reviewer may only drop, hold,
// or resume an announcement whose (current, or for resume the pre-hold) status is
// in this set — mirroring assertCanDropOrHold on the server.
export const POST_PUBLICATION_STATUSES: WorkflowStatus[] = [
  'published', 'pending_dept_acceptance', 'accepted', 'in_progress',
  'pending_completion_review', 'reverted_by_dept_reviewer', 'pending_cmo_completion_review',
];

function p2(n: number): string { return String(n).padStart(2, '0'); }

export function formatDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  if (!m || !d) return iso;
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return `${p2(ist.getUTCDate())}-${p2(ist.getUTCMonth() + 1)}-${ist.getUTCFullYear()} ${p2(ist.getUTCHours())}:${p2(ist.getUTCMinutes())}:${p2(ist.getUTCSeconds())}`;
}

export function filterVisibleAnnouncements(announcements: Announcement[], userId: number | undefined): Announcement[] {
  return announcements.filter(a => a.workflowStatus !== 'draft' || a.createdBy === userId);
}

export function excludeDrafts(announcements: Announcement[]): Announcement[] {
  return announcements.filter(a => a.workflowStatus !== 'draft');
}

export function scopeForUser(
  announcements: Announcement[],
  user: { id?: number; role: UserRole; department?: string } | null | undefined,
): Announcement[] {
  if (!user) return [];
  const isDeptRole = ['dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user', 'dept_viewer'].includes(user.role);
  if (isDeptRole) {
    if (!user.department) return [];
    return announcements.filter(a => a.department === user.department);
  }
  // Round-robin enforcement: cmo_reviewer only sees pending CMO items assigned to them.
  if (user.role === 'cmo_reviewer') {
    return announcements.filter(a => {
      const isPending = a.workflowStatus === 'pending_cmo_review' || a.workflowStatus === 'pending_cmo_completion_review';
      if (isPending) return a.assignedCmoReviewerId === user.id;
      return true;
    });
  }
  return announcements;
}

export const workflowStatusColors: Record<WorkflowStatus, string> = {
  draft: 'draft',
  pending_cmo_review: 'in-review',
  reverted_by_cmo: 'reverted',
  pending_cmo_reconsideration: 'reverted',
  published: 'published',
  pending_dept_acceptance: 'in-review',
  accepted: 'accepted',
  in_progress: 'in-progress',
  pending_completion_review: 'in-review',
  reverted_by_dept_reviewer: 'reverted',
  pending_cmo_completion_review: 'in-review',
  completed: 'completed',
  dropped: 'not-started',
  on_hold: 'reverted',
};
