import dotenv from 'dotenv';
dotenv.config();
export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'replace_me',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'monopoly_db'
  },
  game: {
    startCash: Number(process.env.START_CASH || 1500),
    mortgageGraceTurns: Number(process.env.MORTGAGE_GRACE_TURNS || 40),
    mortgageStepPercent: Number(process.env.MORTGAGE_STEP_PERCENT || 5)
  }
};
