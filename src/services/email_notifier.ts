import nodemailer from 'nodemailer'
import logger from './logger'
import { getConfigRedis } from './config_redis'
import { getGlobalSmtpConfig, getSessionStatus } from './redis'

export class EmailNotifier {
  private lastAlertSent: Map<string, number> = new Map()
  private debounceMs = 5 * 60 * 1000 // 5 minutos entre alertas por número
  private gracePeriodMs = parseInt(process.env.DISCONNECT_GRACE_PERIOD_SECONDS || '10', 10) * 1000 // 10 segundos de espera para verificar intermitencia
  private pendingAlerts: Map<string, NodeJS.Timeout> = new Map()
  private pendingAlertReasons: Map<string, string> = new Map()

  public cancelPendingAlert(phone: string) {
    const timer = this.pendingAlerts.get(phone)
    if (timer) {
      clearTimeout(timer)
      this.pendingAlerts.delete(phone)
      this.pendingAlertReasons.delete(phone)
      logger.info('Cancelled pending disconnection alert for %s (session recovered and is online)', phone)
    }
  }

  public async getEffectiveConfig() {
    let globalConfig: any = null
    try {
      globalConfig = await getGlobalSmtpConfig()
    } catch {
      // Redis no disponible o error
    }

    const host = globalConfig?.host || process.env.SMTP_HOST || 'smtp.gmail.com'
    const port = parseInt(globalConfig?.port || process.env.SMTP_PORT || '587', 10)
    const user = globalConfig?.user || process.env.SMTP_USER || ''
    const pass = globalConfig?.pass || process.env.SMTP_PASS || ''
    const secure = globalConfig?.secure !== undefined ? Boolean(globalConfig.secure) : (process.env.SMTP_SECURE === 'true' || port === 465)
    const from = globalConfig?.from || process.env.SMTP_FROM || (user ? `Unoapi Alertas <${user}>` : 'Unoapi Alertas')
    const defaultAlertEmails = globalConfig?.defaultAlertEmails || process.env.ALERT_EMAILS || ''

    return { host, port, user, pass, secure, from, defaultAlertEmails }
  }

  private async getTransporter() {
    const config = await this.getEffectiveConfig()
    if (!config.host || !config.user || !config.pass) {
      return { transporter: null, config }
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })
    return { transporter, config }
  }

  public async notifyDisconnection(phone: string, reason = 'Sesión desconectada o cerrada de WhatsApp') {
    const lastSent = this.lastAlertSent.get(phone) || 0
    const now = Date.now()
    if (now - lastSent < this.debounceMs) {
      logger.debug('Skipping disconnection email for %s (debounced, sent %ds ago)', phone, Math.round((now - lastSent) / 1000))
      return false
    }

    if (this.pendingAlerts.has(phone)) {
      logger.debug('Disconnection alert already pending for %s, keeping timer and updating reason: %s', phone, reason)
      if (reason) this.pendingAlertReasons.set(phone, reason)
      return true
    }

    this.pendingAlertReasons.set(phone, reason)
    logger.info(
      'Session %s disconnected (%s). Waiting %ds before sending email to verify if connection recovers...',
      phone,
      reason,
      this.gracePeriodMs / 1000
    )

    const timer = setTimeout(async () => {
      this.pendingAlerts.delete(phone)
      const alertReason = this.pendingAlertReasons.get(phone) || reason
      this.pendingAlertReasons.delete(phone)

      await this.sendDisconnectionAlertIfStillOffline(phone, alertReason)
    }, this.gracePeriodMs)

    this.pendingAlerts.set(phone, timer)
    return true
  }

  private async sendDisconnectionAlertIfStillOffline(phone: string, reason: string) {
    try {
      const currentStatus = await getSessionStatus(phone)
      if (currentStatus === 'online') {
        logger.info('Aborting disconnection email for %s: session recovered and is online', phone)
        return false
      }

      const lastSent = this.lastAlertSent.get(phone) || 0
      const now = Date.now()
      if (now - lastSent < this.debounceMs) {
        logger.debug('Skipping disconnection email for %s (debounced, sent %ds ago)', phone, Math.round((now - lastSent) / 1000))
        return false
      }

      const config = await getConfigRedis(phone)
      const label = config?.label || phone
      const effectiveSmtp = await this.getEffectiveConfig()

      // Obtener lista de correos destinatarios
      const rawEmails = config?.alertEmails || effectiveSmtp.defaultAlertEmails || ''
      const emails = rawEmails
        .split(/[,; ]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0 && e.includes('@'))

      if (emails.length === 0) {
        logger.debug('No alert emails configured for phone %s (config.alertEmails or defaultAlertEmails empty)', phone)
        return false
      }

      const { transporter, config: smtpConfig } = await this.getTransporter()
      if (!transporter) {
        logger.warn('SMTP credentials not configured (host, user, pass). Cannot send alert for %s', phone)
        return false
      }

      const from = smtpConfig.from || `"Unoapi Cloud" <${smtpConfig.user}>`
      const unoapiUrl = process.env.PUBLIC_URL || process.env.BASE_URL || 'https://wapp-services.appoio.site'
      const formattedDate = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'full', timeStyle: 'medium' })

      const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 700;">⚠️ WhatsApp Desconectado</h2>
          <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">Alerta de desconexión en Unoapi Cloud</p>
        </div>
        <div style="padding: 28px 24px; color: #1e293b;">
          <p style="font-size: 16px; margin: 0 0 16px 0;">Hola,</p>
          <p style="font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
            Te notificamos que una de tus instancias de WhatsApp se ha <strong>desconectado</strong> y actualmente no está enviando ni recibiendo mensajes.
          </p>

          <div style="background: #f8fafc; border-left: 4px solid #dc2626; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 4px 0; color: #64748b; width: 140px;"><strong>Número:</strong></td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">+${phone}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;"><strong>Identificador:</strong></td>
                <td style="padding: 4px 0; color: #0f172a;">${label}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;"><strong>Motivo:</strong></td>
                <td style="padding: 4px 0; color: #dc2626;">${reason}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;"><strong>Fecha y Hora:</strong></td>
                <td style="padding: 4px 0; color: #0f172a;">${formattedDate}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${unoapiUrl}" target="_blank" style="background: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; font-size: 15px;">
              Reconectar en el Panel Web
            </a>
          </div>

          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
            Para restablecer la conexión, abre el enlace superior, busca el número y haz clic en <strong>Conectar</strong> para generar el código QR o código de emparejamiento.
          </p>
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0;">
          Unoapi Cloud • Sistema automatizado de monitoreo y alertas
        </div>
      </div>
      `

      const mailOptions = {
        from,
        to: emails.join(', '),
        subject: `⚠️ Alerta: WhatsApp Desconectado (+${phone} - ${label})`,
        text: `El número +${phone} (${label}) se ha desconectado de WhatsApp.\nMotivo: ${reason}\nFecha: ${formattedDate}\nPor favor ingresa al panel para reconectarlo: ${unoapiUrl}`,
        html,
      }

      const info = await transporter.sendMail(mailOptions)
      logger.info('Disconnection email alert sent for %s to %s (messageId: %s)', phone, emails.join(', '), info.messageId)
      this.lastAlertSent.set(phone, now)
      return true
    } catch (error) {
      logger.error(error, 'Error sending disconnection email alert for %s', phone)
      return false
    }
  }

  public async testEmail(toEmail: string) {
    const { transporter, config } = await this.getTransporter()
    if (!transporter) {
      throw new Error('Configuración SMTP incompleta (Servidor, Usuario y Contraseña de aplicación requeridos)')
    }

    const from = config.from || `"Unoapi Cloud" <${config.user}>`
    const mailOptions = {
      from,
      to: toEmail,
      subject: '✅ Prueba de Correo Exitosa - Unoapi Cloud',
      text: '¡Tu configuración de correo SMTP en Unoapi Cloud funciona correctamente!',
      html: `
      <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3 style="color: #16a34a; margin-top: 0;">✅ Configuración SMTP Exitosa</h3>
        <p>Este es un correo de prueba enviado desde tu servidor de <strong>Unoapi Cloud</strong>.</p>
        <p>A partir de ahora, cuando un número de WhatsApp se desconecte, recibirás una notificación inmediata a esta dirección.</p>
        <small style="color: #64748b;">Fecha: ${new Date().toISOString()}</small>
      </div>
      `,
    }

    const info = await transporter.sendMail(mailOptions)
    logger.info('Test email sent successfully to %s: %s', toEmail, info.messageId)
    return info
  }
}

export const emailNotifier = new EmailNotifier()
export default emailNotifier
