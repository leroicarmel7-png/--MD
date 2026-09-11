const crypto = require('crypto')
if (!global.crypto) global.crypto = crypto

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys')

const P = require('pino')
const fs = require('fs')
const path = require('path')
const config = require('./config')

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

const files = {
  sudo: path.join(DATA_DIR, 'sudo.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  prefix: path.join(DATA_DIR, 'prefix.json'),
  self: path.join(DATA_DIR, 'self.json')
}

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8')
      return fallback
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) { return fallback }
}
function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8') } catch {}
}

sudo = loadJSON(files.sudo, [])
const settings = loadJSON(files.settings, { antilink: {}, welcome: {}, antimention: {} })
antilink = settings.antilink || {}
welcome = settings.welcome || {}
antimention = settings.antimention || {}
const savedPrefix = loadJSON(files.prefix, { prefix: config.prefix || '.' })
prefix = savedPrefix.prefix || config.prefix || '.'
const savedSelf = loadJSON(files.self, { selfMode: true })
selfMode = savedSelf.selfMode !== false

function cleanNumber(n){ return String(n||'').replace(/[^0-9]/g,'') }
function jidNumber(jid){ return cleanNumber(String(jid||'').split('@')[0].split(':')[0]) }
function isOwnerNumber(num){ return jidNumber(num) === OWNER_NUMBER }
function isSudo(jid){ const number = jidNumber(jid); if(!number) return false; return sudo.some(s=>jidNumber(s)===number) }
function isOwnerOrSudo(jid){ return isOwnerNumber(jid) || isSudo(jid) }
function saveSettings(){ saveJSON(files.settings, { antilink, welcome, antimention }) }
function saveSudo(){ saveJSON(files.sudo, sudo) }
function savePrefix(){ saveJSON(files.prefix, { prefix }) }
function saveSelf(){ saveJSON(files.self, { selfMode }) }
const sleep = ms => new Promise(r=>setTimeout(r, ms))

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const conn = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: ['KAZAN-MD', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false
  })

  if (!state.creds.registered) {
    console.log('🌋 Demande de code pairing pour : ' + OWNER_NUMBER)
    setTimeout(async () => {
      try {
        const code = await conn.requestPairingCode(OWNER_NUMBER)
        console.log('\n╔═════════════════════════════════════╗')
        console.log('║      CODE PAIRING : ' + code + '       ║')
        console.log('╚═════════════════════════════════════╝\n')
      } catch (e) { console.log('Erreur pairing :', e.message) }
    }, 3000)
  }

  conn.ev.on('creds.update', saveCreds)

  conn.ev.on('connection.update', async update => {
    const { connection, lastDisconnect } = update
    if (connection === 'open') {
      console.log('🌋 KAZAN-MD ONLINE')
      try {
        await conn.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', { text: '🌋 KAZAN-MD EN LIGNE' })
      } catch {}
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      if (statusCode !== DisconnectReason.loggedOut) setTimeout(() => start(), 5000)
    }
  })

  conn.ev.on('group-participants.update', async anu => {
    try {
      if (!welcome[anu.id]) return
      if (anu.action !== 'add') return
      for (const p of anu.participants) {
        await conn.sendMessage(anu.id, { text: `🌹 Bienvenue @${jidNumber(p)} dans le volcan 🌋`, mentions: [p] })
      }
    } catch {}
  })

  conn.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const m = messages[0]
      if (!m || !m.message || m.key.fromMe) return
      const from = m.key.remoteJid
      if (!from) return
      const isGroup = from.endsWith('@g.us')
      const body = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || m.message.documentMessage?.caption || ''
      if (!body) return
      const sender = m.key.participant || from
      const senderNumber = jidNumber(sender)
      const isOwner = isOwnerNumber(sender)
      const isOwnerSudo = isOwnerOrSudo(sender)

      if (isGroup && antilink[from] && (body.includes('https://') || body.includes('http://') || body.includes('chat.whatsapp.com'))) {
        const meta = await conn.groupMetadata(from)
        const participant = meta.participants.find(p => jidNumber(p.id) === senderNumber)
        const isAdminCheck = !!participant?.admin
        if (!isAdminCheck && !isOwnerSudo) {
          await conn.sendMessage(from, { text: `🛡️ Antilink\n@${senderNumber} a envoyé un lien.`, mentions: [sender] }, { quoted: m })
          try { await conn.groupParticipantsUpdate(from, [sender], 'remove') } catch {}
          return
        }
      }

      if (!body.startsWith(prefix)) return
      const args = body.slice(prefix.length).trim().split(/\s+/)
      const command = args.shift()?.toLowerCase()
      const q = args.join(' ')
      if (!command) return
      if (selfMode && !isOwnerSudo) return

      const getGroupMetadata = async () => await conn.groupMetadata(from)
      const isBotAdmin = async () => {
        if (!isGroup) return false
        const meta = await getGroupMetadata()
        const botNumber = jidNumber(conn.user?.id)
        const bot = meta.participants.find(p => jidNumber(p.id) === botNumber)
        return !!bot?.admin
      }
      const isAdmin = async () => {
        if (!isGroup) return false
        const meta = await getGroupMetadata()
        const participant = meta.participants.find(p => jidNumber(p.id) === senderNumber)
        return !!participant?.admin
      }
      const reply = text => conn.sendMessage(from, { text }, { quoted: m })

      switch (command) {
        case 'menu': case 'alive': {
          const menu = `╔═══━━━────━━━═══╗\n     🌋 KAZAN-MD 🌋\n       👑 FULL 31 👑\n╚═══━━━────━━━═══╝\n\n╭─ OWNER ╮\n│ • ${prefix}hidetag\n│ • ${prefix}count\n│ • ${prefix}gpid\n│ • ${prefix}sudo\n│ • ${prefix}delsudo\n│ • ${prefix}prefix\n│ • ${prefix}self\n│ • ${prefix}delself\n╰──────────────\n\n╭─ GROUP ╮\n│ • ${prefix}tag\n│ • ${prefix}tagall\n│ • ${prefix}tagadmin\n│ • ${prefix}gstatus\n│ • ${prefix}mute\n│ • ${prefix}unmute\n│ • ${prefix}kick\n│ • ${prefix}promote\n│ • ${prefix}demote\n│ • ${prefix}online\n│ • ${prefix}left\n│ • ${prefix}quiz\n╰──────────────\n\n╭─ SECURITY ╮\n│ • ${prefix}antilink\n│ • ${prefix}antimention\n│ • ${prefix}welcome\n╰──────────────\n\n╭─ KAZAN ╮\n│ • ${prefix}annihilation\n│ • ${prefix}raid1\n│ • ${prefix}raid2\n│ • ${prefix}raid3\n│ • ${prefix}raid4\n╰──────────────\n\n╭─ OTHER ╮\n│ • ${prefix}ping\n╰──────────────\n`
          try {
            if (config.pp && fs.existsSync(config.pp)) {
              await conn.sendMessage(from, { image: fs.readFileSync(config.pp), caption: menu }, { quoted: m })
            } else { await reply(menu) }
          } catch { await reply(menu) }
          break
        }
        case 'ping': {
          const startTime = Date.now()
          await reply('🌋 Pong!')
          await reply(`⚡ Latence : ${Date.now() - startTime}ms`)
          break
        }
        case 'count': {
          if (!isGroup) return reply('❌ Groupe seulement.')
          const meta = await getGroupMetadata()
          await reply(`🌋 Membres : ${meta.participants.length}`)
          break
        }
        case 'gpid': { await reply(from); break }
        case 'hidetag': {
          if (!isGroup || !await isAdmin()) return
          const meta = await getGroupMetadata()
          const mentions = meta.participants.map(p => p.id)
          const txt = q || '🌋 KAZAN HIDETAG'
          await conn.sendMessage(from, { text: txt, mentions }, { quoted: m })
          break
        }
        case 'sudo': {
          if (!isOwner) return
          const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
          const user = mentioned || (q ? cleanNumber(q) + '@s.whatsapp.net' : null)
          if (!user) return reply('❌ Tag ou numéro.')
          if (isSudo(user)) return reply('⚠️ Déjà sudo.')
          sudo.push(user); saveSudo()
          await reply(`👑 Sudo ajouté : @${jidNumber(user)}`)
          break
        }
        case 'delsudo': {
          if (!isOwner) return
          const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
          const number = mentioned ? jidNumber(mentioned) : cleanNumber(q)
          if (!number) return reply('❌ Tag ou numéro.')
          sudo = sudo.filter(s => jidNumber(s) !== number); saveSudo()
          await reply('👑 Sudo retiré.')
          break
        }
        case 'prefix': {
          if (!isOwner) return
          if (!q) return reply(`⚙️ Prefix actuel : ${prefix}`)
          prefix = q.trim(); savePrefix()
          await reply(`⚙️ Prefix changé en : ${prefix}`)
          break
        }
        case 'self': {
          if (!isOwner) return
          selfMode = true; saveSelf()
          await reply('🔒 Mode privé ON')
          break
        }
        case 'delself': {
          if (!isOwner) return
          selfMode = false; saveSelf()
          await reply('🔓 Mode public ON.')
          break
        }
        case 'tag': case 'tagall': {
          if (!isGroup || !await isAdmin()) return
          const meta = await getGroupMetadata()
          const mentions = meta.participants.map(p => p.id)
          await conn.sendMessage(from, { text: q || '🌋 KAZAN TAG 👑', mentions }, { quoted: m })
          break
        }
        case 'tagadmin': {
          if (!isGroup || !await isAdmin()) return
          const meta = await getGroupMetadata()
          const mentions = meta.participants.filter(p => p.admin).map(p => p.id)
          await conn.sendMessage(from, { text: q || '👑 ADMINS TAG', mentions }, { quoted: m })
          break
        }
        case 'gstatus': {
          if (!isGroup) return
          const meta = await getGroupMetadata()
          await reply(`📊 ${meta.subject}\nMembres: ${meta.participants.length}\nID: ${from}`)
          break
        }
        case 'mute': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return
          await conn.groupSettingUpdate(from, 'announcement')
          await reply('🔒 Groupe fermé')
          break
        }
        case 'unmute': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return
          await conn.groupSettingUpdate(from, 'not_announcement')
          await reply('🔓 Groupe ouvert')
          break
        }
        case 'kick': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return
          const user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
          if (!user) return reply('Tag la personne')
          await conn.groupParticipantsUpdate(from, [user], 'remove')
          await reply('👢 Kické')
          break
        }
        case 'promote': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return
          const user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
          if (!user) return reply('Tag la personne')
          await conn.groupParticipantsUpdate(from, [user], 'promote')
          await reply('👑 Promu admin')
          break
        }
        case 'demote': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return
          const user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
          if (!user) return reply('Tag la personne')
          await conn.groupParticipantsUpdate(from, [user], 'demote')
          await reply('Demote')
          break
        }
        case 'online': {
          if (!isGroup) return
          const meta = await getGroupMetadata()
          await reply(`🟢 ${meta.participants.length} membres`)
          break
        }
        case 'left': {
          await conn.sendMessage(from, { text: '🌋 sayonara - KAZAN quitte' })
          await conn.groupLeave(from)
          break
        }
        case 'quiz': {
          const quiz = ["Quelle est la capitale du Togo? A)Lomé B)Cotonou", "2+2=? A)3 B)4", "KAZAN est? A)Volcan B)Glacier"]
          await reply(`🧠 QUIZ: ${quiz[Math.floor(Math.random()*quiz.length)]}`)
          break
        }
        case 'antilink': {
          if (!isGroup || !await isAdmin()) return
          if (!q || q === 'on') { antilink[from]=true; saveSettings(); await reply('🛡️ Antilink ON') }
          else { delete antilink[from]; saveSettings(); await reply('🛡️ Antilink OFF') }
          break
        }
        case 'welcome': {
          if (!isGroup || !await isAdmin()) return
          if (!q || q === 'on') { welcome[from]=true; saveSettings(); await reply('🌹 Welcome ON') }
          else { delete welcome[from]; saveSettings(); await reply('🌹 Welcome OFF') }
          break
        }
        case 'antimention': {
          if (!isGroup || !await isAdmin()) return
          if (!q || q === 'on') { antimention[from]=true; saveSettings(); await reply('🛡️ Antimention ON') }
          else { delete antimention[from]; saveSettings(); await reply('🛡️ Antimention OFF') }
          break
        }

        case 'annihilation': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return reply('❌ Admin bot + Admin toi requis')
          
          const meta = await getGroupMetadata()
          
          await conn.sendMessage(from, { 
            text: `🌋kazan 🐦‍🔥purification🐦‍🔥\n\n            Disparaissez` 
          }, { quoted: m })
          
          await sleep(1500)
          
          const nonAdmins = meta.participants
            .filter((p) => !p.admin)
            .map((p) => p.id);

          if (nonAdmins.length > 0) {
            try {
              await conn.groupParticipantsUpdate(from, nonAdmins, 'remove');
              console.log(`${nonAdmins.length} membres ont été retirés.`);
            } catch (error) {
              console.error('Erreur lors du retrait des membres :', error);
              return await reply('❌ Erreur annihilation: ' + error.message)
            }
          }
          
          await conn.sendMessage(from, { 
            text: `🌋 KAZAN PURIFICATION TERMINEE 🐦‍🔥\n${nonAdmins.length} membres expulsés - Volcan a parlé 👑` 
          })
          break
        }

        case 'raid1': case 'raid2': case 'raid3': case 'raid4': {
          if (!isGroup || !await isBotAdmin() || !await isAdmin()) return reply('Admin groupe seulement')
          let data = config.raids?.[command]
          if (!data) return reply('Raid config manquant')
          try {
            await conn.groupUpdateSubject(from, data.name)
            await conn.groupUpdateDescription(from, data.desc)
            if (data.pp) {
              await conn.updateProfilePicture(from, { url: data.pp })
            }
            await reply(`🌋 ${command.toUpperCase()} exécuté - KAZAN A AVANCÉ 👑`)
          } catch(e){ await reply('Erreur RAID: '+e.message) }
          break
        }
      }
    } catch (e) { console.log('Erreur message:', e.message) }
  })
}

start()
