import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Weekly occupational-performance scores (spec §6) plus the worker column
 * that drives the five-question flow.
 */
export class AddFunctionScores1754400400000 implements MigrationInterface {
  name = 'AddFunctionScores1754400400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "function_scores" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "week" varchar(8) NOT NULL,
        "carrying" integer,
        "arrangingStall" integer,
        "standingSitting" integer,
        "householdTasks" integer,
        "ableToWork" integer,
        "completedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_function_scores" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_function_score_user_week" UNIQUE ("userId", "week")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_function_scores_user_week"
        ON "function_scores" ("userId", "week")
    `);
    await queryRunner.query(`
      ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "functionStep" varchar(24)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN IF EXISTS "functionStep"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "function_scores"`);
  }
}
