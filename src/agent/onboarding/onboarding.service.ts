import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { Category, GoodsType, Language, WorkActivity, Worker } from '../../database/entities/worker.entity';
import { NormalizedInbound, WhatsAppOutbound } from '../../whatsapp/whatsapp.types';
import { WorkerService } from '../worker/worker.service';
import { TipVoiceOfferService } from '../tips/tip-voice-offer.service';

/**
 * Onboarding quiz (content pack §8, spec §1). A small state machine over
 * numbered button/list menus so low-literacy workers can just tap a reply:
 *
 *   start → language → name → age → goods → market → hours
 *         → main work activity → first tip offer → tip time → done
 *
 * Kept deterministic (no LLM) so it is cheap, predictable, and works offline.
 *
 * The four profile questions are all skippable. Registration detail is worth
 * having, but not at the cost of a worker abandoning the flow before she has
 * the safety gate and the daily tips — the parts that actually protect her.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly workers: WorkerService,
    private readonly config: ConfigService<AppConfig>,
    private readonly tipOffers: TipVoiceOfferService,
  ) {}

  isOnboarding(worker: Worker): boolean {
    return !worker.onboarded;
  }

  /** Handle one onboarding turn; returns the messages to send back. */
  async handle(worker: Worker, inbound: NormalizedInbound): Promise<WhatsAppOutbound[]> {
    const step = worker.onboardingStep ?? 'start';
    const choice = inbound.replyId ?? inbound.text.trim();

    switch (step) {
      case 'start':
        // First contact — greet and ask language.
        worker.onboardingStep = 'language';
        await this.workers.save(worker);
        return [this.askLanguage()];

      case 'language': {
        const lang = this.parseLanguage(choice);
        if (!lang) return [this.askLanguage()];
        worker.language = lang;
        worker.onboardingStep = 'name';
        await this.workers.save(worker);
        return this.welcomeAfterLanguage(lang);
      }

      case 'name': {
        const name = inbound.text.trim();
        if (name && !inbound.replyId) worker.name = name.slice(0, 40);
        worker.onboardingStep = 'age';
        await this.workers.save(worker);
        return [this.askAge(worker.language)];
      }

      case 'age': {
        worker.age = this.parseAge(inbound.text);
        worker.onboardingStep = 'goods';
        await this.workers.save(worker);
        return [this.askGoods(worker.language)];
      }

      case 'goods': {
        worker.goodsSold = this.parseGoods(choice);
        worker.onboardingStep = 'market';
        await this.workers.save(worker);
        return [this.askMarket(worker.language)];
      }

      case 'market': {
        const market = inbound.text.trim();
        worker.marketLocation = this.isSkip(market) ? null : market.slice(0, 80) || null;
        worker.onboardingStep = 'hours';
        await this.workers.save(worker);
        return [this.askHours(worker.language)];
      }

      case 'hours': {
        worker.avgWorkHours = this.parseHours(choice);
        worker.onboardingStep = 'work_activity';
        await this.workers.save(worker);
        return [this.askWorkActivity(worker.language, worker.name)];
      }

      // `category` was used by an earlier version of onboarding. Retain it
      // here so anyone part-way through that version can still finish.
      case 'category':
      case 'work_activity': {
        const activity = this.parseWorkActivity(choice);
        if (!activity) return [this.askWorkActivity(worker.language, worker.name)];
        worker.workActivity = activity;
        worker.category = this.categoryForActivity(activity);
        const firstTip = await this.tipOffers.firstFor(worker);
        worker.onboardingStep = firstTip ? 'first_tip_offer' : 'tiptime';
        await this.workers.save(worker);
        return firstTip ? this.tipOffers.buildOffer(worker, firstTip) : [this.askTipTime(worker.language)];
      }

      case 'first_tip_offer': {
        // Button replies are handled before onboarding in PipelineService so
        // the selected voice asset can be generated and sent. Do not silently
        // set a default time when a worker has not made that choice yet.
        const tip = await this.tipOffers.firstFor(worker);
        return tip
          ? this.tipOffers.buildOffer(worker, tip)
          : [this.askTipTime(worker.language)];
      }

      case 'tiptime': {
        const time = this.parseTipTime(choice);
        worker.tipTime = time;
        worker.onboardingStep = null;
        worker.onboarded = true;
        await this.workers.save(worker);
        return this.finish(worker);
      }

      default:
        worker.onboarded = true;
        worker.onboardingStep = null;
        await this.workers.save(worker);
        return this.finish(worker);
    }
  }

  // ── Prompts ──
  private askLanguage(): WhatsAppOutbound {
    return {
      type: 'buttons',
      body:
        'Akwaaba! 🌿 Bɛyɛ Yie shares simple ways to reduce strain from work.\nYɛma afotu a ɛbɛboa wo ma woayɛ w’adwuma yiye.\n\nWhich language do you prefer?\nDeɛn kasa na wopɛ?',
      buttons: [
        { id: 'lang_tw', title: 'Twi' },
        { id: 'lang_en', title: 'English' },
      ],
    };
  }

  /**
   * The welcome clip is a reviewed, pre-rendered asset. It is intentionally
   * not generated from the worker's data, so onboarding stays instant and
   * carries no per-worker TTS cost. If it is not configured, text remains a
   * complete, safe fallback.
   */
  private welcomeAfterLanguage(lang: Language): WhatsAppOutbound[] {
    const audio = this.getWelcomeAudio(lang);
    return audio ? [audio, this.askName(lang)] : [this.askName(lang, true)];
  }

  private getWelcomeAudio(lang: Language): WhatsAppOutbound | null {
    const source = this.config.get('welcomeAudio', { infer: true })?.[lang];
    // Prefer Meta-hosted media: no public link needs to remain available for
    // every new onboarding conversation.
    if (source?.mediaId) return { type: 'audio', mediaId: source.mediaId };
    if (source?.link) return { type: 'audio', link: source.link };
    return null;
  }

  private askName(lang: Language, includeScope = false): WhatsAppOutbound {
    const scope = includeScope
      ? lang === 'tw'
        ? 'Yɛma ahwɛyie afotu; ɛnyɛ ayaresa.\n\n'
        : 'We share prevention information, not medical treatment.\n\n'
      : '';
    return {
      type: 'text',
      body:
        scope +
        (lang === 'tw'
          ? 'Yɛmfrɛ wo sɛn? (Kyerɛw wo din.)'
          : 'What should we call you? (Type your name.)'),
    };
  }

  private askAge(lang: Language): WhatsAppOutbound {
    return {
      type: 'text',
      body:
        lang === 'tw'
          ? 'Wadi mfe ahe? (Kyerɛw nɔmba no. Sɛ wompɛ sɛ woka a, kyerɛw "skip".)'
          : 'How old are you? (Type the number, or type "skip".)',
    };
  }

  private askGoods(lang: Language): WhatsAppOutbound {
    return {
      type: 'list',
      body: lang === 'tw' ? 'Nneɛma bɛn na wotɔn?' : 'What do you sell?',
      button: lang === 'tw' ? 'Paw' : 'Choose',
      rows: [
        { id: 'goods_produce', title: lang === 'tw' ? 'Nhabamma / nnuaba' : 'Vegetables or fruit', description: 'Tomatoes, pepper, plantain, fruit' },
        { id: 'goods_grains', title: lang === 'tw' ? 'Aburow / adua' : 'Grains, beans or rice', description: 'Maize, rice, beans, gari' },
        { id: 'goods_fish_meat', title: lang === 'tw' ? 'Nam / nsuomnam' : 'Fish or meat', description: 'Fresh, smoked, or frozen' },
        { id: 'goods_cooked_food', title: lang === 'tw' ? 'Aduan a wɔanoa' : 'Cooked food', description: 'Chop bar, waakye, kenkey, drinks' },
        { id: 'goods_provisions', title: lang === 'tw' ? 'Provisions' : 'Provisions', description: 'Sachets, tins, soap, small items' },
        { id: 'goods_clothing', title: lang === 'tw' ? 'Ntama / ntade' : 'Clothing or textiles', description: 'Cloth, second-hand clothes, shoes' },
        { id: 'goods_hardware', title: lang === 'tw' ? 'Efie nneɛma' : 'Hardware or household goods', description: 'Buckets, pots, tools, charcoal' },
        { id: 'goods_other', title: lang === 'tw' ? 'Foforɔ' : 'Something else', description: 'Anything not listed here' },
        { id: 'goods_skip', title: lang === 'tw' ? 'Mempɛ sɛ meka' : 'Rather not say', description: 'Skip this question' },
      ],
    };
  }

  private askMarket(lang: Language): WhatsAppOutbound {
    return {
      type: 'text',
      body:
        lang === 'tw'
          ? 'Dwam bɛn na wotɔn wɔ hɔ? (Kyerɛw dwam no din, anaa "skip".)'
          : 'Which market do you work in? (Type the name, or type "skip".)',
    };
  }

  private askHours(lang: Language): WhatsAppOutbound {
    return {
      type: 'buttons',
      body:
        lang === 'tw'
          ? 'Da biara, nnɔnhwerew ahe na woyɛ adwuma?'
          : 'On a normal day, how many hours do you work?',
      buttons: [
        { id: 'hours_short', title: lang === 'tw' ? 'Bɛyɛ 6' : 'About 6' },
        { id: 'hours_medium', title: lang === 'tw' ? 'Bɛyɛ 10' : 'About 10' },
        { id: 'hours_long', title: lang === 'tw' ? '12 anaa boro' : '12 or more' },
      ],
    };
  }

  private askWorkActivity(lang: Language, name: string | null): WhatsAppOutbound {
    const hi = name ? `${name}, ` : '';
    return {
      type: 'list',
      body:
        lang === 'tw'
          ? `${hi}adwuma bɛn na ɛma wo ho yɛ wo ya paa?`
          : `${hi}which part of your market work puts the most strain on your body?`,
      button: lang === 'tw' ? 'Paw' : 'Choose',
      rows: [
        { id: 'activity_carrying', title: lang === 'tw' ? 'Nnesoa / nneɛma a ɛyɛ duru' : 'Carrying or lifting goods', description: 'Baskets, bags, boxes, or water' },
        { id: 'activity_head_loading', title: lang === 'tw' ? 'Kayayei / nnesoa wɔ ti so' : 'Carrying goods on my head', description: 'Head-loading or portering' },
        { id: 'activity_standing_walking', title: lang === 'tw' ? 'Gyina anaa nantew bere tenten' : 'Standing or walking at my stall', description: 'On your feet for much of the day' },
        { id: 'activity_bending_squatting', title: lang === 'tw' ? 'Koto anaa kotow siesie nneɛma' : 'Bending or squatting for goods', description: 'Arranging, cleaning, or picking items up' },
        { id: 'activity_hand_work', title: lang === 'tw' ? 'Nsa adwuma a ɛkɔ so' : 'Repeated hand work', description: 'Cooking, cutting, packing, or sewing' },
        { id: 'activity_sitting_leaning', title: lang === 'tw' ? 'Tena anaa koto hwɛ nneɛma' : 'Sitting or leaning at my stall', description: 'Selling from a stool or the ground' },
      ],
    };
  }

  private askTipTime(lang: Language): WhatsAppOutbound {
    return {
      type: 'buttons',
      body:
        lang === 'tw'
          ? 'Bere bɛn na yɛmfa da biara afotu no mmrɛ wo?'
          : 'When should we send your daily tip?',
      buttons: [
        { id: 'time_0530', title: lang === 'tw' ? 'Anɔpa 5:30' : 'Morning 5:30' },
        { id: 'time_0630', title: lang === 'tw' ? 'Anɔpa 6:30' : 'Morning 6:30' },
        { id: 'time_1900', title: lang === 'tw' ? 'Anwummerɛ 7' : 'Evening 7:00' },
      ],
    };
  }

  /** Complete the voice-offer stage only after Play or No thanks is chosen. */
  async continueAfterFirstTipOffer(worker: Worker): Promise<WhatsAppOutbound[]> {
    if (worker.onboardingStep !== 'first_tip_offer') return [];
    worker.onboardingStep = 'tiptime';
    await this.workers.save(worker);
    return [this.askTipTime(worker.language)];
  }

  private finish(worker: Worker): WhatsAppOutbound[] {
    const lang = worker.language;
    const body =
      lang === 'tw'
        ? `Yɛasiesie wo ho! 💚 Yɛbɛfa afotu ketewa da biara ka wo ho.\nSɛ biribi haw wo a, kyerɛw kyerɛ me bere biara — mɛboa.`
        : `You're all set! 💚 We'll send a short tip each day to protect your body.\nAnytime something hurts, just message me — I'm here to help.`;
    return [{ type: 'text', body }];
  }

  // ── Parsers ──

  /** Any of the ways a worker signals she'd rather not answer. */
  private isSkip(text: string): boolean {
    return /^(skip|no|dabi|pass|-|\.)$/i.test(text.trim());
  }

  /**
   * Age, or null when skipped or implausible. Out-of-range numbers are more
   * likely a mistyped year or a phone number than a real age.
   */
  private parseAge(text: string): number | null {
    if (this.isSkip(text)) return null;
    const m = text.match(/\b(\d{1,3})\b/);
    if (!m) return null;
    const age = Number(m[1]);
    return age >= 12 && age <= 100 ? age : null;
  }

  private parseGoods(choice: string): GoodsType | null {
    const c = choice.toLowerCase();
    if (c === 'goods_skip' || this.isSkip(c)) return null;
    if (c === 'goods_produce' || /veget|fruit|nhabamma|nnuaba|tomato|pepper|plantain/.test(c)) return 'produce';
    if (c === 'goods_grains' || /grain|rice|bean|maize|aburow|adua|gari/.test(c)) return 'grains';
    if (c === 'goods_fish_meat' || /fish|meat|nam/.test(c)) return 'fish_meat';
    if (c === 'goods_cooked_food' || /cook|food|chop|waakye|kenkey|aduan/.test(c)) return 'cooked_food';
    if (c === 'goods_provisions' || /provision|sachet|soap/.test(c)) return 'provisions';
    if (c === 'goods_clothing' || /cloth|textile|ntama|ntade|shoe/.test(c)) return 'clothing_textiles';
    if (c === 'goods_hardware' || /hardware|household|bucket|pot|tool|charcoal|efie/.test(c)) return 'hardware_household';
    if (c === 'goods_other' || /other|foforo/.test(c)) return 'other';
    return null;
  }

  /**
   * Average hours per day. Menu choices store the band midpoint; a worker who
   * types a number instead has it taken at face value.
   */
  private parseHours(choice: string): number | null {
    const c = choice.toLowerCase();
    if (c === 'hours_short') return 6;
    if (c === 'hours_medium') return 10;
    if (c === 'hours_long') return 13;
    if (this.isSkip(c)) return null;
    const m = c.match(/\b(\d{1,2})\b/);
    if (!m) return null;
    const hours = Number(m[1]);
    return hours >= 1 && hours <= 24 ? hours : null;
  }

  private parseLanguage(choice: string): Language | null {
    const c = choice.toLowerCase();
    if (c === 'lang_tw' || c.includes('twi') || c === '1') return 'tw';
    if (c === 'lang_en' || c.includes('english') || c === '2') return 'en';
    return null;
  }

  private parseWorkActivity(choice: string): WorkActivity | null {
    const c = choice.toLowerCase();
    if (c === 'activity_head_loading' || c.includes('head') || c.includes('kayayei') || c.includes('ti so') || c === '2') return 'head_loading';
    if (c === 'activity_carrying' || c === 'cat_load' || c.includes('lift') || c.includes('carry') || c.includes('load') || c.includes('nnesoa') || c === '1') return 'carrying';
    if (c === 'activity_standing_walking' || c.includes('stand') || c.includes('walk') || c.includes('gyina') || c.includes('nantew') || c === '3') return 'standing_walking';
    if (c === 'activity_bending_squatting' || c.includes('bend') || c.includes('squat') || c.includes('koto') || c === '4') return 'bending_squatting';
    if (c === 'activity_hand_work' || c === 'cat_hand' || c.includes('hand') || c.includes('nsa') || c.includes('cook') || c.includes('sew') || c === '5') return 'repetitive_hand_work';
    if (c === 'activity_sitting_leaning' || c === 'cat_sitting' || c.includes('sit') || c.includes('lean') || c.includes('tena') || c === '6') return 'sitting_leaning';
    return null;
  }

  private categoryForActivity(activity: WorkActivity): Category {
    switch (activity) {
      case 'repetitive_hand_work':
        return 'hand';
      case 'standing_walking':
      case 'sitting_leaning':
        return 'sitting';
      default:
        return 'load';
    }
  }

  private parseTipTime(choice: string): string {
    const c = choice.toLowerCase();
    if (c === 'time_0530') return '05:30';
    if (c === 'time_1900') return '19:00';
    // Accept a raw HH:mm the worker typed.
    const m = choice.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
    return '06:30';
  }
}
