const fs = require('fs')
const path = require('path')

function patchFile(filePath, patches) {
  if (!fs.existsSync(filePath)) {
    console.log('[patch-baileys] File not found:', filePath)
    return
  }

  let content = fs.readFileSync(filePath, 'utf8')
  let fileModified = false

  for (const { name, target, replacement } of patches) {
    if (content.includes(target)) {
      content = content.replace(target, replacement)
      fileModified = true
      console.log(`[patch-baileys] Applied: ${name}`)
    } else {
      console.log(`[patch-baileys] Already applied or pattern not matched: ${name}`)
    }
  }

  if (fileModified) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`[patch-baileys] Saved changes to ${filePath}`)
  }
}

const sendPatches = [
  // Revert primaryLid in initial send if previously applied
  {
    name: 'messages-send: revert manual primaryLid insertion in initial send',
    target: `                if (meLidUser) {
                    const primaryLid = (0, WABinary_1.jidEncode)(meLidUser, "lid", 0);
                    if (!meIds.includes(primaryLid)) {
                        meIds.push(primaryLid);
                    }
                    if (!allIds.includes(primaryLid)) {
                        allIds.push(primaryLid);
                    }
                }
                await assertSessions(allIds, false);`,
    replacement: `                await assertSessions(allIds, false);`
  },
  {
    name: 'messages-send: define meLidUser',
    target: 'const meUser = (_a = (0, WABinary_1.jidDecode)(meId)) === null || _a === void 0 ? void 0 : _a.user;\n                const encodedMeMsg =',
    replacement: 'const meUser = (_a = (0, WABinary_1.jidDecode)(meId)) === null || _a === void 0 ? void 0 : _a.user;\n                const meLidUser = (_b = (0, WABinary_1.jidDecode)((_a = authState.creds.me) === null || _a === void 0 ? void 0 : _a.lid)) === null || _b === void 0 ? void 0 : _b.user;\n                const encodedMeMsg ='
  },
  {
    name: 'messages-send: isMe accounts for LID',
    target: 'const isMe = user === meUser;\n                    const encodedLid =',
    replacement: 'const isMe = user === meUser || (Boolean(meLidUser) && user === meLidUser);\n                    const encodedLid ='
  },
  {
    name: 'messages-send: retry resend isMe accounts for LID',
    target: 'const isMe = (0, WABinary_1.areJidsSameUser)(participant.jid, meId);\n                const encodedMessageToSend = isMe',
    replacement: 'const isMe = (0, WABinary_1.areJidsSameUser)(participant.jid, meId) || (Boolean(authState.creds.me.lid) && (0, WABinary_1.areJidsSameUser)(participant.jid, authState.creds.me.lid));\n                const encodedMessageToSend = isMe'
  },
  {
    name: 'messages-send: retry stanza recipient accounts for LID',
    target: 'else if ((0, WABinary_1.areJidsSameUser)(participant.jid, meId)) {\n                    stanza.attrs.to = participant.jid;\n                    stanza.attrs.recipient = destinationJid;\n                }',
    replacement: 'else if ((0, WABinary_1.areJidsSameUser)(participant.jid, meId) || (Boolean(authState.creds.me.lid) && (0, WABinary_1.areJidsSameUser)(participant.jid, authState.creds.me.lid))) {\n                    stanza.attrs.to = participant.jid;\n                    stanza.attrs.recipient = destinationJid;\n                }'
  }
]

const recvPatches = [
  {
    name: 'messages-recv: do not sendToAll when retry is from own device (isMeParticipant)',
    target: 'const sendToAll = !((_a = (0, WABinary_1.jidDecode)(participant)) === null || _a === void 0 ? void 0 : _a.device);',
    replacement: `const isMeParticipant = (0, WABinary_1.areJidsSameUser)(participant, authState.creds.me.id) || (Boolean(authState.creds.me.lid) && (0, WABinary_1.areJidsSameUser)(participant, authState.creds.me.lid));
        const sendToAll = !isMeParticipant && !((_a = (0, WABinary_1.jidDecode)(participant)) === null || _a === void 0 ? void 0 : _a.device);`
  }
]

const basePaths = [
  path.resolve(__dirname, '../node_modules/baileys'),
  path.resolve(__dirname, '../node_modules/voice-calls-baileys/node_modules/baileys')
]

for (const basePath of basePaths) {
  const messagesSendFile = path.join(basePath, 'lib/Socket/messages-send.js')
  const messagesRecvFile = path.join(basePath, 'lib/Socket/messages-recv.js')
  patchFile(messagesSendFile, sendPatches)
  patchFile(messagesRecvFile, recvPatches)
}
