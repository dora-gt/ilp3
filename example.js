'use strict'

const ILP3 = require('.')
const crypto = require('crypto')
const Macaroon = require('macaroon')

const receiverSecret = crypto.randomBytes(32)
const receiver = new ILP3()
  .use(ILP3.macaroons.authenticator({ secret: receiverSecret }))
  .use(ILP3.http.parser())
  .use(ILP3.PSK.receiver({ secret: receiverSecret }))
  .use(async (ctx) => {
    console.log(`receiver got payment for ${ctx.transfer.amount}`)
    if (ctx.fulfillment) {
      ctx.data = 'thanks for the money!'
    }
  })
receiver.listen(4000)

const connectorMacaroon = Macaroon.newMacaroon({
  identifier: 'test.receiver',
  rootKey: receiverSecret
})
const encodedConnectorMacaroon = base64url(connectorMacaroon.exportBinary())
const connectorSecret = crypto.randomBytes(32)
const balanceTracker = ILP3.balance.inMemoryTracker()
const routes = {
  'test.sender': {
    currency: 'EUR',
    scale: 6
  },
  'test.sender2': {
    currency: 'EUR',
    scale: 6
  },
  'test.receiver': {
    uri: `http://${encodedConnectorMacaroon}@localhost:4000`,
    currency: 'USD',
    scale: 4
  }
}
const connector = new ILP3()
  .use(ILP3.macaroons.authenticator({ secret: connectorSecret }))
  .use(ILP3.http.parser({ streamData: true }))
  .use(balanceTracker.incoming())
  .use(ILP3.connector.simple({
    routes,
    secret: connectorSecret
  }))
  .use(balanceTracker.outgoing())
  .use(ILP3.macaroons.timeLimiter())
  .use(ILP3.fulfillments.validator())
  .use(ILP3.http.client({
    streamData: true,
    routes
  }))
connector.listen(3000)

const senderMacaroon = Macaroon.newMacaroon({
  identifier: 'test.sender',
  rootKey: connectorSecret
})
senderMacaroon.addFirstPartyCaveat('minBalance -1000000')
const encodedSenderMacaroon = base64url(senderMacaroon.exportBinary())
const sender = new ILP3.PSK.Sender()
  .use(ILP3.macaroons.timeLimiter())
  .use(ILP3.fulfillments.validator())
  .use(ILP3.http.client())

async function main () {
  const start = Date.now()
   //Get a quote first
  const quote = await sender.quote({
    connector: `http://${encodedSenderMacaroon}@localhost:3000`,
    sharedSecret: receiverSecret,
    destination: 'test.receiver',
    sourceAmount: 1000,
  })
  console.log(`got end-to-end quote. source amount 1000 is equal to ${quote.destinationAmount} on test.receiver`)

  const result = await sender.send({
    connector: `http://${encodedSenderMacaroon}@localhost:3000`,
    sharedSecret: receiverSecret,
    destination: 'test.receiver',
    sourceAmount: '1000',
  })
  console.log(`sender sent 1000, receiver received ${result.destinationAmount}`)

  const result2 = await sender.deliver({
    connector: `http://${encodedSenderMacaroon}@localhost:3000`,
    sharedSecret: receiverSecret,
    destination: 'test.receiver',
    destinationAmount: '500',
  })
  console.log(`sender delivered ${result2.destinationAmount} by sending ${result2.sourceAmount}`)
}

main().catch((err) => console.log(err))

function base64url (buffer) {
  return Buffer.from(buffer, 'base64')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

