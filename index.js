const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const fetch = require('node-fetch')
const config = require('./config')

let prefix = config.prefix
let sudo = []
let selfMode = true
let antilink = {}
let welcome = {}
let antimention = {}

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
      console.log("ðŸŒ‹ ð‹Îžð‘Ã˜ðˆ-MD FULL 31 ONLINE")
      try { await conn.sendMessage(conn.user.id, { text: "ðŸŒ‹ KAZAN FULL 31 EN LIGNE - 31 COMMANDES ACTIVES" }) } catch {}
    }
  })

  // WELCOME + ANTILINK HANDLER
  conn.ev.on('group-participants.update', async (anu) => {
    try {
      if(welcome[anu.id]){
        for(let p of anu.participants){
          if(anu.action === 'add'){
            await conn.sendMessage(anu.id, { text: `ðŸŒ¹ Bienvenue @${p.split('@')[0]} dans le volcan ðŸŒ‹`, mentions: [p] })
          }
        }
      }
    } catch {}
  })

  conn.ev.on('messages.upsert', async ({ messages }) => {
    let m = messages[0]
    if(!m.message || m.key.fromMe) return
    let from = m.key.remoteJid
    let isGroup = from.endsWith('@g.us')
    let body = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || ""
    
    // ANTILINK / ANTIMENTION CHECK (avant prefix)
    if(isGroup && body){
      if(antilink[from] && (body.includes('https://') || body.includes('chat.whatsapp.com'))){
        let sender = m.key.participant || from
        let isAdminCheck = (await conn.groupMetadata(from)).participants.find(p=>p.id===sender)?.admin
        let isOwnerCheck = config.owner.includes(sender.split('@')[0]) || sudo.includes(sender)
        if(!isAdminCheck && !isOwnerCheck){
          await conn.sendMessage(from, { text: `ðŸ›¡ï¸ Antilink - @${sender.split('@')[0]} a envoyÃ© un lien`, mentions: [sender] }, { quoted: m })
          try { await conn.groupParticipantsUpdate(from, [sender], 'remove') } catch {}
          return
        }
      }
    }

    if(!body.startsWith(prefix)) return
    let args = body.slice(prefix.length).trim().split(/ +/)
    let command = args.shift().toLowerCase()
    let q = args.join(' ')

    let sender = m.key.participant || from
    let isOwner = config.owner.includes(sender.split('@')[0]) || sudo.includes(sender)

    if(selfMode && !isOwner) return

    const getGroupMetadata = async () => await conn.groupMetadata(from)
    const isBotAdmin = async () => isGroup ? (await getGroupMetadata()).participants.find(p=>p.id===conn.user.id)?.admin : false
    const isAdmin = async () => isGroup ? (await getGroupMetadata()).participants.find(p=>p.id===sender)?.admin : false

    const reply = (t) => conn.sendMessage(from, { text: t }, { quoted: m })
    const sleep = (ms) => new Promise(r=>setTimeout(r, ms))

    switch(command){
      // === OWNER MENU ===
      case 'menu': case 'alive': {
        let menu = `
â•”â•â•â•â”â”â”â”€â”€â”€â”€â”€â”€â”â”â”â•â•â•â•—
   ðŸ”¥ ð“‚€ KAZAN-MD-ROI ð“‚€ ðŸ”¥
      FULL 31 COMMANDES
â•šâ•â•â•â”â”â”â”€â”€â”€â”€â”€â”€â”â”â”â•â•â•â•

> { RÃ˜I } â€  ðŸŒ¹ IPPÎ¦ â€¢ ðŸ”¥KAZAN

â•­â”€ã€” ðŸ‘‘ OWNER ã€•
â”‚ â€¢ ${prefix}hidetag
â”‚ â€¢ ${prefix}count â€¢ ${prefix}gpid
â”‚ â€¢ ${prefix}sudo â€¢ ${prefix}delsudo
â”‚ â€¢ ${prefix}prefix â€¢ ${prefix}self â€¢ ${prefix}delself
â•°â”€

â•­â”€ã€” ðŸ‘¥ GROUP ã€•
â”‚ â€¢ ${prefix}tag â€¢ ${prefix}tagall â€¢ ${prefix}tagadmin
â”‚ â€¢ ${prefix}gstatus â€¢ ${prefix}mute â€¢ ${prefix}unmute
â”‚ â€¢ ${prefix}kick â€¢ ${prefix}promote â€¢ ${prefix}demote
â”‚ â€¢ ${prefix}online â€¢ ${prefix}left â€¢ ${prefix}quiz
â•°â”€

â•­â”€ã€” ðŸ›¡ï¸ SECURITY ã€•
â”‚ â€¢ ${prefix}antilink â€¢ ${prefix}antimention â€¢ ${prefix}welcome
â•°â”€

â•­â”€ã€” ðŸŒ‹ KAZAN ã€•
â”‚ â€¢ ${prefix}annihilation
â”‚ â€¢ ${prefix}raid1 â€¢ ${prefix}raid2 â€¢ ${prefix}raid3 â€¢ ${prefix}raid4
â•°â”€

â•­â”€ã€” âš¡ AUTRE ã€•
â”‚ â€¢ ${prefix}ping
â•°â”€
Total 31 commandes ðŸŒ‹ðŸ‘‘
`
        try {
          await conn.sendMessage(from, { image: fs.readFileSync(config.pp), caption: menu }, { quoted: m })
        } catch {
          await conn.sendMessage(from, { text: menu }, { quoted: m })
        }
        break
      }
      case 'ping': {
        let start = Date.now()
        await reply('ðŸŒ‹ Pong!')
        reply(`Latence: ${Date.now()-start}ms | Full 31 Actif ðŸ‘‘`)
        break
      }
      case 'count': {
        if(!isGroup) return reply('Groupe seulement')
        let meta = await getGroupMetadata()
        reply(`ðŸŒ‹ Membres: ${meta.participants.length}`)
        break
      }
      case 'gpid': { reply(from); break }
      case 'hidetag': {
        if(!isGroup || !await isAdmin()) return
        let meta = await getGroupMetadata()
        let mentions = meta.participants.map(p=>p.id)
        let txt = q || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "ðŸŒ‹ KAZAN HIDETAG"
        await conn.sendMessage(from, { text: txt, mentions })
        break
      }
      case 'sudo': {
        if(!isOwner) return
        let user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (q ? q.replace(/[^0-9]/g,'')+'@s.whatsapp.net' : null)
        if(!user) return reply('Tag ou numÃ©ro')
        sudo.push(user)
        reply(`ðŸ‘‘ Sudo ajoutÃ©: ${user}`)
        break
      }
      case 'delsudo': {
        if(!isOwner) return
        let user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (q ? q.replace(/[^0-9]/g,'')+'@s.whatsapp.net' : null)
        if(!user) return reply('Tag ou numÃ©ro')
        sudo = sudo.filter(s=>s!==user)
        reply(`ðŸ‘‘ Sudo retirÃ©`)
        break
      }
      case 'prefix': {
        if(!isOwner) return
        if(!q) return reply(`Prefix actuel: ${prefix}`)
        prefix = q
        reply(`Prefix changÃ© en: ${prefix}`)
        break
      }
      case 'self': { if(isOwner){ selfMode=true; reply('ðŸ”’ Mode privÃ© ON - Seul le ROI commande')} break }
      case 'delself': { if(isOwner){ selfMode=false; reply('ðŸ”“ Mode public ON - Tout le monde peut utiliser')} break }

      // === GROUP MENU ===
      case 'tag': case 'tagall': {
        if(!isGroup || !await isAdmin()) return
        let meta = await getGroupMetadata()
        let mentions = meta.participants.map(p=>p.id)
        await conn.sendMessage(from, { text: q || "ðŸŒ‹ KAZAN TAG ðŸ‘‘", mentions })
        break
      }
      case 'tagadmin': {
        if(!isGroup || !await isAdmin()) return
        let meta = await getGroupMetadata()
        let mentions = meta.participants.filter(p=>p.admin).map(p=>p.id)
        await conn.sendMessage(from, { text: q || "ðŸ‘‘ ADMINS TAG", mentions })
        break
      }
      case 'gstatus': {
        if(!isGroup) return
        let meta = await getGroupMetadata()
        let admins = meta.participants.filter(p=>p.admin).length
        reply(`ðŸ“Š GSTATUS\nNom: ${meta.subject}\nMembres: ${meta.participants.length}\nAdmins: ${admins}\nID: ${from}`)
        break
      }
      case 'mute': {
        if(!isGroup || !await isBotAdmin() || !await isAdmin()) return
        await conn.groupSettingUpdate(from, 'announcement')
        reply('ðŸ”’ Groupe fermÃ© - que les admins')
        break
      }
      case 'unmute': {
        if(!isGroup || !await isBotAdmin() || !await isAdmin()) return
        await conn.groupSettingUpdate(from, 'not_announcement')
        reply('ðŸ”“ Groupe ouvert')
        break
      }
      case 'kick': {
        if(!isGroup || !await isBotAdmin() || !await isAdmin()) return
        let user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        if(!user) return reply('Tag la personne')
        await conn.groupParticipantsUpdate(from, [user], 'remove')
        reply('ðŸ‘¢ KickÃ©')
        break
      }
      case 'promote': {
        if(!isGroup || !await isBotAdmin() || !await isAdmin()) return
        let user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        if(!user) return reply('Tag la personne')
        await conn.groupParticipantsUpdate(from, [user], 'promote')
        reply('ðŸ‘‘ Promu admin')
        break
      }
      case 'demote': {
        if(!isGroup || !await isBotAdmin() || !await isAdmin()) return
        let user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        if(!user) return reply('Tag la personne')
        await conn.groupParticipantsUpdate(from, [user], 'demote')
        reply('Demote')
        break
      }
      case 'online': {
        if(!isGroup) return
        let meta = await getGroupMetadata()
        reply(`ðŸŸ¢ Online check: ${meta.participants.length} membres dans le groupe`)
        break
      }
      case 'left': {
        await conn.sendMessage(from, { text: 'ðŸŒ‹ sayonara - KAZAN quitte' })
        await conn.groupLeave(from)
        break
      }
      case 'quiz': {
        let quiz = ["Quelle est la capitale du Togo? A)LomÃ© B)Cotonou", "2+2=? A)3 B)4", "KAZAN est? A)Volcan B)Glacier"]
        reply(`ðŸ§  QUIZ: ${quiz[Math.floor(Math.random()*quiz.length)]}`)
        break
      }

      // === SECURITY ===
      case 'antilink': {
        if(!isGroup || !await isAdmin()) return
        if(!q || q === 'on'){ antilink[from]=true; reply('ðŸ›¡ï¸ Antilink ON') }
        else { delete antilink[from]; reply('ðŸ›¡ï¸ Antilink OFF') }
        break
      }
      case 'welcome': {
        if(!isGroup || !await isAdmin()) return
        if(!q || q === 'on'){ welcome[from]=true; reply('ðŸŒ¹ Welcome ON') }
        else { delete welcome[from]; reply('ðŸŒ¹ Welcome OFF') }
        break
      }
      case 'antimention': {
        if(!isGroup || !await isAdmin()) return
        if(!q || q === 'on'){ antimention[from]=true; reply('Antimention ON') }
        else { delete antimention[from]; reply('Antimention OFF') }
        break
      }

      // === KAZAN ===
      case 'annihilation': {
        if(!isGroup || !await isBotAdmin() || !await isAdmin()) return reply('Admin only')
        let meta = await getGroupMetadata()
        let count = meta.participants.length
        await conn.sendMessage(from, {
          text: `â•”â•â•â• ð“‚€ ANNIHILATION ð“‚€ â•â•â•â•—\n\nðŸ‘ï¸ Scan: ${count} Ã¢mes\nðŸ‘‘ Initiateur: @${sender.split('@')[0]}\n\nPurification imminente...`,
          mentions: [sender]
        })
        await sleep(2000)
        for(let p of meta.participants){
          if(!p.admin && p.id !== conn.user.id){
            try { await conn.groupParticipantsUpdate(from, [p.id], 'remove'); await sleep(900) } catch {}
          }
        }
        await conn.sendMessage(from, { text: `1division division Kazan\nPurification\n\nDisparaissez  ðŸ¦â€ðŸ”¥` })
        break
      }
      case 'raid1': case 'raid2': case 'raid3': case 'raid4': {
        if(!isGroup || !await isBotAdmin() || !await isAdmin()) return reply('Admin groupe seulement')
        let data = config.raids[command]
        try {
          await conn.groupUpdateSubject(from, data.name)
          await conn.groupUpdateDescription(from, data.desc)
          let res = await fetch(data.pp)
          let buf = await res.buffer()
          await conn.updateProfilePicture(from, buf)
          reply(`ðŸŒ‹ ${command.toUpperCase()} exÃ©cutÃ© - KAZAN A AVANCÃ‰ ð“‚€`)
        } catch(e){ reply('Erreur RAID: '+e.message) }
        break
      }
    }
  })
}

start()
