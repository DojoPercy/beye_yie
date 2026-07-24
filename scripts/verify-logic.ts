/**
 * Standalone verification of the pure clinical logic — no DB or network.
 * Exercises the pieces that matter most: the red-flag safety gate rules, the
 * phrase→tip mapping, and the knowledge retrieval.
 */
import { runRedFlagRules } from '../src/agent/safety/red-flag.rules';
import { matchPhrase } from '../src/agent/knowledge/phrase-map';
import { matchTopics } from '../src/agent/knowledge/knowledge-base';
import { fallbackReply } from '../src/agent/grounded/prompts';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[1] Red-flag safety gate — MUST escalate:');
for (const msg of [
  'my leg went numb and I cannot move it after I fell',
  'I have chest pain and difficulty breathing',
  'severe pain, worst pain ever, 10/10',
  'fever with the pain and my calf is red and warm',
  'I cannot control my bladder and my back hurts',
]) {
  check(`escalates: "${msg.slice(0, 40)}…"`, runRedFlagRules(msg).matched);
}

console.log('\n[2] Red-flag gate — MUST NOT escalate (normal prevention):');
for (const msg of [
  'my wrist de pain small when I sew',
  'my back hurts a little after carrying',
  'how do I lift a heavy basin?',
]) {
  check(`allows: "${msg.slice(0, 40)}…"`, !runRedFlagRules(msg).matched);
}

console.log('\n[3] Phrase → tip mapping:');
check('"my wrist de pain" → H1', matchPhrase('my wrist de pain')?.tipId === 'H1');
check('"the load too heavy" → L2', matchPhrase('the load too heavy')?.tipId === 'L2');
check('"me kɔn yare" (Twi neck) → L3', matchPhrase('me kɔn yare')?.tipId === 'L3');
check('"metena fam daa" (Twi sit) → S2', matchPhrase('metena fam daa')?.tipId === 'S2');

console.log('\n[4] Knowledge retrieval (grounding):');
check('back message retrieves a topic', matchTopics('my lower back hurts', 'load').length > 0);
check('wrist message retrieves wrist-hand', matchTopics('my wrist and fingers tingle', 'hand').some((t) => t.id === 'wrist-hand'));

console.log('\n[5] OTPF-informed market-work guidance:');
check(
  'repeated squatting retrieves work-modification guidance',
  matchTopics('I squat to arrange goods on the floor all day', 'load').some((t) => t.id === 'bending-squatting-arranging-goods'),
);
check(
  'long workdays retrieve pacing guidance',
  matchTopics('I stand for long hours and need breaks', 'sitting').some((t) => t.id === 'work-pacing-and-breaks'),
);

console.log('\n[6] Natural, non-repeating safety language:');
check(
  'brief follow-up fallback does not append the stock disclaimer',
  !fallbackReply([], 'en').toLowerCase().includes('medical treatment'),
);

console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
