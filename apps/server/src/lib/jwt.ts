import jwt from 'jsonwebtoken'
import { config } from './config'

export interface AuthPayload {
  userId: number
  username: string
  name: string
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions)
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, config.jwtSecret) as AuthPayload
}
