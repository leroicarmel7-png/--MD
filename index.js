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
const fetch = require('node-fetch')
const express = require('express')
const { Sticker, StickerTypes } = require('wa-sticker-formatter')
const config = require('./config')

// --- SERVEUR EXPRESS POUR RENDER ---
const app = express()
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => res.send('👑 LEROI-MD x APOTHEON IS ONLINE 🪐'))
app.listen(PORT, () => console.log(`🌐 HTTP sur port ${PORT}`))

const DATA_DIR = './database'
const SESSION_DIR = './session'
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const OWNER_NUMBER = String(config.owner?.[0] || '22891847613').replace(/[^0-9]/g, '')
let prefix = config.prefix || '.'
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
    console.log('👑 LEROI-MD - Pairing pour ' + OWNER_NUMBER)
    setTimeout(async () => {
      try {
        const code = await conn.requestPairingCode(OWNER_NUMBER)
        console.log('╔════════════════════╗\n CODE: ' + code + '\n╚════════════════════╝')
      } catch (e) { console.log(e.message) }
    }, 3000)
  }

  conn.ev.on('creds.update', saveCreds)
  conn.ev.on('connection.update', async u => {
    const { connection, lastDisconnect } = u
    if (connection === 'open') {
      console.log('🪐 LEROI-MD x APOTHEON ONLINE')
      try { await conn.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', { text: '👑 𝐋Ξ𝐑Ø𝐈-MD ONLINE\n🪐 APOTHEON SOVEREIGN' }) } catch { }
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

      // ANTIMENTION
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

      // ANTILINK
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
          await conn.sendMessage(from, { text: `⚠️ AVERTISSEMENT ANTI-LINK @${sNum}\n🚫 Liens interdits !\n📌 ${count}/3 avertissements enregistrés.`, mentions: [sender] })
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

      // REACTION
      try {
        await conn.sendMessage(from, { react: { text: '🪐', key: m.key } })
      } catch {}

      switch (command) {
        case 'menu': case 'help': {
          await reply(`👑 𝐋Ξ𝐑Ø𝐈-MD x APOTHEON\n\n.self/.public | .tag .online .gstatus .left\n.antilink .antimention | .extinction .domination\n.sticker .toimg .vv .quiz .ping`)
          break
        }
        case 'ping': { await reply(`👑 Pong ${Date.now() % 1000}ms 🪐`); break }
        case 'self': { if (!isOwnerSudo) return; selfMode = true; saveSelf(); await reply('🔒 Privé'); break }
        case 'delself': case 'public': { if (!isOwnerSudo) return; selfMode = false; saveSelf(); await reply('🔓 Public'); break }
        case 'tag': case 'tagall': { if (!isGroup || !await isAdmin()) return; const meta = await getMeta(); await conn.sendMessage(from, { text: q || '👑 TAG', mentions: meta.participants.map(p => p.id) }, { quoted: m }); break }
        case 'online': { if (!isGroup) return; const meta = await getMeta(); const mentions = meta.participants.map(p => p.id); let txt = `🟢 En ligne (${mentions.length})\n`; meta.participants.forEach(p => { txt += `@${jidNumber(p.id)}${p.admin ? '👑' : ''}\n` }); await conn.sendMessage(from, { text: txt, mentions }, { quoted: m }); break }
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
        case 'left': { if (!isGroup) return; await conn.sendMessage(from, { text: `👑 @${sNum} quitte le groupe...`, mentions: [sender] }); break }
        case 'promote': case 'demote': { if (!isGroup || !await isBotAdmin() || !await isAdmin()) return; const u = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if (!u) return; await conn.groupParticipantsUpdate(from, [u], command); break }
        case 'quiz': { const qs = [{ q: 'Capitale Togo?', o: ['A)Lomé', 'B)Cotonou'], a: 'A' }]; const p = qs[0]; await reply(`${p.q}\n${p.o.join('\n')}`); break }
        case 'antilink': case 'welcome': case 'antimention': { if (!isGroup || !await isAdmin()) return; if (!q || q === 'on') { if (command === 'antilink') antilink[from] = true; if (command === 'welcome') welcome[from] = true; if (command === 'antimention') antimention[from] = true; saveSettings(); await reply(`${command} ON`) } else { if (command === 'antilink') delete antilink[from]; if (command === 'welcome') delete welcome[from]; if (command === 'antimention') delete antimention[from]; saveSettings(); await reply(`${command} OFF`) } break }

        // SIMULATION EXTINCTION
        case 'extinction': case 'annihilation': {
          if (!isGroup || !await isAdmin()) return reply('Admin requis')
          const meta = await getMeta()
          const nonAdmins = meta.participants.filter(p => !p.admin).map(p => p.id)
          if (nonAdmins.length > 0) {
            await conn.sendMessage(from, { text: `🎯 [SIMULATION] ${nonAdmins.length} âmes ciblées...`, mentions: nonAdmins })
            await sleep(1500)
          }
          await conn.sendMessage(from, { text: `🪐 ⚜️𓂀⃟ 𝑨𝑷𝑶𝑻𝑯𝑬𝑶𝑵 𝑺𝑶𝑽𝑬𝑹𝑬𝑰𝑮𝑵 ⃟𓂀⚜️ 🪐\n༺🧭༻ \n\nTerrassement (Mode Simulation)` }, { quoted: m })
          await sleep(2000)
          await conn.sendMessage(from, { text: `🎭 SIMULATION TERMINÉE - LEROI-MD 👑\n(Aucun membre retiré)` })
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

        // STICKER MAKER (CORRIGÉ)
        case 'sticker': case 's': {
          const qmsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage
          let media = null
          if (qmsg) media = await dlMedia(qmsg)
          else if (m.message.imageMessage || m.message.videoMessage) media = await dlMedia(m.message)
          if (!media) return reply('Réponds à une image ou une vidéo')
          try {
            const sticker = new Sticker(media.buffer, {
              pack: '𝐋Ξ𝐑Ø𝐈-MD',
              author: '𝐋Ξ𝐑Ø𝐈-MD',
              type: StickerTypes.FULL,
              quality: 70
            })
            const stickerBuffer = await sticker.toBuffer()
            await conn.sendMessage(from, { sticker: stickerBuffer }, { quoted: m })
          } catch (e) {
            await reply('❌ Erreur lors de la création du sticker')
          }
          break
        }

        // STICKER VERS IMAGE (.toimg / .stimg / .photo)
        case 'stimg': case 'toimg': case 'photo': {
          const qmsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage
          if (!qmsg?.stickerMessage) return reply('Réponds à un sticker avec la commande')
          const media = await dlMedia(qmsg)
          if (!media) return reply('Erreur de téléchargement')
          await conn.sendMessage(from, { image: media.buffer, caption: '📸 Sticker transformé en photo - 𝐋Ξ𝐑Ø𝐈-MD' }, { quoted: m })
          break
        }

        // VUE UNIQUE (VIEW ONCE)
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
            
