const { deadline } = require('../grpc-utils')

/** @typedef {import('../lnd-setup').LndClient} LndClient */

/**
 * SendPayment deadline (in seconds)
 * @constant
 * @type {number}
 * @default
 */
const SEND_PAYMENT_DEADLINE = 30

// TODO: verify this against BOLT 11
/** @typedef {object} SendPaymentRequestFormatA
 * @property {string}  paymentOptions.paymentHash -
 *   Base64 string of the payment hash to use
 * @property {string}  paymentOptions.destString -
 *   destination public key
 * @property {string}  paymentOptions.amt -
 *   Int64 string of number of satoshis to send
 * @property {number}  paymentOptions.finalCltvDelta -
 *   Delta from the current block height to be used for the final hop
 * @property {object}  paymentOptions.feeLimit
 * @property {string} [paymentOptions.feeLimit.fixed] -
 *   Int64 string of maximum number of satoshis to pay in fees
 * @property {string} [paymentOptions.feeLimit.percent] -
 *   Int64 string of fee limit exepressed as a pecentage of payment amount
 * @property {number}  [paymentOptions.cltvLimit] -
 *   Maximum number of blocks in the route timelock
 */

/** @typedef {object} SendPaymentRequestFormatB
 * @property {string} paymentOptions.paymentRequest - LN Payment Request
 */

/** @typedef {SendPaymentRequestFormatA | SendPaymentRequestFormatB}
 *    SendPaymentRequest
 */

/**
 * Sends a payment to a specified invoice
 *
 * @see http://api.lightning.community/#sendPaymentSync
 * @param {SendPaymentRequest} paymentOptions
 * @param {object} opts
 * @param {LndClient} opts.client
 * @returns {Promise<object>} Resolves with the response from LND
 */
function sendPayment (paymentOptions, { client }) {
  return new Promise((resolve, reject) => {
    client.sendPaymentSync(paymentOptions, { deadline: deadline(SEND_PAYMENT_DEADLINE) }, (err, res) => {
      if (err) return reject(err)
      return resolve(res)
    })
  })
}

module.exports = sendPayment
