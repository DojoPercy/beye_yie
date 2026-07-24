import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkActivityColumn1700000000000 implements MigrationInterface {
  name = 'AddWorkActivityColumn1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workers" 
      ADD COLUMN "workActivity" varchar(24)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workers" 
      DROP COLUMN "workActivity"
    `);
  }
}
