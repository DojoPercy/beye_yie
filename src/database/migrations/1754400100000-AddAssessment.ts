import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial OT assessment (spec §2): the questionnaire table plus the two
 * worker columns that drive the state machine.
 */
export class AddAssessment1754400100000 implements MigrationInterface {
  name = 'AddAssessment1754400100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "assessments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "painPresent" boolean,
        "bodyPart" varchar(32),
        "nrs" integer,
        "durationBand" varchar(16),
        "aggravator" varchar(24),
        "functionImpact" varchar(16),
        "priorTreatment" varchar(24),
        "riskLevel" varchar(8),
        "riskReason" text,
        "completedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_assessments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_assessments_user_created"
        ON "assessments" ("userId", "createdAt")
    `);
    await queryRunner.query(`
      ALTER TABLE "workers"
        ADD COLUMN IF NOT EXISTS "assessmentStep" varchar(24),
        ADD COLUMN IF NOT EXISTS "assessmentCompletedAt" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workers"
        DROP COLUMN IF EXISTS "assessmentStep",
        DROP COLUMN IF EXISTS "assessmentCompletedAt"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "assessments"`);
  }
}
