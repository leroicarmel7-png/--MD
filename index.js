async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const conn = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: ['KAZAN-MD', 'Chrome', '1.0'],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000
  })

  if (!state.creds.registered) {
    console.log('🌋 Demande de code pairing pour : ' + OWNER_NUMBER)
    setTimeout(async () => {
      try {
        const code = await conn.requestPairingCode(OWNER_NUMBER)
        console.log('\n╔═════════════════════════════════════╗')
        console.log('║      CODE PAIRING : ' + code + '       ║')
        console.log('╚═════════════════════════════════════╝\n')
      } catch (e) { 
        console.log('Erreur pairing :', e.message)
      }
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
      console.log('Connexion fermée (Code:', statusCode, '). Relance...')
      // Reconnexion automatique immédiate pour ne pas couper le serveur
      start()
    }
  })
  
