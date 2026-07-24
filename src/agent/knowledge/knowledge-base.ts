import { Category } from '../../database/entities/worker.entity';

/**
 * Vetted OT knowledge base. Grounded in the two OT reference documents
 * (lower-limb, upper-limb/thoracic, OTPF, and the Ghana market-women /
 * kayayei evidence pack). The grounded agent answers ONLY from these topics —
 * it never free-associates medical advice. Keep every entry short, factual,
 * plain (grade 5–6 English), and framed as options, not directives.
 */
export interface KnowledgeTopic {
  id: string;
  keywords: string[];
  category?: Category; // undefined = applies to all
  title: string;
  body: string;
}

export const KNOWLEDGE_BASE: KnowledgeTopic[] = [
  // ── General safe-work principles ──
  {
    id: 'safe-lifting',
    keywords: ['lift', 'lifting', 'pick up', 'heavy', 'sack', 'basin', 'bend', 'waist'],
    category: 'load',
    title: 'Safe lifting',
    body: 'Bend your knees, not your waist, when you lift. Keep the load close to your body and avoid twisting while you carry. Share the weight evenly, and ask for help when a load is beyond you. Small changes protect your back over time.',
  },
  {
    id: 'head-loading',
    keywords: ['head', 'head load', 'kaya', 'kayayei', 'porter', 'neck', 'carry on head'],
    category: 'load',
    title: 'Head-loading and neck care',
    body: 'Put a soft cloth pad on your head before you carry. Keep your neck straight, change which side you carry on, and rest between heavy loads even for a short time. Stretch your neck and shoulders when you rest.',
  },
  {
    id: 'back-pain',
    keywords: ['back', 'lower back', 'waist', 'sisi', 'akyi', 'spine'],
    title: 'Lower back pain from work',
    body: 'Back pain is common for people who lift and carry. It often comes from bending the wrong way, carrying too much, or working long without a rest. Bend your knees to lift, keep loads close, take short rests, and stretch gently after work. If it does not ease in two weeks, or spreads down your leg, see a doctor or physiotherapist.',
  },
  {
    id: 'standing-legs',
    keywords: ['stand', 'standing', 'legs', 'feet', 'foot', 'swell', 'swelling', 'ache', 'knee'],
    category: 'sitting',
    title: 'Standing, legs and feet',
    body: 'Standing many hours can make legs and feet tired and sore. Wear shoes that support your feet. Sit and rest when you can, and lift your legs up for a few minutes during breaks. Move your ankles and stretch your calves. If one leg suddenly swells more than the other, or turns red and warm, go to a hospital right away.',
  },
  {
    id: 'sitting-posture',
    keywords: ['sit', 'sitting', 'driver', 'driving', 'office', 'chair', 'posture', 'screen'],
    category: 'sitting',
    title: 'Sitting and posture',
    body: 'Choose a seat or stool height that lets you sit comfortably, with your lower back supported where possible. Stand up and move every 30 to 60 minutes. Avoid staying bent forward over goods for a long time; alternate sitting, standing and walking through the day.',
  },
  {
    id: 'bending-squatting-arranging-goods',
    keywords: ['squat', 'squatting', 'bend', 'bending', 'floor', 'ground', 'arrange', 'arranging', 'clean', 'cleaning', 'pick from ground'],
    category: 'load',
    title: 'Bending, squatting and arranging goods',
    body: 'Repeated bending or long squatting can strain your knees, hips and lower back. If you can, raise goods from the floor onto a low table, box or stable surface. Change position often, avoid staying in a squat for long, and use your knees rather than bending only from your waist when you pick something up.',
  },
  {
    id: 'work-pacing-and-breaks',
    keywords: ['break', 'breaks', 'rest', 'long hours', 'all day', 'hours', 'busy', 'pace', 'pacing', 'tired after work'],
    category: undefined,
    title: 'Pacing a long workday',
    body: 'Long workdays can build up pain and fatigue. Plan small movement or rest breaks between tasks when you can, and change position rather than staying in one posture all day. Rotating between tasks can reduce repeated strain on one part of your body.',
  },
  {
    id: 'wrist-hand',
    keywords: ['wrist', 'hand', 'finger', 'grip', 'nsa', 'nsateaa', 'sew', 'tailor', 'hairdresser', 'tingling', 'numb hand'],
    category: 'hand',
    title: 'Wrist and hand care',
    body: 'Keep your wrist straight, not bent, during repeated work. Loosen your grip, rotate between tasks when possible, and take a short break every 30 minutes. Open and stretch your fingers between tasks. If your fingers tingle or feel numb, especially at night, mention it to a health worker.',
  },
  {
    id: 'neck-shoulder',
    keywords: ['neck', 'shoulder', 'shoulders', 'kɔn', 'stiff', 'headache'],
    title: 'Neck and shoulder pain',
    body: 'Neck and shoulder pain often comes from carrying on one side, looking down, or reaching for long periods. Balance loads on both sides, alternate carrying sides, keep an upright posture, and stretch your neck and shoulders in your breaks.',
  },
  {
    id: 'stretches',
    keywords: ['stretch', 'stretching', 'exercise', 'warm up', 'warmup', 'routine'],
    title: 'Simple stretches',
    body: 'Warm up before work with 5 minutes of gentle stretching for legs, back, shoulders and arms. For the neck, tilt your head slowly side to side and hold 15–30 seconds. For shoulders, bring an arm across your chest and hold. For hands, open and close them and stretch the fingers. Stop if any stretch causes sharp pain.',
  },
  {
    id: 'no-money',
    keywords: ['no money', 'cannot buy', 'free', 'afford', 'equipment', 'cost'],
    title: 'Protecting your body with no money',
    body: 'You do not need to buy anything to protect your body. Share weight evenly on both sides. Use a soft cloth pad on your head. Change how you carry often. Bend your knees when you lift. Take short rests between trips. Drink water and eat when you can. These small changes help a lot over time.',
  },
  {
    id: 'tired-stressed',
    keywords: ['tired', 'stress', 'stressed', 'ache all over', 'weak', 'exhausted', 'worried', 'sad'],
    title: 'Tiredness and stress from heavy work',
    body: 'Carrying heavy loads for many hours tires the body and the mind. This is common and not your fault. Rest between loads, drink water, eat regular meals, and talk to people you trust about how you feel. If you feel very tired, sad or worried most days, please talk to a health worker.',
  },
  {
    id: 'recovery',
    keywords: ['recover', 'recovery', 'evening', 'after work', 'rest', 'sleep', 'warm water', 'massage'],
    title: 'Evening recovery',
    body: 'After work, stretch gently before resting to reduce stiffness. Warm water or a warm soak can relax tired muscles. Elevate your feet for a few minutes to ease swelling. Good sleep lets muscles and joints recover. Notice which activities increased your pain, and adjust them the next day.',
  },
  {
    id: 'hydration',
    keywords: ['water', 'drink', 'hydrate', 'hydration', 'cramp', 'cramps'],
    title: 'Hydration',
    body: 'Drink enough water before and during work. Good hydration reduces fatigue and muscle cramps, and helps your muscles work better through a long day.',
  },
];

/** The standing disclaimer / referral line every advice reply closes with. */
export const DISCLAIMER = {
  en: 'This is general prevention advice, not medical treatment. For serious or lasting pain, please see a health professional.',
  tw: 'Yei yɛ ahwɛyie afotu, ɛnyɛ ayaresa. Sɛ ɛyaw no mu yɛ den anaa ɛkyɛ a, kɔhwɛ ɔyaresafo.',
};

/** Rank knowledge topics against a message; bias toward the worker's category. */
export function matchTopics(
  message: string,
  category: Category | null | undefined,
  limit = 3,
): KnowledgeTopic[] {
  const text = message.toLowerCase();
  const scored = KNOWLEDGE_BASE.map((topic) => {
    let score = 0;
    for (const kw of topic.keywords) {
      if (text.includes(kw.toLowerCase())) score += 2;
    }
    if (score > 0 && topic.category && topic.category === category) score += 1;
    return { topic, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.topic);
}
