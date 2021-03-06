const {
  genSeed,
  initWallet
} = require('../lnd-actions')

/** @typedef {import('../lnd-setup').LndWalletUnlockerClient} WalletUnlocker */
/** @typedef {{walletUnlocker: WalletUnlocker}} WalletUnlockerObject */

/**
 * Creates a wallet
 *
 * @param {string} password - wallet password, used to unlock lnd wallet
 * @returns {Promise<Array<string>>} 24 word cipher seed mnemonic
 * @this WalletUnlockerObject
 */
async function createWallet (password) {
  const { cipherSeedMnemonic } = await genSeed({ client: this.walletUnlocker })

  if (typeof password !== 'string') {
    throw new Error('Provided password must be a string value')
  }

  // Password must be converted to buffer in order for lnd to accept
  // as it does not accept String password types at this time.
  const walletPassword = Buffer.from(password, 'utf8')

  // This call merely resolves or rejects, there is no return value when the
  // wallet is initialized
  await initWallet(walletPassword, cipherSeedMnemonic, { client: this.walletUnlocker })

  return cipherSeedMnemonic
}

module.exports = createWallet
