
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const fetch = require('node-fetch')
const config = require('./config')

let prefix = config.prefix
let sudo = []
let selfMode = true // SECURE MODE ON - SEUL LE ROI PEUT COMMANDER

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const { version } = await fetchLatestBaileysVersion()
  
  const conn = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true
  })

  conn.ev.on('creds.update', saveCreds)

  conn.ev.on('connection.update', async (u) => {
    if(u.connection === 'open'){
      console.log("🌋 𝐋Ξ𝐑Ø𝐈-MD CONNECTÉ")
      // réaction volcan au démarrage
      try {
        await conn.sendMessage(conn.user.id, { text: "🌋 KAZAN EN LIGNE" })
      } catch {}
    }
  })

  conn.ev.on('messages.upsert', async ({ messages }) => {
    let m = messages[0]
    if(!m.message || m.key.fromMe) return
    let from = m.key.remoteJid
    let isGroup = from.endsWith('@g.us')
    let body = m.message.conversation || m.message.extendedTextMessage?.text || ""
    if(!body.startsWith(prefix)) return
    let args = body.slice(prefix.length).trim().split(/ +/)
    let command = args.shift().toLowerCase()
    let q = args.join(' ')

    // OWNER CHECK
    let sender = m.key.participant || from
    let isOwner = config.owner.includes(sender.split('@')[0]) || sudo.includes(sender)

    if(selfMode && !isOwner) return

    const getGroupMetadata = async () => await conn.groupMetadata(from)
    const isBotAdmin = isGroup ? (await getGroupMetadata()).participants.find(p=>p.id===conn.user.id)?.admin : false
    const isAdmin = isGroup ? (await getGroupMetadata()).participants.find(p=>p.id===sender)?.admin : false

    const reply = (t) => conn.sendMessage(from, { text: t }, { quoted: m })
    const sleep = (ms) => new Promise(r=>setTimeout(r, ms))

    switch(command){
      // BOT MENU
      case 'menu': case 'alive': {
        let menu = `
╔═══━━━──────━━━═══╗
   🔥 𓂀 KAZAN-MD-ROI 𓂀 🔥
      ORIGINAL
╚═══━━━──────━━━═══╝

> { RØI } † 🌹 IPPΦ  • 🔥KAZAN

╭─〔 👑 OWNER MENU 〕
│ • ${prefix}hidetag
│ • ${prefix}count • ${prefix}gpid
│ • ${prefix}sudo • ${prefix}delsudo
│ • ${prefix}prefix • ${prefix}self • ${prefix}delself
╰─

╭─〔 👥 GROUP MENU 〕
│ • ${prefix}tag • ${prefix}tagall • ${prefix}tagadmin
│ • ${prefix}gstatus • ${prefix}mute • ${prefix}unmute
│ • ${prefix}kick • ${prefix}promote • ${prefix}demote
│ • ${prefix}online • ${prefix}left • ${prefix}quiz
╰─

╭─〔 🛡️ SECURITY 〕
│ • ${prefix}antilink • ${prefix}antimention • ${prefix}welcome
╰─

╭─〔 🌋 KAZAN 〕
│ • ${prefix}annihilation
│ • ${prefix}raid1 • ${prefix}raid2 • ${prefix}raid3 • ${prefix}raid4
╰─
Total 31 commandes 🌋
`
        await conn.sendMessage(from, { image: fs.readFileSync(config.pp), caption: menu }, { quoted: m })
        break
      }
      case 'ping': {
        let start = Date.now()
        await reply('🌋 Pong!')
        reply(`Latence: ${Date.now()-start}ms`)
        break
      }
      case 'count': {
        if(!isGroup) return
        let meta = await getGroupMetadata()
        reply(`Membres: ${meta.participants.length}`)
        break
      }
      case 'gpid': {
        reply(from)
        break
      }
      // GROUP
      case 'tag': case 'tagall': {
        if(!isGroup || !isAdmin) return
        let meta = await getGroupMetadata()
        let mentions = meta.participants.map(p=>p.id)
        await conn.sendMessage(from, { text: q || "KAZAN TAG 🌋", mentions })
        break
      }
      case 'mute': {
        if(!isGroup || !isBotAdmin || !isAdmin) return
        await conn.groupSettingUpdate(from, 'announcement')
        reply('🔒 Groupe fermé - que les admins')
        break
      }
      case 'unmute': {
        if(!isGroup || !isBotAdmin || !isAdmin) return
        await conn.groupSettingUpdate(from, 'not_announcement')
        reply('🔓 Groupe ouvert')
        break
      }
      case 'kick': {
        if(!isGroup || !isBotAdmin || !isAdmin) return
        let user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        if(!user) return reply('Tag la personne')
        await conn.groupParticipantsUpdate(from, [user], 'remove')
        break
      }
      case 'annihilation': {
        if(!isGroup || !isBotAdmin || !isAdmin) return reply('Admin only')
        let meta = await getGroupMetadata()
        let count = meta.participants.length
        await conn.sendMessage(from, {
          text: `╔═══ 𓂀 ANNIHILATION 𓂀 ═══╗\n\n👁️ Scan: ${count} âmes\n👑 Initiateur: @${sender.split('@')[0]}\n\nPurification imminente...`,
          mentions: [sender]
        })
        await sleep(2000)
        for(let p of meta.participants){
          if(!p.admin && p.id !== conn.user.id){
            try { await conn.groupParticipantsUpdate(from, [p.id], 'remove'); await sleep(900) } catch {}
          }
        }
        await conn.sendMessage(from, { text: `1division division Kazan\nPurification\n\nDisparaissez  🐦‍🔥` })
        break
      }
      case 'raid1': case 'raid2': case 'raid3': case 'raid4': {
        if(!isGroup || !isBotAdmin || !isAdmin) return reply('Admin groupe seulement')
        let data = config.raids[command]
        try {
          await conn.groupUpdateSubject(from, data.name)
          await conn.groupUpdateDescription(from, data.desc)
          let res = await fetch(data.pp)
          let buf = await res.buffer()
          await conn.updateProfilePicture(from, buf)
          reply(`🌋 ${command.toUpperCase()} exécuté - KAZAN A AVANCÉ 𓂀`)
        } catch(e){ reply('Erreur RAID: '+e) }
        break
      }
      case 'left': {
        await conn.sendMessage(from, { text: 'sayonara' })
        await conn.groupLeave(from)
        break
      }
      // OWNER
      case 'self': { if(isOwner){ selfMode=true; reply('Mode privé ON')} break }
      case 'delself': { if(isOwner){ selfMode=false; reply('Mode public ON')} break }
    }
  })
}

start()
