import { Category } from '../entities/worker.entity';

export interface SeedTip {
  id: string;
  category: Category;
  seq: number;
  focus: string;
  textEn: string;
  /** DRAFT — a native Twi speaker MUST verify before recording (content pack). */
  textTw: string;
  audioEnUrl: string;
  audioTwUrl: string;
}

/**
 * The 9 tips (3 categories × 3), verbatim from the Bɛyɛ Yie Ghana content pack.
 * Twi lines are AI-generated DRAFTS pending native-speaker verification and
 * OT sign-off. Audio urls are the filenames the team will record against.
 */
export const SEED_TIPS: SeedTip[] = [
  // ── Load Workers — Kayayei · farmers · construction · porters ──
  {
    id: 'L1', category: 'load', seq: 1, focus: 'Lifting',
    textEn: 'Bend your knees, not your waist, when you lift.',
    textTw: 'Bɛn wo kotodwe mu, ɛnyɛ wo sisi, bere a woma adesoa so.',
    audioEnUrl: 'load_lifting_en.mp3', audioTwUrl: 'load_lifting_tw.mp3',
  },
  {
    id: 'L2', category: 'load', seq: 2, focus: 'Carrying',
    textEn: 'Keep the load close to your body, not far in front.',
    textTw: "Ma adesoa no mmɛn wo nipadua, mfa nsi w'anim akyirikyiri.",
    audioEnUrl: 'load_carrying_en.mp3', audioTwUrl: 'load_carrying_tw.mp3',
  },
  {
    id: 'L3', category: 'load', seq: 3, focus: 'Head-loading',
    textEn: 'Keep your neck straight and rest between heavy loads.',
    textTw: "Ma wo kɔn nteɛ, na gye w'ahome wɔ nnesoa duruduru ntam.",
    audioEnUrl: 'load_head_en.mp3', audioTwUrl: 'load_head_tw.mp3',
  },

  // ── Hand Workers — traders · tailors · hairdressers · market vendors ──
  {
    id: 'H1', category: 'hand', seq: 1, focus: 'Wrist position',
    textEn: 'Keep your wrist straight, not bent, during repeated work.',
    textTw: 'Ma wo nsateaa mu nteɛ, mmɛn no, bere a woreyɛ adwuma no.',
    audioEnUrl: 'hand_wrist_en.mp3', audioTwUrl: 'hand_wrist_tw.mp3',
  },
  {
    id: 'H2', category: 'hand', seq: 2, focus: 'Grip & breaks',
    textEn: 'Loosen your grip and take a short break every 30 minutes.',
    textTw: 'Gyae wo nsam den, na gye ahome kakra simma 30 biara.',
    audioEnUrl: 'hand_grip_en.mp3', audioTwUrl: 'hand_grip_tw.mp3',
  },
  {
    id: 'H3', category: 'hand', seq: 3, focus: 'Stretch',
    textEn: 'Open and stretch your fingers between tasks.',
    textTw: 'Bue na trɛw wo nsateaa mu wɔ adwuma ntam.',
    audioEnUrl: 'hand_stretch_en.mp3', audioTwUrl: 'hand_stretch_tw.mp3',
  },

  // ── Sitting / Driving Workers — drivers · office · students ──
  {
    id: 'S1', category: 'sitting', seq: 1, focus: 'Back support',
    textEn: 'Sit back fully in your seat so your lower back is supported.',
    textTw: "Tena w'akonnwa no mu yie na ma w'akyi ase nya nkurɔso.",
    audioEnUrl: 'sit_back_en.mp3', audioTwUrl: 'sit_back_tw.mp3',
  },
  {
    id: 'S2', category: 'sitting', seq: 2, focus: 'Move often',
    textEn: 'Stand up and move every 30 to 60 minutes.',
    textTw: 'Sɔre gyina na keka wo ho simma 30 kosi 60 biara.',
    audioEnUrl: 'sit_move_en.mp3', audioTwUrl: 'sit_move_tw.mp3',
  },
  {
    id: 'S3', category: 'sitting', seq: 3, focus: 'Neck / screen',
    textEn: "Keep your screen at eye level so you don't bend your neck.",
    textTw: 'Ma wo screen no nkɔ w\'ani so sɛnea worenkoto wo kɔn.',
    audioEnUrl: 'sit_neck_en.mp3', audioTwUrl: 'sit_neck_tw.mp3',
  },
];
