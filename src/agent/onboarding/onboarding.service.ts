import { Injectable } from '@nestjs/common';
import { Category, Language, Worker } from '../../database/entities/worker.entity';
import { NormalizedInbound, WhatsAppOutbound } from '../../whatsapp/whatsapp.types';
import { WorkerService } from '../worker/worker.service';

/**
 * Onboarding quiz (content pack §8). A small state machine over numbered
 * button/list menus so low-literacy workers can just tap a reply:
 *   start → language → name → category → tip time → done
 *
 * Kept deterministic (no LLM) so it is cheap, predictable, and works offline.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly workers: WorkerService) {}

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
        return [this.askName(lang)];
      }

      case 'name': {
        const name = inbound.text.trim();
        if (name && !inbound.replyId) worker.name = name.slice(0, 40);
        worker.onboardingStep = 'category';
        await this.workers.save(worker);
        return [this.askCategory(worker.language, worker.name)];
      }

      case 'category': {
        const cat = this.parseCategory(choice);
        if (!cat) return [this.askCategory(worker.language, worker.name)];
        worker.category = cat;
        worker.onboardingStep = 'tiptime';
        await this.workers.save(worker);
        return [this.askTipTime(worker.language)];
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
      body: 'Akwaaba! 🌿 Welcome to Bɛyɛ Yie Ghana.\nWhich language do you prefer?\n\nDeɛn kasa na wopɛ?',
      buttons: [
        { id: 'lang_tw', title: 'Twi' },
        { id: 'lang_en', title: 'English' },
      ],
    };
  }

  private askName(lang: Language): WhatsAppOutbound {
    return {
      type: 'text',
      body: lang === 'tw' ? 'Yɛmfrɛ wo sɛn? (Kyerɛw wo din.)' : 'What should we call you? (Type your name.)',
    };
  }

  private askCategory(lang: Language, name: string | null): WhatsAppOutbound {
    const hi = name ? `${name}, ` : '';
    return {
      type: 'list',
      body:
        lang === 'tw'
          ? `${hi}deɛn adwuma na woyɛ?`
          : `${hi}what kind of work do you do?`,
      button: lang === 'tw' ? 'Paw' : 'Choose',
      rows: [
        { id: 'cat_load', title: lang === 'tw' ? 'Nnesoa' : 'Load / carrying', description: 'Kayayei, farming, construction, porters' },
        { id: 'cat_hand', title: lang === 'tw' ? 'Nsa adwuma' : 'Hand work', description: 'Traders, tailors, hairdressers, vendors' },
        { id: 'cat_sitting', title: lang === 'tw' ? 'Tenabea/Ka' : 'Sitting / driving', description: 'Drivers, office, students' },
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

  private finish(worker: Worker): WhatsAppOutbound[] {
    const lang = worker.language;
    const body =
      lang === 'tw'
        ? `Yɛasiesie wo ho! 💚 Yɛbɛfa afotu ketewa da biara ka wo ho.\nSɛ biribi haw wo a, kyerɛw kyerɛ me bere biara — mɛboa.\n\nYei yɛ ahwɛyie afotu, ɛnyɛ ayaresa.`
        : `You're all set! 💚 We'll send a short tip each day to protect your body.\nAnytime something hurts, just message me — I'm here to help.\n\nThis is general prevention advice, not medical treatment. For serious or lasting pain, see a health professional.`;
    return [{ type: 'text', body }];
  }

  // ── Parsers ──
  private parseLanguage(choice: string): Language | null {
    const c = choice.toLowerCase();
    if (c === 'lang_tw' || c.includes('twi') || c === '1') return 'tw';
    if (c === 'lang_en' || c.includes('english') || c === '2') return 'en';
    return null;
  }

  private parseCategory(choice: string): Category | null {
    const c = choice.toLowerCase();
    if (c === 'cat_load' || c.includes('load') || c.includes('carry') || c.includes('nnesoa') || c === '1') return 'load';
    if (c === 'cat_hand' || c.includes('hand') || c.includes('nsa') || c === '2') return 'hand';
    if (c === 'cat_sitting' || c.includes('sit') || c.includes('driv') || c.includes('tena') || c === '3') return 'sitting';
    return null;
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
