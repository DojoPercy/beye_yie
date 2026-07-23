import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';

dotenv.config();

/** Standalone DataSource for CLI tasks (migrations, seeds). */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/beye_yie',
  entities: ENTITIES,
  synchronize: false,
  migrations: ['src/database/migrations/*.ts'],
});

export default AppDataSource;
