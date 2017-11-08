'use strict'

const assert = require('assert')
const url = require('url')
const fetch = require('node-fetch')
const Koa = require('koa')
const Router = require('koa-router')
const getRawBody = require('raw-body')
const Debug = require('debug')
const Macaroon = require('macaroon')

const BODY_SIZE_LIMIT = '1mb'
const MACAROON_EXPIRY_TIME = 2000

async function send ({ connector, transfer, streamData = false }) {
  // TODO recognize if connector has a macaroon in the URL and caveat it (for a short expiry) if so
  const debug = Debug('ilp3:send')
  if (streamData) {
    debug('sending transfer:', Object.assign({}, transfer, { data: '[Stream]' }))
  } else {
    debug('sending transfer:', Object.assign({}, transfer, { data: transfer.data.toString('base64') }))
  }
  const headers = Object.assign({
    'ILP-Amount': transfer.amount,
    'ILP-Expiry': transfer.expiry,
    'ILP-Condition': transfer.condition,
    'ILP-Destination': transfer.destination,
    'User-Agent': '',
    'Content-Type': 'application/octet-stream'
  }, transfer.additionalHeaders || {})

  // Parse authentication from URI
  const parsedUri = new url.URL(connector)
  const auth = (parsedUri.password ? parsedUri.username + ':' + parsedUri.password : parsedUri.username)
  const authToken = addTimeLimitIfMacaroon(auth, Date.now() + MACAROON_EXPIRY_TIME)
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  const uri = url.format(parsedUri, { auth: false })

  let response
  try {
    response = await fetch(uri, {
      method: 'POST',
      headers,
      body: transfer.data,
      compress: false
    })
  } catch (err) {
    debug('error sending transfer', err)
    throw err
  }
  if (!response.ok) {
    throw new Error(`Error sending transfer: ${response.status} ${response.statusText}`)
  }

  const fulfillment = response.headers.get('ilp-fulfillment')
  const contentType = response.headers.get('content-type')
  const data = (streamData ? response.body : await response.buffer())
  if (streamData) {
    debug(`got fulfillment: ${fulfillment} and data: [Stream]`)
  } else {
    debug(`got fulfillment: ${fulfillment} and data:`, data.toString('base64'))
  }
  return {
    fulfillment,
    data
  }
}

function addTimeLimitIfMacaroon (token, expiry) {
  const debug = Debug('ilp3-send:macaroon')
  let macaroon
  try {
    macaroon = Macaroon.importMacaroon(token)
    const expiryTimestamp = new Date(expiry).toISOString()
    macaroon.addFirstPartyCaveat(`time < ${expiryTimestamp}`)
    debug('added caveat to macaroon so it expires at:', expiryTimestamp)
    return Buffer.from(macaroon.exportBinary()).toString('base64')
  } catch (err) {
    debug('token is not a macaroon, using plain token')
    // token is not a macaroon
    return token
  }
}

// TODO should this be part of ILP3 or an extension?
function macaroonVerifier ({ secret }) {
  const debug = Debug('ilp3-macaroon:verifier')
  assert(secret, 'secret is required')
  assert(Buffer.from(secret, 'base64').length >= 32, 'secret must be at least 32 bytes')
  return async (ctx, next) => {
    try {
      const encoded = ctx.request.headers.authorization.replace(/^bearer /i, '')
      debug('got macaroon', encoded)
      const macaroon = Macaroon.importMacaroon(encoded)
      const account = Buffer.from(macaroon.identifier).toString('utf8')
      debug('macaroon is for account:', account)
      macaroon.verify(secret, (caveat) => {
        if (caveat.startsWith('time < ')) {
          const expiry = Date.parse(caveat.replace('time < ', ''))
          if (Date.now() >= expiry) {
            throw new Error('macaroon is expired')
          }
        } else {
          throw new Error('unsupported caveat')
        }
      })
      debug('macaroon passed validation')
      ctx.state.account = account
    } catch (err) {
      debug('invalid macaroon', err)
      return ctx.throw(401, 'invalid macaroon')
    }
    return next()
  }
}

function receiverMiddleware ({ streamData = false }) {
  return async (ctx, next) => {
    const debug = Debug('ilp3:receiver')
    const transfer = await getTransferFromRequest(ctx, streamData)
    if (streamData) {
      debug('got transfer:', Object.assign({}, transfer, { data: '[Stream]' }))
    } else {
      debug('got transfer:', Object.assign({}, transfer, { data: transfer.data.toString('base64') }))
    }
    // TODO validate transfer details
    ctx.state.transfer = transfer

    await next()

    if (ctx.state.fulfillment) {
      debug('responding to sender with fulfillment')
      ctx.status = 200
      ctx.set('ILP-Fulfillment', ctx.state.fulfillment)
      ctx.body = ctx.state.data
    }
  }
}

function createReceiver (opts) {
  if (!opts) {
    opts = {}
  }
  const path = opts.path || '*'
  const streamData = opts.streamData || false
  const receiver = new Koa()
  const router = new Router()
  router.post(path, macaroonVerifier({ secret: opts.secret }))
  router.post(path, receiverMiddleware({ streamData }))
  receiver.use(router.routes())
  receiver.use(router.allowedMethods())
  return receiver
}


async function getTransferFromRequest (ctx, streamData) {
  const data = (streamData ? ctx.req : await getRawBody(ctx.req, {
    limit: BODY_SIZE_LIMIT
  }))
  return {
    amount: ctx.request.headers['ilp-amount'],
    expiry: ctx.request.headers['ilp-expiry'],
    condition: ctx.request.headers['ilp-condition'],
    destination: ctx.request.headers['ilp-destination'],
    data
  }
}

exports.send = send
exports.createReceiver = createReceiver
