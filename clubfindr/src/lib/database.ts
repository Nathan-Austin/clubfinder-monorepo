import pkg from 'pg';
const { Pool } = pkg;

//import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
	user: process.env.VITE_PG_USERNAME,
	password: process.env.VITE_PG_PASSWORD,
	database: process.env.VITE_PG_DB,
	host: process.env.VITE_PG_HOST,
	port: Number(process.env.VITE_PG_PORT)
});

export default pool;
