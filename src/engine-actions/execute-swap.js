const { describeGraph, getInfo, listChannels, sendToRoute } = require('../lnd-actions')
const { LTC_FEE_PER_KW, BTC_FEE_PER_KW } = require('../config')
const { Big } = require('../utils')
const DEFAULT_CLTV_DELTA = '9'

/**
 * Executes a swap as the initiating node
 *
 * @param {String} counterpartyPubKey LN identity_publickey
 * @param {String} swapHash           swap hash that will be associated with the swap
 * @param {Object} inbound            Inbound currency details
 * @param {String} inbound.symbol     Symbol of the inbound currency
 * @param {String} inbound.value      Int64 string of the value of inbound currency
 * @param {Object} outbound           Outbound currency details
 * @param {String} outbound.symbol    Symbol of the outbound currency
 * @param {String} outbound.value     Int64 string of the value of outbound currency
 * @returns {Promise<void>}           Promise that resolves when the swap is settled
 */
async function executeSwap (counterpartyPubKey, swapHash, inbound, outbound) {
  this.logger.info(`Executing swap for ${swapHash} with ${counterpartyPubKey}`, { inbound, outbound })

  // get all routes
  const [ graph, { identityPubkey, blockHeight }, { channels } ] = await Promise.all([
    describeGraph({ client: this.client }),
    getInfo({ client: this.client }),
    listChannels({ client: this.client })
  ])

  console.log('graph')
  console.log(graph)

  const hints = getBandwidthHints(channels, identityPubkey)

  console.log('hints')
  console.log(hints)

  // find paths
  const outboundPath = findPaths(graph.edges, hints, identityPubkey, counterpartyPubKey, outbound.symbol, outbound.amount)
  console.log('outboundPath')
  console.log(outboundPath)

  const inboundPath = findPaths(graph.edges, hints, counterpartyPubKey, identityPubkey, inbound.symbol, inbound.amount)
  console.log('inboundPath')
  console.log(inboundPath)

  if (!outboundPath || !inboundPath) {
    throw new Error(`Can't find a route between ${identityPubkey} and ${counterpartyPubKey} to swap ${outbound.amount} ${outbound.symbol} for ${inbound.amount} ${inbound.symbol}`)
  }

  // construct a valid route
  // TODO: need to construct two routes and then stitch them together, not treat as one big route
  const route = routeFromPath(inbound.amount, Big(DEFAULT_CLTV_DELTA).plus(blockHeight), outboundPath.concat(inboundPath))

  console.log('route', route)
  console.log(route)

  const { paymentError, paymentPreimage } = await sendToRoute(swapHash, route, { client: this.client })

  if (paymentError) {
    throw new Error(`Error from LND while sending to route: ${paymentError}`)
  }

  return paymentPreimage
}

/**
 * Construct a route (with fee and time lock data) from a selected path
 * @param {String} Int64 string of amount to send
 * @param {String} Int64 string of the final CLTV (i.e. current best block + final CLTV)
 * @param  {Array<InternalChannelEdge>} path Array of channel edges in order for the full path
 * @return {Object}      Route
 */
function routeFromPath (amountToSend, finalCLTV, path) {
  const amountToSendMsat = Big(amountToSend).times(1000)

  // we want to traverse the path in reverse so we can
  // build up to our final amount
  const backtrack = path.slice().reverse()

  let currentAmountMsat = amountToSendMsat
  let currentCLTV = Big(finalCLTV)

  const hops = backtrack.map((channel, index) => {
    let feeMsat
    let timeLockDelta

    // first in back track is our final destination
    if (index === 0) {
      // last hop: no fees, no extra time lock
      feeMsat = '0'
      timeLockDelta = 0
    } else {
      feeMsat = computeFee(currentAmountMsat, channel.policy)
      timeLockDelta = channel.policy.timeLockDelta
    }

    // update the current amount so we have enough funds to forward
    currentAmountMsat = currentAmountMsat.plus(feeMsat)

    // update the current cltv to have enough expiry
    currentCLTV = currentCLTV.plus(timeLockDelta)

    return {
      chanId: channel.channelId,
      chanCapacity: channel.capacity,
      expiry: Number(currentCLTV), // expiry is a uint32, so needs to be a number
      AmtToForwardMsat: currentAmountMsat.minus(feeMsat).toString(),
      FeeMsat: feeMsat
    }
  }).reverse()

  return {
    hops: hops,
    totalTimeLock: Number(currentCLTV), // timelock is a uint32, so needs to be a number
    totalAmtMsat: currentAmountMsat.toString(),
    totalFeesMsat: currentAmountMsat.minus(amountToSendMsat).toString()
  }
}

/**
 * Compute the fee for a given hop
 * @param  {String} amount Int64 Amount, in millisatoshis, to compute the fee for
 * @param  {LND~RoutePolicy} policy Routing Policy for the hop
 * @return {String}        Int64 of the amount of the fee in millisatoshis
 */
function computeFee (amount, policy) {
  const baseFee = Big(policy.feeBaseMsat)
  const feeRate = Big(policy.feeRateMilliMsat)

  // fees are per million satoshis
  // we need to round up so that our fee will be accepted
  // @see {@link https://github.com/lightningnetwork/lightning-rfc/blob/master/07-routing-gossip.md#htlc-fees}
  const variableFee = feeRate.times(amount).div(1000000).round(0, 3)

  return baseFee.plus(variableFee).toString()
}

/**
 * Construct an object with specific bandwidth for channels that we are party to
 * @param  {Array<Channel>} channels List of channels we are party to
 * @param  {String} identityPubkey   Our Public Key
 * @return {Object}                  Key value of channel IDs and available balance by source public key
 */
function getBandwidthHints (channels, identityPubkey) {
  const activeChannels = channels.filter(c => c.active)

  return activeChannels.reduce((hints, channel) => {
    hints[channel.chanId] = {
      [identityPubkey]: channel.localBalance,
      [channel.remotePubkey]: channel.remoteBalance
    }
    return hints
  }, {})
}

// naive path finding - find any path that works
function findPaths (edges, hints, fromPubKey, toPubKey, symbol, amount, visited = []) {
  const candidates = findOutboundChannels(edges, hints, fromPubKey, symbol, amount, visited)

  console.log('candidates')
  console.log(candidates)

  const endOfPath = candidates.find((channel) => {
    if (channel.toPubKey === toPubKey) {
      return true
    }
  })

  // we found our target pubkey, so return
  if (endOfPath) return [ endOfPath ]

  // loop over the candidate channels to find the rest of the path
  const paths = candidates.map(candidate => {
    const localVisited = visited.slice()
    localVisited.push(candidate.channelId)

    // find the rest of the path
    console.log('findPaths', findPaths(edges, hints, candidate.toPubKey, toPubKey, symbol, amount, localVisited))
    const restOfPath = findPaths(edges, hints, candidate.toPubKey, toPubKey, symbol, amount, localVisited)

    if (restOfPath) {
      return [ candidate, ...restOfPath ]
    }

    return [ candidate ]
  }).filter(path => {
    const lastSegment = path[path.length - 1]
    return lastSegment.toPubKey === toPubKey
  })

  console.log('got paths', paths)

  // if we have anything, return it
  return paths[0]
}

/**
 * Find all channels from a given node that meet the other criteria
 * @param  {Array<LND~ChannelEdge} edges      Channel edges available in the graph
 * @param  {Object}                hints      Key value of channel bandwidth hints from `getBandwidthHints`
 * @param  {String}                fromPubKey Public key of the source node
 * @param  {String}                symbol     `BTC` or `LTC` -  symbol of the currency we're using
 * @param  {String}                amount     Int64 amount that the channel should carry
 * @param  {Array<String>}         visited    Array of channels that we have already traversed
 * @return {Array<InternalChannelEdge>}       Array of channel edges that work
 */
function findOutboundChannels (edges, hints, fromPubKey, symbol, amount, visited = []) {
  return edges.reduce((filtered, { node1Pub, node2Pub, capacity, node1Policy, node2Policy, channelId }) => {
    // don't retrace
    if (visited.includes(channelId)) {
      console.log('already saw', channelId)
      return filtered
    }

    // neither node is ours
    if (node1Pub !== fromPubKey && node2Pub !== fromPubKey) {
      console.log('doesnt match pubkey', node1Pub, node2Pub, fromPubKey)
      return filtered
    }

    // not the right symbol
    const channelSymbol = getChannelSymbol(node1Policy, node2Policy)
    if (channelSymbol !== symbol) {
      console.log('wrong symbol', channelSymbol, symbol)
      return filtered
    }

    /**
     * If we have bandwidth hints for this channel we should use them, otherwise fall back to capacity
     * @param  {Object} hints[channelId] Hints for balance on each side of this channel
     */
    if (hints[channelId]) {
      console.log('got hints for ', channelId)
      console.log(hints[channelId][fromPubKey], amount)
      if (Big(hints[channelId][fromPubKey]).lt(amount)) {
        console.log('not enough bandwidth', hints[channelId][fromPubKey], amount)
        return filtered
      }
    } else {
      // not enough capacity
      if (Big(capacity).lt(amount)) {
        console.log('not enough capacity', capacity, amount)
        return filtered
      }
    }

    const channel = {
      fromPubKey,
      capacity,
      channelId,
      toPubKey: node1Pub === fromPubKey ? node2Pub : node1Pub,
      policy: node1Pub === fromPubKey ? node2Policy : node1Policy
    }

    console.log('found an outbound path', channel)

    filtered.push(channel)

    return filtered
  }, [])
}

/**
 * Get the blockchain of the channel based on policy hints
 * @param  {LND~RoutePolicy} node1Policy Route policy of one of the nodes in the channel
 * @param  {LND~RoutePolicy} node2Policy Route policy of the other node in the channel
 * @return {String}                      `BTC` or `LTC`
 */
function getChannelSymbol (node1Policy, node2Policy) {
  console.log('node1Policy', node1Policy)
  console.log('node2Policy', node2Policy)
  if (node1Policy.feeRateMilliMsat === LTC_FEE_PER_KW && node2Policy.feeRateMilliMsat === LTC_FEE_PER_KW) {
    return 'LTC'
  } else if (node1Policy.feeRateMilliMsat === BTC_FEE_PER_KW && node2Policy.feeRateMilliMsat === BTC_FEE_PER_KW) {
    return 'BTC'
  } else {
    return ''
  }
}

module.exports = executeSwap
