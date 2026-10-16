import { Request, Response } from 'express'
import { activityLogger } from '../services/activity_logger'
import logger from '../services/logger'

export class LogsController {
  public async getLogs(req: Request, res: Response) {
    try {
      const phone = (req.query.phone || req.params.phone || '') as string
      const level = (req.query.level || '') as string
      const category = (req.query.category || '') as string
      const search = (req.query.search || req.query.q || '') as string
      const limit = parseInt((req.query.limit || '100') as string, 10)

      const result = await activityLogger.getLogs({
        phone: phone || undefined,
        level: level || undefined,
        category: category || undefined,
        search: search || undefined,
        limit: isNaN(limit) ? 100 : limit,
      })

      return res.status(200).json({
        success: true,
        total: result.total,
        data: result.logs,
      })
    } catch (err: any) {
      logger.error('Error in getLogs controller: %s', err.message)
      return res.status(500).json({ success: false, error: err.message })
    }
  }

  public async clearLogs(req: Request, res: Response) {
    try {
      const phone = (req.params.phone || req.query.phone || '') as string
      const success = await activityLogger.clearLogs(phone || undefined)
      return res.status(200).json({
        success,
        message: phone ? `Logs eliminados para el número ${phone}` : 'Todos los logs fueron eliminados exitosamente.',
      })
    } catch (err: any) {
      logger.error('Error in clearLogs controller: %s', err.message)
      return res.status(500).json({ success: false, error: err.message })
    }
  }
}

export const logsController = new LogsController()
