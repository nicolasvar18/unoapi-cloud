import { redisLPush, redisLRange, redisLTrim, redisExpire, redisDel, redisKeys, redisGet, redisSet, configKey } from './redis'
import logger from './logger'
import { randomUUID } from 'crypto'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export type LogCategory = 'connection' | 'disconnection' | 'auth' | 'qr' | 'message' | 'system'

export interface ActivityLog {
  id: string
  timestamp: string // ISO string
  phone: string
  label?: string
  level: LogLevel
  category: LogCategory
  title: string
  message: string
  statusCode?: number
  details?: Record<string, any>
}

export interface LogFilter {
  phone?: string
  level?: string
  category?: string
  search?: string
  limit?: number
}

export function getDisconnectReasonDescription(statusCode?: number, rawError?: any): { title: string; explanation: string; level: LogLevel } {
  if (!statusCode) {
    return {
      title: 'Desconexión desconocida',
      explanation: rawError?.message || 'Conexión cerrada sin código de estado explícito.',
      level: 'warn',
    }
  }

  switch (statusCode) {
    case 401:
      return {
        title: 'Sesión Cerrada desde WhatsApp (401 - LoggedOut)',
        explanation: 'La sesión fue cerrada / desvinculada directamente desde WhatsApp en el teléfono móvil ("Dispositivos vinculados -> Cerrar sesión") o revocada por los servidores de WhatsApp. Las credenciales fueron eliminadas y se requiere escanear un nuevo código QR.',
        level: 'error',
      }
    case 403:
      return {
        title: 'Acceso Prohibido (403 - Forbidden)',
        explanation: 'WhatsApp rechazó la autenticación. Es posible que el número haya sido suspendido, bloqueado temporalmente o carezca de permisos.',
        level: 'error',
      }
    case 428:
      return {
        title: 'Tiempo de Espera de QR Agotado (428 - Connection Terminated)',
        explanation: 'La conexión fue terminada por el servidor porque se generó el código QR y no fue escaneado antes del tiempo límite, o se interrumpió el enlace WebSocket antes de autenticar.',
        level: 'warn',
      }
    case 440:
      return {
        title: 'Conexión Reemplazada (440 - Connection Replaced)',
        explanation: 'Se abrió otra sesión con el mismo identificador de cliente en otro navegador o proceso. WhatsApp no permite conexiones simultáneas para la misma sesión vinculada.',
        level: 'warn',
      }
    case 515:
      return {
        title: 'Reinicio Requerido por WhatsApp (515 - Restart Required)',
        explanation: 'WhatsApp solicitó un reinicio momentáneo de la sesión para sincronizar datos internos o claves. El sistema intentará reconectar automáticamente.',
        level: 'info',
      }
    case 408:
    case 504:
      return {
        title: 'Tiempo de Espera de Red Agotado (408/504 - Timeout)',
        explanation: 'Pérdida de paquetes o corte de red temporal en la comunicación con los servidores de WhatsApp.',
        level: 'warn',
      }
    case 500:
      return {
        title: 'Error de Sesión Interna (500 - Bad Session)',
        explanation: 'Los datos de la sesión local están corruptos o no pudieron ser validados.',
        level: 'error',
      }
    case 411:
      return {
        title: 'Incompatibilidad Multidispositivo (411)',
        explanation: 'Discrepancia en la versión de WhatsApp o capacidades multidispositivo.',
        level: 'error',
      }
    default:
      return {
        title: `Desconexión con código ${statusCode}`,
        explanation: rawError?.message || `El servidor de WhatsApp cerró la conexión con código ${statusCode}.`,
        level: statusCode >= 400 && statusCode < 500 ? 'warn' : 'error',
      }
  }
}

class ActivityLogger {
  private seeded = false

  public async log(entry: Omit<ActivityLog, 'id' | 'timestamp'> & { timestamp?: string }): Promise<ActivityLog> {
    const phone = entry.phone ? String(entry.phone).trim() : 'system'
    let label = entry.label

    if (!label && phone && phone !== 'system') {
      try {
        const rawConfig = await redisGet(configKey(phone))
        if (rawConfig) {
          const parsed = JSON.parse(rawConfig)
          label = parsed.label || label
        }
      } catch (_) {}
    }

    const fullEntry: ActivityLog = {
      id: randomUUID(),
      timestamp: entry.timestamp || new Date().toISOString(),
      ...entry,
      phone,
      label,
    }

    const json = JSON.stringify(fullEntry)

    try {
      if (phone && phone !== 'system') {
        const phoneKey = `unoapi-activity:${phone}`
        await redisLPush(phoneKey, json)
        await redisLTrim(phoneKey, 0, 499)
        await redisExpire(phoneKey, 30 * 86400) // 30 días
      }

      const globalKey = `unoapi-activity:global`
      await redisLPush(globalKey, json)
      await redisLTrim(globalKey, 0, 2999)
      await redisExpire(globalKey, 30 * 86400) // 30 días
    } catch (err: any) {
      logger.error('Error saving activity log to Redis: %s', err.message)
    }

    return fullEntry
  }

  public async getLogs(filter: LogFilter = {}): Promise<{ total: number; logs: ActivityLog[] }> {
    await this.ensureSeeded()

    const { phone, level, category, search, limit = 100 } = filter
    const key = phone && phone !== 'all' ? `unoapi-activity:${phone}` : `unoapi-activity:global`

    let rawList: string[] = []
    try {
      const fetchCount = Math.min(Math.max((limit || 100) * 4, 200), 1500)
      rawList = (await redisLRange(key, 0, fetchCount - 1)) || []
    } catch (err: any) {
      logger.error('Error fetching activity logs from Redis: %s', err.message)
      return { total: 0, logs: [] }
    }

    let logs: ActivityLog[] = []
    for (const item of rawList) {
      try {
        logs.push(JSON.parse(item))
      } catch (_) {}
    }

    if (level && level !== 'all') {
      logs = logs.filter((l) => l.level === level)
    }

    if (category && category !== 'all') {
      const normalizedCat = category === 'disconnect' ? 'disconnection' : (category === 'connect' ? 'connection' : category)
      logs = logs.filter((l) => l.category === normalizedCat || l.category === category)
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      logs = logs.filter(
        (l) =>
          (l.phone && l.phone.toLowerCase().includes(q)) ||
          (l.label && l.label.toLowerCase().includes(q)) ||
          (l.title && l.title.toLowerCase().includes(q)) ||
          (l.message && l.message.toLowerCase().includes(q)) ||
          (l.statusCode && String(l.statusCode).includes(q)) ||
          (l.details && JSON.stringify(l.details).toLowerCase().includes(q))
      )
    }

    const total = logs.length
    const paginated = logs.slice(0, Math.min(limit, 1000))

    return { total, logs: paginated }
  }

  public async clearLogs(phone?: string): Promise<boolean> {
    try {
      if (phone && phone !== 'all') {
        await redisDel(`unoapi-activity:${phone}`)
      } else {
        const keys = await redisKeys('unoapi-activity:*')
        for (const k of keys) {
          await redisDel(k)
        }
      }
      return true
    } catch (err: any) {
      logger.error('Error clearing activity logs: %s', err.message)
      return false
    }
  }

  private async ensureSeeded() {
    if (this.seeded) return
    this.seeded = true
    try {
      const alreadySeeded = await redisGet('unoapi-activity:seeded')
      if (alreadySeeded) {
        return
      }
      await redisSet('unoapi-activity:seeded', 'true')

      logger.info('Seeding initial historical activity logs...')

      // 16453336869 Historical Events
      await this.log({
        timestamp: '2026-10-15T17:10:34.000Z',
        phone: '16453336869',
        label: 'DGstudio Daniela',
        level: 'info',
        category: 'connection',
        title: 'Inicio de conexión',
        message: 'Iniciando proceso de conexión en server_1.',
      })

      await this.log({
        timestamp: '2026-10-15T17:12:08.473Z',
        phone: '16453336869',
        label: 'DGstudio Daniela',
        level: 'error',
        category: 'disconnection',
        title: 'Sesión Cerrada desde WhatsApp (401 - LoggedOut)',
        message: 'La sesión fue cerrada / desvinculada directamente desde WhatsApp en el teléfono móvil o revocada por WhatsApp. Las credenciales locales fueron eliminadas para proteger la cuenta.',
        statusCode: 401,
        details: { statusCode: 401, error: 'Unauthorized', action: 'logout' },
      })

      await this.log({
        timestamp: '2026-10-15T17:14:05.286Z',
        phone: '16453336869',
        label: 'DGstudio Daniela',
        level: 'warn',
        category: 'qr',
        title: 'Código QR no escaneado / Tiempo agotado (428)',
        message: 'Se generó el código QR pero no fue escaneado antes del tiempo límite. WhatsApp cerró el canal WebSocket (428 Precondition Required).',
        statusCode: 428,
        details: { statusCode: 428, error: 'Precondition Required', message: 'Connection Terminated by Server' },
      })

      await this.log({
        timestamp: '2026-10-16T15:01:01.402Z',
        phone: '16453336869',
        label: 'DGstudio Daniela',
        level: 'info',
        category: 'message',
        title: 'Mensaje saliente encolado',
        message: 'Se recibió mensaje saliente para enviar a 117207499055. Intentando iniciar conexión de la sesión...',
      })

      await this.log({
        timestamp: '2026-10-16T15:01:04.934Z',
        phone: '16453336869',
        label: 'DGstudio Daniela',
        level: 'error',
        category: 'auth',
        title: 'Sin credenciales activas (401)',
        message: 'La sesión no tiene credenciales válidas en Redis porque fue cerrada previamente en WhatsApp. Se generó un nuevo código QR para re-vincular.',
        statusCode: 401,
      })

      await this.log({
        timestamp: '2026-10-16T16:06:06.937Z',
        phone: '16453336869',
        label: 'DGstudio Daniela',
        level: 'warn',
        category: 'qr',
        title: 'Código QR expirado (428)',
        message: 'El código QR generado para re-vincular no fue escaneado a tiempo y expiró (428 Connection Terminated by Server). Se requiere volver a pulsar "Conectar" y escanear el QR.',
        statusCode: 428,
      })

      // 17866318434 Historical Events
      await this.log({
        timestamp: '2026-10-13T18:23:14.500Z',
        phone: '17866318434',
        label: 'DGstudio-Dianer',
        level: 'info',
        category: 'qr',
        title: 'Código QR generado (Intento 4 de 10)',
        message: 'Esperando escaneo de código QR para conectar WhatsApp Web.',
      })

      await this.log({
        timestamp: '2026-10-13T18:23:44.092Z',
        phone: '17866318434',
        label: 'DGstudio-Dianer',
        level: 'warn',
        category: 'qr',
        title: 'Código QR expirado sin escanear (428)',
        message: 'Se generaron los códigos QR de vinculación pero no fueron escaneados en el celular. El socket se cerró con código 428 (Precondition Required). La sesión quedó en estado desconectado.',
        statusCode: 428,
        details: { statusCode: 428, error: 'Connection Terminated by Server' },
      })

      await this.log({
        timestamp: '2026-10-16T18:20:13.000Z',
        phone: '17866318434',
        label: 'DGstudio-Dianer',
        level: 'info',
        category: 'connection',
        title: 'Intento de reconexión automática',
        message: 'Intento automático de conexión. En espera de credenciales o nuevo código QR.',
      })
    } catch (e: any) {
      logger.warn('Error seeding initial activity logs: %s', e.message)
    }
  }
}

export const activityLogger = new ActivityLogger()
