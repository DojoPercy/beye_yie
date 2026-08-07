import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registration profile (spec §1): age, goods sold, market location and average
 * working hours. All nullable — existing workers keep working and are asked
 * for the missing fields only if they re-enter onboarding.
 */
export class AddRegistrationProfile1754400000000 implements MigrationInterface {
  name = 'AddRegistrationProfile1754400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workers"
        ADD COLUMN IF NOT EXISTS "age" integer,
        ADD COLUMN IF NOT EXISTS "goodsSold" varchar(24),
        ADD COLUMN IF NOT EXISTS "marketLocation" varchar(80),
        ADD COLUMN IF NOT EXISTS "avgWorkHours" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workers"
        DROP COLUMN IF EXISTS "age",
        DROP COLUMN IF EXISTS "goodsSold",
        DROP COLUMN IF EXISTS "marketLocation",
        DROP COLUMN IF EXISTS "avgWorkHours"
    `);
  }
}
