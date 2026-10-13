const fs = require('fs')
const path = require('path')

const targetFile = path.resolve(__dirname, '../node_modules/baileys/lib/Socket/messages-send.js')

if (!fs.existsSync(targetFile)) {
  console.log('[patch-baileys] Target file not found:', targetFile)
  process.exit(0)
}

let content = fs.readFileSync(targetFile, 'utf8')
let modified = false

// Patch 1: Add meLidUser definition
const target1 = 'const meUser = (_a = (0, WABinary_1.jidDecode)(meId)) === null || _a === void 0 ? void 0 : _a.user;\n                const encodedMeMsg ='
const replace1 = 'const meUser = (_a = (0, WABinary_1.jidDecode)(meId)) === null || _a === void 0 ? void 0 : _a.user;\n                const meLidUser = (_b = (0, WABinary_1.jidDecode)((_a = authState.creds.me) === null || _a === void 0 ? void 0 : _a.lid)) === null || _b === void 0 ? void 0 : _b.user;\n                const encodedMeMsg ='

if (content.includes(target1)) {
  content = content.replace(target1, replace1)
  modified = true
  console.log('[patch-baileys] Patch 1 applied: defined meLidUser')
}

// Patch 2: Check isMe with both meUser and meLidUser
const target2 = 'const isMe = user === meUser;\n                    const encodedLid ='
const replace2 = 'const isMe = user === meUser || (Boolean(meLidUser) && user === meLidUser);\n                    const encodedLid ='

if (content.includes(target2)) {
  content = content.replace(target2, replace2)
  modified = true
  console.log('[patch-baileys] Patch 2 applied: isMe accounts for LID')
}

// Patch 3: Retry resend isMe check
const target3 = 'const isMe = (0, WABinary_1.areJidsSameUser)(participant.jid, meId);\n                const encodedMessageToSend = isMe'
const replace3 = 'const isMe = (0, WABinary_1.areJidsSameUser)(participant.jid, meId) || (Boolean(authState.creds.me.lid) && (0, WABinary_1.areJidsSameUser)(participant.jid, authState.creds.me.lid));\n                const encodedMessageToSend = isMe'

if (content.includes(target3)) {
  content = content.replace(target3, replace3)
  modified = true
  console.log('[patch-baileys] Patch 3 applied: retry resend isMe accounts for LID')
}

// Patch 4: Retry stanza recipient attribute check
const target4 = 'else if ((0, WABinary_1.areJidsSameUser)(participant.jid, meId)) {\n                    stanza.attrs.to = participant.jid;\n                    stanza.attrs.recipient = destinationJid;\n                }'
const replace4 = 'else if ((0, WABinary_1.areJidsSameUser)(participant.jid, meId) || (Boolean(authState.creds.me.lid) && (0, WABinary_1.areJidsSameUser)(participant.jid, authState.creds.me.lid))) {\n                    stanza.attrs.to = participant.jid;\n                    stanza.attrs.recipient = destinationJid;\n                }'

if (content.includes(target4)) {
  content = content.replace(target4, replace4)
  modified = true
  console.log('[patch-baileys] Patch 4 applied: retry stanza recipient accounts for LID')
}

if (modified) {
  fs.writeFileSync(targetFile, content, 'utf8')
  console.log('[patch-baileys] Successfully patched baileys messages-send.js')
} else {
  console.log('[patch-baileys] All patches already applied or patterns not matched.')
}
