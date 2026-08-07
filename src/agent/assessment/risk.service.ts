import { Injectable } from '@nestjs/common';
import { Assessment, RiskLevel } from '../../database/entities/assessment.entity';
import { Worker } from '../../database/entities/worker.entity';

export interface RiskOutcome {
  level: RiskLevel;
  /** Plain-language reasons, for the OT's referral record — not for the worker. */
  reasons: string[];
}

/**
 * Risk grading for the initial assessment (spec §2).
 *
 * IMPORTANT — this is a triage aid, not a diagnosis. It answers one question:
 * how strongly should the bot push this worker toward a real professional?
 * Emergencies never reach here; the deterministic red-flag gate intercepts
 * those before any advice or scoring runs.
 *
 * ⚠️ OT SIGN-OFF PENDING — every threshold below is a starting point drawn
 * from the content pack and must be confirmed by the project's occupational
 * therapist before the pilot. They are deliberately gathered in one pure
 * function so a clinician can review them without reading the app.
 */
@Injectable()
export class RiskService {
  /** Pain at or above this is treated as high severity. */
  private static readonly HIGH_NRS = 7;
  /** Pain at or above this (but below HIGH_NRS) is moderate. */
  private static readonly MODERATE_NRS = 4;
  /** A working day this long is itself a risk factor when pain is present. */
  private static readonly LONG_WORKDAY_HOURS = 12;

  score(assessment: Assessment, worker: Worker): RiskOutcome {
    // No pain reported — prevention track, nothing to grade.
    if (assessment.painPresent === false) {
      return { level: 'low', reasons: ['No pain reported at assessment'] };
    }

    const high: string[] = [];
    const moderate: string[] = [];

    const nrs = assessment.nrs;
    if (nrs !== null && nrs !== undefined) {
      if (nrs >= RiskService.HIGH_NRS) high.push(`Pain rated ${nrs}/10`);
      else if (nrs >= RiskService.MODERATE_NRS) moderate.push(`Pain rated ${nrs}/10`);
    }

    // Occupational performance carries the most weight: losing the ability to
    // work is the outcome this project exists to prevent.
    if (assessment.functionImpact === 'cannot_work') high.push('Unable to work');
    else if (assessment.functionImpact === 'a_lot') moderate.push('Work and daily activities affected a lot');

    if (assessment.durationBand === 'months_3_plus') high.push('Symptoms lasting more than 3 months');
    else if (assessment.durationBand === 'months_1_3') moderate.push('Symptoms lasting 1–3 months');

    // Already sought clinical care and still symptomatic — self-care advice
    // alone is unlikely to be the answer.
    if (assessment.priorTreatment === 'clinic_hospital') {
      moderate.push('Already sought clinical care and symptoms continue');
    }

    if (
      worker.avgWorkHours !== null &&
      worker.avgWorkHours !== undefined &&
      worker.avgWorkHours >= RiskService.LONG_WORKDAY_HOURS
    ) {
      moderate.push(`Works about ${worker.avgWorkHours} hours a day`);
    }

    if (high.length > 0) return { level: 'high', reasons: [...high, ...moderate] };
    if (moderate.length > 0) return { level: 'moderate', reasons: moderate };
    return { level: 'low', reasons: ['Mild symptoms with no major effect on work'] };
  }
}
