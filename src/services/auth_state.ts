import { initAuthCreds, proto, AuthenticationState, AuthenticationCreds, makeCacheableSignalKeyStore, jidToSignalProtocolAddress } from 'baileys'
import NodeCache from 'node-cache'
import { session } from './session'
import logger from './logger'
import { SESSION_KEY_TTL } from '../defaults'

export const authState = async (session: session, phone: string) => {
  const { readData, writeData, removeData, getKey, credsKey } = await session(phone)

  const creds: AuthenticationCreds = ((await readData(credsKey)) || initAuthCreds()) as AuthenticationCreds

  const signalKeyCache = new NodeCache({
    stdTTL: 5 * 60,
    useClones: false,
    deleteOnExpire: true,
  })

  const keys = {
    get: async (type: string, ids: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = {}
      await Promise.all(
        ids.map(async (id) => {
          const key = getKey(type, id)
          const value = await readData(key)
          if (type === 'app-state-sync-key' && value) {
            data[id] = proto.Message.AppStateSyncKeyData.create(value)
          } else {
            data[id] = value
          }
        }),
      )

      return data
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: async (data: any) => {
      const tasks: Promise<void>[] = []
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id]
          const key = getKey(category, id)
          if (category === 'pre-key') {
            // NEVER delete pre-keys immediately when Baileys marks them consumed!
            // If deleted immediately, delayed incoming messages or companion device syncs fail with "Invalid PreKey ID".
            // Retain pre-keys in Redis so retransmissions and companion devices can decrypt them cleanly.
            if (value) {
              tasks.push(writeData(key, value, -1))
            }
            continue
          }
          // Default TTL of 24h for contact sessions so stale ratchets do not persist indefinitely
          const ttl = category === 'session' ? (SESSION_KEY_TTL > 0 ? SESSION_KEY_TTL : 86400) : -1
          tasks.push(value ? writeData(key, value, ttl) : removeData(key || credsKey))
        }
      }
      await Promise.all(tasks)
    },
  }

  const evictSessionCache = (targetIdentifier?: string) => {
    try {
      if (!targetIdentifier || targetIdentifier === 'all') {
        const cachedKeys = signalKeyCache.keys()
        for (const k of cachedKeys) {
          if (k.startsWith('session.')) {
            signalKeyCache.del(k)
          }
        }
        return
      }

      let signalId = targetIdentifier
      if (targetIdentifier.includes('@')) {
        signalId = jidToSignalProtocolAddress(targetIdentifier).toString()
      } else if (!targetIdentifier.includes('.')) {
        signalId = `${targetIdentifier}.0`
      }
      signalKeyCache.del(`session.${signalId}`)
    } catch (err: any) {
      logger.debug('Error evicting session cache for %s: %s', targetIdentifier, err?.message)
    }
  }

  const state: AuthenticationState = {
    creds,
    keys: makeCacheableSignalKeyStore(keys, logger, signalKeyCache),
  }

  const saveCreds: () => Promise<void> = async () => {
    return await writeData(credsKey, creds, -1)
  }

  return {
    state,
    saveCreds,
    evictSessionCache,
  }
}
