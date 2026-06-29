import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { config } from '../lib/config'
import { prisma } from '../lib/prisma'
import { workerHub } from '../websocket/worker-hub'

const startTime = Date.now()

export async function getSystemStatus() {
  let dbOk = false
  let dbError: string | undefined
  try {
    await prisma.$queryRaw`SELECT 1`
    dbOk = true
  } catch (err) {
    dbError = (err as Error).message
  }

  const worker = await workerHub.getStatus()
  let exportDirWritable = false
  try {
    await fs.access(config.exportDir, fs.constants.W_OK)
    exportDirWritable = true
  } catch { /* */ }

  const mem = process.memoryUsage()
  return {
    version: process.env.npm_package_version || '1.0.0',
    nodeEnv: config.nodeEnv,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    database: { ok: dbOk, error: dbError },
    worker: { online: worker.online, workerId: worker.workerId, workerName: worker.workerName },
    exportDir: { path: config.exportDir, writable: exportDirWritable },
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    },
    hostname: os.hostname(),
  }
}
