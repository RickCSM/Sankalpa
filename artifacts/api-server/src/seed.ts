import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  departmentsTable,
  usersTable,
  categoriesTable,
  tagsTable,
  districtsTable,
  blocksTable,
  occasionsTable,
  type UserRole,
} from "@workspace/db";
import { logger } from "./lib/logger";
import { seedAnnouncements } from "./lib/seed-announcements";

const DISTRICT_BLOCKS: Record<string, string[]> = {
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

const OCCASIONS = [
  "Independence Day",
  "Republic Day",
  "Utkal Divas",
  "Nuakhai",
  "Raja Parba",
  "Rath Yatra",
  "World Environment Day",
  "International Women's Day",
];

const DEPARTMENTS = [
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

const CATEGORIES = [
  "Infrastructure",
  "Healthcare",
  "Education",
  "Welfare",
  "Agriculture",
  "Industry",
  "Energy",
  "Renewable Energy",
  "Finance",
  "Revenue and Disaster Management",
  "Other",
];

// These were briefly seeded as top-level Announcement Category options but the
// requirement is for them to live as fixed sub-options under "Other" (stored as
// `category = "Other"` + `otherCategory` on the announcement). We deactivate any
// existing master rows so they stop appearing in the live category dropdown.
// Deactivation (rather than deletion) keeps historical announcements that still
// reference these categories displaying their stored category name.
const DEACTIVATED_TOP_LEVEL_CATEGORIES = [
  "Tourism",
  "Roads",
  "Bridges",
  "Buildings",
  "Irrigation",
  "Culture",
];

const TAGS = [
  "Priority",
  "Long-term",
  "Capital Project",
  "Pilot",
  "Centrally Sponsored",
  "State Sector",
  "Reviewed",
];

interface SeedUser {
  username: string;
  password: string;
  name: string;
  role: UserRole;
  department: string | null;
  email: string;
}

// DEV-ONLY: These credentials are used exclusively for local development seeding.
// They are never applied in production (seedUsers() hard-errors if NODE_ENV === "production").
const DEV_ONLY_USERS: SeedUser[] = [
  { username: "admin", password: "Admin@123", name: "System Administrator", role: "admin", department: null, email: "admin@sankalpa.gov.in" },
  { username: "cm", password: "Cm@123", name: "Shri Mohan Charan Majhi", role: "chief_minister", department: null, email: "cm@odisha.gov.in" },
  { username: "cmo_nodal", password: "Cmo@123", name: "Rajesh Kumar Sharma", role: "cmo_nodal", department: null, email: "cmo.nodal@odisha.gov.in" },
  { username: "cmo_reviewer", password: "Cmo@123", name: "Anita Mishra", role: "cmo_reviewer", department: null, email: "cmo.reviewer@odisha.gov.in" },
  { username: "dept_head", password: "Dept@123", name: "Dr. Sanjay Patel", role: "dept_head", department: "Agriculture & Farmers' Emp", email: "agri.head@odisha.gov.in" },
  { username: "dept_nodal", password: "Dept@123", name: "Priya Mohanty", role: "dept_nodal", department: "Agriculture & Farmers' Emp", email: "agri.nodal@odisha.gov.in" },
  { username: "dept_reviewer", password: "Dept@123", name: "Suresh Nayak", role: "dept_reviewer", department: "Agriculture & Farmers' Emp", email: "agri.reviewer@odisha.gov.in" },
];

// The set of usernames that were shipped as bootstrap accounts.
// Used by runProductionBootstrapRemediation() to identify accounts that
// may still carry default credentials.
const BOOTSTRAP_USERNAMES = DEV_ONLY_USERS.map((u) => u.username);

// Map of bootstrap-username -> default plaintext password as shipped in
// DEV_ONLY_USERS. Used by runProductionBootstrapRemediation() to decide
// whether a given account still carries the shipped default credential
// (in which case it should be deactivated) or has been changed by a human
// (in which case it must be left alone, or healed back to Active if it
// was incorrectly deactivated by a previous version of the remediation).
const DEFAULT_PASSWORD_BY_USERNAME: Record<string, string> = Object.fromEntries(
  DEV_ONLY_USERS.map((u) => [u.username, u.password]),
);

async function seedDepartments() {
  for (const name of DEPARTMENTS) {
    await db
      .insert(departmentsTable)
      .values({ name })
      .onConflictDoNothing({ target: departmentsTable.name });
  }
}

async function seedCategories() {
  for (const name of CATEGORIES) {
    await db
      .insert(categoriesTable)
      .values({ name })
      .onConflictDoNothing({ target: categoriesTable.name });
  }
  // Retire the categories that were briefly seeded as top-level options. They
  // now live as fixed sub-options under "Other"; deactivating them removes them
  // from the live dropdown while preserving historical announcement references.
  await db
    .update(categoriesTable)
    .set({ isActive: false })
    .where(inArray(categoriesTable.name, DEACTIVATED_TOP_LEVEL_CATEGORIES));
}

async function seedTags() {
  for (const name of TAGS) {
    await db
      .insert(tagsTable)
      .values({ name })
      .onConflictDoNothing({ target: tagsTable.name });
  }
}

async function seedDistrictsAndBlocks() {
  for (const districtName of Object.keys(DISTRICT_BLOCKS).sort()) {
    await db
      .insert(districtsTable)
      .values({ name: districtName })
      .onConflictDoNothing({ target: districtsTable.name });
  }
  const districtRows = await db
    .select({ id: districtsTable.id, name: districtsTable.name })
    .from(districtsTable);
  const idByName = new Map(districtRows.map((d) => [d.name, d.id]));
  for (const [districtName, blocks] of Object.entries(DISTRICT_BLOCKS)) {
    const districtId = idByName.get(districtName);
    if (!districtId) continue;
    for (const name of blocks) {
      const existing = await db
        .select({ id: blocksTable.id })
        .from(blocksTable)
        .where(and(eq(blocksTable.districtId, districtId), eq(blocksTable.name, name)))
        .limit(1);
      if (existing[0]) continue;
      await db.insert(blocksTable).values({ districtId, name });
    }
  }
}

async function seedOccasions() {
  for (const name of OCCASIONS) {
    await db
      .insert(occasionsTable)
      .values({ name })
      .onConflictDoNothing({ target: occasionsTable.name });
  }
}

async function seedUsers() {
  // Hard block: bootstrap user seeding must never run in production.
  // Callers in index.ts already gate on NODE_ENV, but this is a
  // defence-in-depth guard to prevent accidental invocation.
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "seedUsers() must not be called in production. " +
      "Use runProductionBootstrapRemediation() instead.",
    );
  }

  const deptRows = await db
    .select({ id: departmentsTable.id, name: departmentsTable.name })
    .from(departmentsTable);
  const deptIdByName = new Map(deptRows.map((d) => [d.name, d.id]));

  for (const u of DEV_ONLY_USERS) {
    const departmentId = u.department ? deptIdByName.get(u.department) ?? null : null;
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, u.username))
      .limit(1);
    if (existing[0]) {
      // Never touch an existing account — do not reset status, password,
      // role, or any other field. Admin changes must persist.
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 10);
    await db.insert(usersTable).values({
      username: u.username,
      passwordHash,
      name: u.name,
      role: u.role,
      departmentId,
      email: u.email,
      status: "Active",
    });
  }
}

/**
 * Returns true if the given (username, passwordHash) pair still matches the
 * shipped default credential for that bootstrap username. Returns false for
 * usernames that are not in the bootstrap set, or whose hash has been changed
 * away from the shipped default by a human.
 */
export async function isShippedDefaultCredential(
  username: string,
  passwordHash: string,
): Promise<boolean> {
  const defaultPassword = DEFAULT_PASSWORD_BY_USERNAME[username];
  if (!defaultPassword) return false;
  return bcrypt.compare(defaultPassword, passwordHash);
}

/**
 * Production-only remediation for bootstrap accounts.
 *
 * This function NEVER deactivates accounts (a previous version of this
 * remediation did, which locked legitimate admins out of their freshly
 * deployed system — see Task #114). Instead:
 *
 *   - Any bootstrap-username account whose status is currently `Inactive`
 *     is healed back to `Active`. This undoes the lockouts caused by the
 *     previous deactivation logic, regardless of whether the password hash
 *     still matches the shipped default.
 *   - Accounts that still carry the shipped default credential are logged
 *     as a warning so operators know a force-change-password flow is
 *     pending. The actual enforcement happens at login time via the
 *     `mustChangePassword` flag on the session.
 *
 * Idempotent: already-Active accounts are a no-op.
 */
export async function runProductionBootstrapRemediation(): Promise<void> {
  const bootstrapAccounts = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      status: usersTable.status,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(inArray(usersTable.username, BOOTSTRAP_USERNAMES));

  if (bootstrapAccounts.length === 0) {
    logger.info("Production bootstrap remediation: no bootstrap accounts found");
    return;
  }

  for (const account of bootstrapAccounts) {
    // Heal: previous buggy remediation may have deactivated this user.
    // Restore them to Active so they can log in (and be force-redirected
    // to /change-password if they still use the default password).
    if (account.status === "Inactive") {
      await db
        .update(usersTable)
        .set({ status: "Active" })
        .where(eq(usersTable.id, account.id));
      logger.warn(
        { username: account.username, userId: account.id },
        "Production bootstrap remediation: healed account reactivated (was Inactive after previous buggy remediation).",
      );
    }

    // Surface a single warn line per startup for accounts still on default
    // credentials, so operators have a visible signal. Login itself is not
    // blocked — the user will be forced to change the password on first
    // successful login via the mustChangePassword session flag.
    const stillDefault = await isShippedDefaultCredential(
      account.username,
      account.passwordHash,
    );
    if (stillDefault) {
      logger.warn(
        { username: account.username, userId: account.id },
        "Production bootstrap remediation: account still uses the shipped default credential. The user will be forced to change it on next login.",
      );
    }
  }
}

export async function runSeed(): Promise<void> {
  await seedDepartments();
  await seedCategories();
  await seedTags();
  await seedDistrictsAndBlocks();
  await seedOccasions();
  await seedUsers();
  await seedAnnouncements();
  logger.info("Seed completed");
}

export async function runMasterDataSeed(): Promise<void> {
  await seedDepartments();
  await seedCategories();
  await seedTags();
  await seedDistrictsAndBlocks();
  await seedOccasions();
  logger.info("Master-data seed completed");
}

if (process.argv[1] && process.argv[1].endsWith("seed.mjs")) {
  runSeed()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "Seed failed");
      process.exit(1);
    });
}
