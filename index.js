const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys')

const P = require('pino')
const fs = require('fs')
const path = require('path')
const express = require('express')
const config = require('./config')

// --- ENV VARIABLES (DOIT ETRE AVANT EXPRESS) ---
const BOT_NAME = process.env.BOT_NAME || config.botName || 'LEROI-MD-APOTHEON'
const OWNER_NAME = process.env.OWNER_NAME || config.ownerName || 'LΞRØI'
const OWNER_NUMBER = String(process.env.OWNER_NUMBER || config.owner?.[0] || '22891847613').replace(/[^0-9]/g, '')
const PAIRING_NUMBER = String(process.env.PAIRING_NUMBER || process.env.OWNER_NUMBER || OWNER_NUMBER).replace(/[^0-9]/g, '')
const PAIRING_ENABLED = (process.env.PAIRING || 'true').toLowerCase() === 'true'
const BOT_IMAGE = process.env.BOT_IMAGE || config.botImage || config.domination.pp
let prefix = process.env.PREFIX || config.prefix || '.'
const PORT = process.env.PORT || 3000

// --- SERVEUR EXPRESS POUR RENDER ---
const app = express()
let lastPairingCode = null
let lastPairingTime = null

app.get('/', (req, res) => res.send(`👑 ${BOT_NAME} x APOTHEON IS ONLINE 🪐 - Owner: ${OWNER_NAME} - Port: ${PORT}`))
app.get('/health', (req, res) => res.json({status: 'online', bot: BOT_NAME, owner: OWNER_NAME, port: PORT}))
app.get('/pair', (req, res) => {
  if (lastPairingCode) {
    res.send(`<h1>👑 ${BOT_NAME} CODE: ${lastPairingCode}</h1><p>${lastPairingTime}</p>`)
  } else {
    res.send('Aucun code pairing')
  }
})
const server = app.listen(PORT, () => console.log(`🌐 HTTP sur port ${PORT} - BOT: ${BOT_NAME}`))
server.on('error', (e) => console.log('Express error:', e.message))

const DATA_DIR = './database'
const SESSION_DIR = './session'
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

let sudo = []
let selfMode = true
let antilink = {}
let welcome = {}
let antimention = {}
let warns = {}

const files = {
  sudo: path.join(DATA_DIR, 'sudo.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  prefix: path.join(DATA_DIR, 'prefix.json'),
  self: path.join(DATA_DIR, 'self.json'),
  warns: path.join(DATA_DIR, 'warns.json')
}

function loadJSON(f, fb) { try { if (!fs.existsSync(f)) { fs.writeFileSync(f, JSON.stringify(fb, null, 2), 'utf8'); return fb } return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { return fb } }
function saveJSON(f, d) { try { fs.writeFileSync(f, JSON.stringify(d, null, 2), 'utf8') } catch { } }

sudo = loadJSON(files.sudo, [])
const s = loadJSON(files.settings, { antilink: {}, welcome: {}, antimention: {} })
antilink = s.antilink || {}; welcome = s.welcome || {}; antimention = s.antimention || {}
const sp = loadJSON(files.prefix, { prefix: '.' }); prefix = sp.prefix || '.'
const ss = loadJSON(files.self, { selfMode: true }); selfMode = ss.selfMode !== false
warns = loadJSON(files.warns, {})

function cleanNumber(n) { return String(n || '').replace(/[^0-9]/g, '') }
function jidNumber(j) { return cleanNumber(String(j || '').split('@')[0].split(':')[0]) }
function isOwnerNumber(n) { return jidNumber(n) === OWNER_NUMBER }
function isSudo(j) { const num = jidNumber(j); if (!num) return false; return sudo.some(s => jidNumber(s) === num) }
function isOwnerOrSudo(j) { return isOwnerNumber(j) || isSudo(j) }
function saveSettings() { saveJSON(files.settings, { antilink, welcome, antimention }) }
function saveSudo() { saveJSON(files.sudo, sudo) }
function saveSelf() { saveJSON(files.self, { selfMode }) }
function saveWarns() { saveJSON(files.warns, warns) }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function dlMedia(msg) {
  try {
    let type = Object.keys(msg)[0]
    let m = msg[type]
    if (type === 'viewOnceMessageV2' || type === 'viewOnceMessage') { m = m.message; type = Object.keys(m)[0]; m = m[type] }
    const stream = await downloadContentFromMessage(m, type.replace('Message', ''))
    let buf = Buffer.from([])
    for await (const c of stream) { buf = Buffer.concat([buf, c]) }
    return { buffer: buf, type }
  } catch (e) { return null }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()
  const conn = makeWASocket({
    version, auth: state, logger: P({ level: 'silent' }),
    browser: ['LEROI-MD', 'Chrome', '2.0'],
    markOnlineOnConnect: false, syncFullHistory: false
  })

  if (!state.creds.registered) {
    if (!PAIRING_ENABLED) {
      console.log('⚠️ PAIRING désactivé - mets PAIRING=true dans les ENV')
      return
    }
    console.log(`👑 ${BOT_NAME} - Pairing pour ` + PAIRING_NUMBER + ` (Owner: ${OWNER_NAME})`)
    setTimeout(async () => {
      try {
        const code = await conn.requestPairingCode(PAIRING_NUMBER)
        console.log('╔════════════════════════════╗')
        console.log('║ BOT: ' + BOT_NAME)
        console.log('║ OWNER: ' + OWNER_NAME)
        console.log('║ CODE: ' + code)
        console.log('╚════════════════════════════╝')
      } catch (e) { console.log('Pairing error:', e.message) }
    }, 3000)
  }

  conn.ev.on('creds.update', saveCreds)
  conn.ev.on('connection.update', async u => {
    const { connection, lastDisconnect } = u
    if (connection === 'open') {
      console.log(`🪐 ${BOT_NAME} x APOTHEON ONLINE - Owner: ${OWNER_NAME}`)
      try { await conn.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', { text: `👑 ${BOT_NAME} ONLINE\n🪐 APOTHEON SOVEREIGN\nOwner: ${OWNER_NAME}` }) } catch { }
    }
    if (connection === 'close') {
      const sc = lastDisconnect?.error?.output?.statusCode
      if (sc !== DisconnectReason.loggedOut) setTimeout(() => start(), 5000)
    }
  })

  conn.ev.on('group-participants.update', async anu => {
    try {
      if (!welcome[anu.id]) return
      if (anu.action !== 'add') return
      for (const p of anu.participants) {
        await conn.sendMessage(anu.id, { text: `🪐 Bienvenue @${jidNumber(p)} dans APOTHEON 🧭`, mentions: [p] })
      }
    } catch { }
  })

  conn.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const m = messages[0]; if (!m || !m.message || m.key.fromMe) return
      const from = m.key.remoteJid; if (!from) return
      const isGroup = from.endsWith('@g.us')
      const body = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || m.message.viewOnceMessageV2?.message?.imageMessage?.caption || ''
      const sender = m.key.participant || from
      const sNum = jidNumber(sender)
      const isOwnerSudo = isOwnerOrSudo(sender)

      if (isGroup && antimention[from]) {
        const ctx = m.message.extendedTextMessage?.contextInfo || {}
        const mentions = ctx.mentionedJid || []
        const groupMentions = ctx.groupMentions || []
        const hasGroupTag = body.includes('@') && (body.toLowerCase().includes('groupe') || groupMentions.length > 0)
        if (mentions.length >= 4 || groupMentions.length > 0 || hasGroupTag) {
          const meta = await conn.groupMetadata(from)
          const part = meta.participants.find(p => jidNumber(p.id) === sNum)
          if (!part?.admin && !isOwnerSudo) {
            try {
              await conn.sendMessage(from, { delete: m.key })
              await conn.sendMessage(from, { text: `🛡️ AntiMention supprimée @${sNum}`, mentions: [sender] })
            } catch { }; return
          }
        }
      }

      if (isGroup && antilink[from] && (body.includes('https://') || body.includes('http://') || body.includes('chat.whatsapp.com'))) {
        const meta = await conn.groupMetadata(from)
        const part = meta.participants.find(p => jidNumber(p.id) === sNum)
        if (!part?.admin && !isOwnerSudo) {
          try { await conn.sendMessage(from, { delete: m.key }) } catch { }
          if (!warns[from]) warns[from] = {}
          if (!warns[from][sender]) warns[from][sender] = 0
          warns[from][sender] += 1
          saveWarns()
          const count = warns[from][sender]
          if (count >= 3) {
            await conn.sendMessage(from, { text: `🚨 @${sNum} a atteint 3/3 avertissements (liens interdits). Expulsion...`, mentions: [sender] })
            delete warns[from][sender]; saveWarns()
            try { await conn.groupParticipantsUpdate(from, [sender], 'remove') } catch { }
          } else {
            await conn.sendMessage(from, { text: `⚠️ AVERTISSEMENT ANTI-LINK @${sNum}\n🚫 Liens interdits !\n📌 ${count}/3 - Au 3ème tu seras exclu.`, mentions: [sender] })
          }
          return
        }
      }

      if (!body.startsWith(prefix)) return
      const args = body.slice(prefix.length).trim().split(/\s+/)
      const command = args.shift()?.toLowerCase()
      const q = args.join(' ')
      if (!command) return
      if (selfMode && !isOwnerSudo) return

      const getMeta = async () => await conn.groupMetadata(from)
      const isBotAdmin = async () => { if (!isGroup) return false; const meta = await getMeta(); const bot = jidNumber(conn.user?.id); return !!meta.participants.find(p => jidNumber(p.id) === bot)?.admin }
      const isAdmin = async () => { if (!isGroup) return false; const meta = await getMeta(); return !!meta.participants.find(p => jidNumber(p.id) === sNum)?.admin }
      const reply = t => conn.sendMessage(from, { text: t }, { quoted: m })

      // REACTION 🪐 quand une commande est tapée
      try {
        await conn.sendMessage(from, { react: { text: '🪐', key: m.key } })
      } catch {}



      switch (command) {
        case 'menu': case 'help': {
          await reply(`👑 𝐋Ξ𝐑Ø𝐈-MD x APOTHEON\n\n.self/.public | .tag .online .gstatus .left .kick\n.antilink .antimention | .extinction .domination\n.sticker .stimg .vv .quiz .ping`)
          break
        }
        case 'ping': { await reply(`👑 Pong ${Date.now()%1000}ms 🪐`); break }
        case 'self': { if (!isOwnerSudo) return; selfMode = true; saveSelf(); await reply('🔒 Privé'); break }
        case 'delself': case 'public': { if (!isOwnerSudo) return; selfMode = false; saveSelf(); await reply('🔓 Public'); break }
        case 'tag': case 'tagall': { if (!isGroup || !await isAdmin()) return; const meta = await getMeta(); await conn.sendMessage(from, { text: q || '👑 TAG', mentions: meta.participants.map(p => p.id) }, { quoted: m }); break }
        case 'online': { if (!isGroup) return; const meta = await getMeta(); const mentions = meta.participants.map(p => p.id); let txt = `🟢 En ligne (${mentions.length})\n`; meta.participants.forEach(p => { txt += `@${jidNumber(p.id)}${p.admin?'👑':''}\n` }); await conn.sendMessage(from, { text: txt, mentions }, { quoted: m }); break }
        case 'gstatus': {
          if (!isGroup || !await isAdmin()) return
          const qmsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage
          let statusText = q
          if (qmsg) { const t = qmsg.conversation || qmsg.extendedTextMessage?.text || qmsg.imageMessage?.caption || ''; if (t) statusText = t }
          if (!statusText) return reply('❌ Tag un message ou .gstatus TEXTE')
          await conn.groupUpdateDescription(from, `🪐 ${statusText}\n\n👑 LEROI-MD x APOTHEON`)
          await reply(`✅ Statut: ${statusText}`)
          break
        }
        case 'left': { if (!isGroup) return; await conn.sendMessage(from, { text: `👑 @${sNum} quitte...`, mentions: [sender] }); await sleep(1000); await conn.groupParticipantsUpdate(from, [sender], 'remove'); break }
        case 'kick': { if (!isGroup || !await isBotAdmin() || !await isAdmin()) return; const u = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if (!u) return; await conn.groupParticipantsUpdate(from, [u], 'remove'); break }
        case 'promote': case 'demote': { if (!isGroup || !await isBotAdmin() || !await isAdmin()) return; const u = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if (!u) return; await conn.groupParticipantsUpdate(from, [u], command); break }
        case 'quiz': { const qs = [{ q: 'Capitale Togo?', o: ['A)Lomé','B)Cotonou'], a: 'A' }]; const p = qs[0]; await reply(`${p.q}\n${p.o.join('\n')}`); break }
        case 'antilink': case 'welcome': case 'antimention': { if (!isGroup || !await isAdmin()) return; if (!q || q === 'on') { if (command === 'antilink') antilink[from] = true; if (command === 'welcome') welcome[from] = true; if (command === 'antimention') antimention[from] = true; saveSettings(); await reply(`${command} ON`) } else { if (command === 'antilink') delete antilink[from]; if (command === 'welcome') delete welcome[from]; if (command === 'antimention') delete antimention[from]; saveSettings(); await reply(`${command} OFF`) } break }
        case 'extinction': case 'annihilation': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return reply('Admin requis')
          const meta = await getMeta()
          const nonAdmins = meta.participants.filter(p => !p.admin).map(p => p.id)
          // 1. CIBLAGE
          if (nonAdmins.length > 0) { await conn.sendMessage(from, { text: `🎯 ${nonAdmins.length} âmes ciblées pour l'extinction...`, mentions: nonAdmins }); await sleep(1500) }
          // 2. APOTHEON / TERRASSEMENT
          await conn.sendMessage(from, { text: `🪐𒈞⃞ ⚜️𓂀⃟ 𝑨𝑷𝑶𝑻𝑯𝑬𝑶𝑵 𝑺𝑶𝑽𝑬𝑹𝑬𝑰𝑮𝑵 ⃟𓂀⚜️ ⃞𒈞🪐\n༺🧭༻ \n\nTerrassement` }, { quoted: m })
          await sleep(2000)
          // 3. KICK REEL
          if (nonAdmins.length > 0) {
            try { await conn.groupParticipantsUpdate(from, nonAdmins, 'remove') } catch(e){ await reply(`❌ Erreur kick: ${e.message}`); return }
          }
          await conn.sendMessage(from, { text: `🪐 APOTHEON EXTINCTION TERMINEE 🧭\n${nonAdmins.length} âmes terrassées - 𝐋Ξ𝐑Ø𝐈-MD 👑` })
          break
        }
        case 'domination': case 'dom': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return
          const meta = await getMeta()
          if (meta.subject.includes('𝐏𝐔𝐑𝐈𝐅𝐈𝐂𝐀𝐓𝐈𝐎𝐍')) return reply('Déjà purifié')
          let newName = meta.subject + config.dominationSuffix
          if (newName.length > 100) newName = meta.subject.slice(0, 25) + config.dominationSuffix
          await conn.groupUpdateSubject(from, newName)
          await conn.groupUpdateDescription(from, config.domination.desc)
          try { let r = await fetch(config.domination.pp); let b = Buffer.from(await r.arrayBuffer()); await conn.updateProfilePicture(from, b) } catch { }
          await reply(`🪐 DOMINATION ACTIVE`)
          break
        }
        case 'sticker': case 's': {
          const qmsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage
          let media = null
          if (qmsg) media = await dlMedia(qmsg)
          else if (m.message.imageMessage || m.message.videoMessage) media = await dlMedia(m.message)
          if (!media) return reply('Réponds à image/vidéo')
          await conn.sendMessage(from, { sticker: media.buffer }, { quoted: m })
          break
        }
        case 'stimg': {
          const qmsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage
          if (!qmsg?.stickerMessage) return reply('Réponds à sticker')
          const media = await dlMedia(qmsg)
          await conn.sendMessage(from, { image: media.buffer }, { quoted: m })
          break
        }
        case 'vv': case 'viewonce': {
          const qmsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage
          if (!qmsg) return reply('Réponds à vue unique')
          const vo = qmsg.viewOnceMessageV2 || qmsg.viewOnceMessage
          if (!vo) return reply('Pas vue unique')
          const media = await dlMedia(qmsg)
          if (!media) return reply('Erreur')
          const t = Object.keys(vo.message)[0]
          if (t === 'imageMessage') await conn.sendMessage(from, { image: media.buffer }, { quoted: m })
          else await conn.sendMessage(from, { video: media.buffer }, { quoted: m })
          break
        }
      }
    } catch (e) { console.log('Err', e.message) }
  })
}
start()
          
