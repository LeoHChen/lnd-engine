const { addHoldInvoice, lookupInvoice } = require('../lnd-actions')

/**
 * The memo prefix allows us to easily find SparkSwap-related invoices
 * in LND. In this case, the invoice is the pivot point of the swap
 * where it changes chains.
 * @constant
 * @type {string}
 * @default
 */
const MEMO_PREFIX = 'sparkswap-swap-pivot'

/**
 * Prepares for a swap in which this node is the counterparty to the intiating node
 *
 * @param {string} swapHash - base64 hash that will be associated with the swap
 * @param {string} value - Int64 string of the value of inbound currency
 * @param {Date} expiryTime - absolute payment request expiry time
 * @param {number} cltvExpiry - delta to use for the time-lock of the CLTV
 *                              extended to the final hop (in seconds)
 * @returns {Promise<string>} paymentRequest - lightning invoice for a payment
 */
async function prepareSwap (swapHash, value, expiryTime, cltvExpiry) {
  this.logger.info(`Preparing swap for ${swapHash}`, { value })
  // Round up on number of blocks since a transaction that occurs right before
  // the expiration time will get processed in the following block.
  // The gRPC endpoint expects an int64 number, so we need to to convert to a
  // string prior to creating an invoice or comparing to an invoice.
  const cltvExpiryBlocks = Math.ceil(cltvExpiry / this.secondsPerBlock).toString()

  // make prepareSwap idempotent by returning the existing invoice if one exists
  try {
    const {
      paymentRequest,
      value: invoiceValue,
      cltvExpiry: invoiceCLTVExpiry
    } = await lookupInvoice({ rHash: swapHash }, { client: this.client })

    if (invoiceValue !== value || invoiceCLTVExpiry !== cltvExpiryBlocks) {
      // if the invoice doesn't match, we log an error and  prepare a new invoice
      const message = `Invoice found for hash ${swapHash} but parameters are wrong`
      this.logger.error(message)
      throw new Error(message)
    }
    return paymentRequest
  } catch (e) {
    const expiry = Math.floor((expiryTime.getTime() - (new Date()).getTime()) / 1000)
    const params = {
      memo: `${MEMO_PREFIX}`,
      hash: swapHash,
      value,
      expiry: expiry.toString(),
      cltvExpiry: cltvExpiryBlocks
    }

    const { paymentRequest } = await addHoldInvoice(params, { client: this.client })
    return paymentRequest
  }
}

module.exports = prepareSwap
