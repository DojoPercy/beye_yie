import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separate urgent escalations from routine referrals. Existing rows were all
 * produced by the safety gate, so they backfill as 'red_flag'.
 */
export class AddReferralKind1754400200000 implements MigrationInterface {
  name = 'AddReferralKind1754400200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "red_flag_referrals"
        ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'red_flag'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "red_flag_referrals" DROP COLUMN IF EXISTS "kind"
    `);
  }
}
