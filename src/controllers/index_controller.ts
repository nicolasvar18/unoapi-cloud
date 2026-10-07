import { Request, Response } from 'express'
import logger from '../services/logger'
import path from 'path'
import { emailNotifier } from '../services/email_notifier'
import { setGlobalSmtpConfig } from '../services/redis'

class IndexController {
  public root(req: Request, res: Response) {
    logger.debug('root method %s', JSON.stringify(req.method))
    logger.debug('root headers %s', JSON.stringify(req.headers))
    logger.debug('root params %s', JSON.stringify(req.params))
    logger.debug('root body %s', JSON.stringify(req.body))
    res.set('Content-Type', 'text/html')
    //return res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'))
    return res.sendFile(path.resolve('./public/index.html'))
  }

  public socket(req: Request, res: Response) {
    logger.debug('socket method %s', JSON.stringify(req.method))
    logger.debug('socket headers %s', JSON.stringify(req.headers))
    logger.debug('socket params %s', JSON.stringify(req.params))
    logger.debug('socket body %s', JSON.stringify(req.body))
    res.set('Content-Type', 'text/javascript')
    return res.sendFile(path.resolve('./node_modules/socket.io-client/dist/socket.io.min.js'))
  }

  public ping(req: Request, res: Response) {
    logger.debug('ping method %s', JSON.stringify(req.method))
    logger.debug('ping headers %s', JSON.stringify(req.headers))
    logger.debug('ping params %s', JSON.stringify(req.params))
    logger.debug('ping body %s', JSON.stringify(req.body))
    res.set('Content-Type', 'text/plain')
    return res.status(200).send('pong!')
  }

  public debugToken(req: Request, res: Response) {
    logger.debug('debug token method %s', JSON.stringify(req.method))
    logger.debug('debug token headers %s', JSON.stringify(req.headers))
    logger.debug('debug token params %s', JSON.stringify(req.params))
    logger.debug('debug token query %s', JSON.stringify(req.query))
    logger.debug('debug token body %s', JSON.stringify(req.body))
    res.set('Content-Type', 'application/json')
    return res.status(200).send({
      data: {
        is_valid: true,
        app_id: 'unoapi',
        application: 'unoapi',
        expires_at: 0,
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
      },
    })
  }

  public login(req: Request, res: Response) {
    const { username, password } = req.body || {}
    const expectedUsername = process.env.DASHBOARD_USERNAME || 'admin'
    const expectedPassword = process.env.DASHBOARD_PASSWORD || 'admin'

    if (username === expectedUsername && password === expectedPassword) {
      const token = process.env.UNOAPI_AUTH_TOKEN || ''
      logger.info('Dashboard login successful for user: %s', username)
      return res.status(200).json({
        success: true,
        token: token,
      })
    }

    logger.warn('Failed login attempt for user: %s', username)
    return res.status(401).json({
      success: false,
      error: 'Usuario o contraseña incorrectos',
    })
  }

  public async testEmail(req: Request, res: Response) {
    const { email } = req.body || {}
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email requerido' })
    }
    try {
      await emailNotifier.testEmail(email)
      return res.status(200).json({ success: true, message: `Correo de prueba enviado exitosamente a ${email}` })
    } catch (err: any) {
      logger.error('Error in testEmail: %s', err.message)
      return res.status(400).json({
        success: false,
        error: err.message || 'Error enviando correo de prueba. Revisa la configuración SMTP y logs.',
      })
    }
  }

  public async getSmtpConfig(req: Request, res: Response) {
    try {
      const config = await emailNotifier.getEffectiveConfig()
      return res.status(200).json({
        success: true,
        data: {
          host: config.host || 'smtp.gmail.com',
          port: config.port || 587,
          user: config.user || '',
          pass: config.pass ? '••••••••' : '',
          hasPass: !!config.pass,
          from: config.from || '',
          secure: Boolean(config.secure),
          defaultAlertEmails: config.defaultAlertEmails || '',
        },
      })
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message })
    }
  }

  public async saveSmtpConfig(req: Request, res: Response) {
    const { host, port, user, pass, from, secure, defaultAlertEmails } = req.body || {}
    try {
      const current = await emailNotifier.getEffectiveConfig()

      const finalPass = (!pass || pass === '••••••••') ? current.pass : pass

      const newConfig = {
        host: (host || 'smtp.gmail.com').trim(),
        port: parseInt(port || '587', 10),
        user: (user || '').trim(),
        pass: finalPass ? finalPass.trim() : '',
        from: (from || '').trim(),
        secure: Boolean(secure),
        defaultAlertEmails: (defaultAlertEmails || '').trim(),
      }

      await setGlobalSmtpConfig(newConfig)
      logger.info('Global SMTP config updated successfully from dashboard')
      return res.status(200).json({
        success: true,
        message: 'Configuración de correo guardada exitosamente.',
      })
    } catch (err: any) {
      logger.error('Error saving SMTP config: %s', err.message)
      return res.status(500).json({ success: false, error: err.message })
    }
  }
}

export const indexController = new IndexController()
