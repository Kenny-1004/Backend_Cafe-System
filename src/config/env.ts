const required = (key: string): string => {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

const bool = (key: string, fallback: boolean) => {
  const value = process.env[key]
  if (value === undefined || value === '') return fallback
  return value === 'true' || value === '1'
}

const NODE_ENV = process.env.NODE_ENV ?? 'development'

const JWT_SECRET = required('JWT_SECRET')
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters (generate one with: openssl rand -base64 48)')
}

const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET,
  // Secure cookies need HTTPS; on by default in production only
  COOKIE_SECURE: bool('COOKIE_SECURE', NODE_ENV === 'production'),
  // Run the 24-hour order expiry job in this process (leader-elected across instances)
  EXPIRY_JOB_ENABLED: bool('EXPIRY_JOB_ENABLED', NODE_ENV !== 'test'),
  // Max login attempts per minute per IP + username
  LOGIN_RATE_LIMIT: Number(process.env.LOGIN_RATE_LIMIT ?? 5),
  // Max kiosk orders per minute per client IP
  ORDER_RATE_LIMIT: Number(process.env.ORDER_RATE_LIMIT ?? 20),
}

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

export default env
