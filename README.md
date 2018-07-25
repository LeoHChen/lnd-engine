# SparkSwap LND Engine

<img src="https://kines.is/logo.png" alt="SparkSwap" width="550">

[![CircleCI](https://circleci.com/gh/sparkswap/lnd-engine.svg?style=svg&circle-token=47c81b3a717f062885f159dfded078e134413db1)](https://circleci.com/gh/sparkswap/lnd-engine)

The following repo contains 2 modules that make up a SparkSwap Payment Channel Network Engine:

1. NPM module w/ LND abstraction layer (located in `src`)
2. Dockerfiles for all containers needed for the LND Engine to run on a broker daemon

A current docker setup a functional BTC/LTC LND Engine:
1. BTCD node
2. LND BTCD node (SparkSwap fork)
3. LTCD node
4. LND LTCD node (SparkSwap fork)

#### Installation (lnd-engine only)

The following commands will install dependencies and import associated proto files for
the lnd-engine codebase.

```
npm run build
```

You can then use `npm run build-images` to build all docker containers.

To run tests, use `npm run test`

#### Installation w/ Docker

The lnd-engine docker files make use of Docker's internal image storage (to replicate the functionality of docker hub locally). Run the `npm run build-images` command to
update all docker images on your local docker installation.

#### Using the docker files in your personal project

After you have built all images on your local system, you can use the provided `docker-compose.btc.example.yml` or
`docker-compose.ltc.example.yml` files as a reference for docker setup in your own project.

#### Library Usage

```
const LndEngine = require('lnd-engine')

const engineOptions = {
  logger: ...,
  tlsCertPath: /absolute/path/to/tls/cert, // required
  macaroonPath: /absolute/path/to/macaroon, // required
}

const engine = new LndEngine('0.0.0.0:10009', 'BTC', engineOptions)

engine.getTotalBalance.... etc
```

# API

Documentation is up-to-date as of 119fcabe94d286c88a144d9c3de1f78e85fc64ed

**NOTE:** Please see detailed documentation at [sparkswap.com/docs/engines/lnd](https://sparkswap.com/docs/engines/lnd)

### Healthcheck

```
isAvailable
validateNodeConfig
```

### Addresses

```
createNewAddress
getPaymentChannelNetworkAddress
getPublicKey
```

### Invoices

```
createInvoice
createRefundInvoice
getInvoiceValue
getInvoices
isInvoicePaid
payInvoice
```

### Cross-Chain Atomic Swaps

```
createSwapHash
executeSwap
getSettledSwapPreimage
prepareSwap
translateSwap
```

### Balances

```
getConfirmedBalance
getTotalBalance
getTotalChannelBalance
getUnconfirmedBalance
isBalanceSufficient
```

### Channels

```
createChannel
numChannelsForAddress
```
