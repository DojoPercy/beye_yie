import { MigrationInterface, QueryRunner } from 'typeorm';

/** Persist Meta media IDs for the two fixed-language variants of every tip. */
export class AddTipAudioMediaIds1721771200000 implements MigrationInterface {
  name = 'AddTipAudioMediaIds1721771200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "audioEnMediaId" varchar(64)');
    await queryRunner.query('ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "audioTwMediaId" varchar(64)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "tips" DROP COLUMN IF EXISTS "audioTwMediaId"');
    await queryRunner.query('ALTER TABLE "tips" DROP COLUMN IF EXISTS "audioEnMediaId"');
  }
}
