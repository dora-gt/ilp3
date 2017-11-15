# ILPv3

**This is a prototype. Nothing is finished and everything could change.**

An implementation of the Interledger Protocol V3.

See [./example.js](./example.js) for how to use it.

## TODOs

- [x] Connector exchange rates
- [x] Connector streams data from incoming to outgoing request
- [x] Send authorization in HTTP header
- [x] Sender automatically caveats macaroon token
- [x] Unified middleware API for senders, receivers, and connectors
- [x] Connector keeps balances for multiple senders (and adjusts balance on incoming and outgoing transfers)
- [x] Connector uses ILP addresses to determine where transfers are going to / coming from
- [x] Quoting
- [x] Chunked payments
- [x] XRP payment channel claim support
- [x] Sender submits claims after receiving fulfillment
- [x] Save payment channel claims to disk
- [x] Standalone XRP payment channel claim submitter
- [ ] Connector should recognize local routes
- [ ] Auto-fund payment channel when balance is too low
- [ ] Connector dynamically adjusts users' minimum balance
- [ ] Figure out how to become a receiver (i.e. get the connector to create a channel to you)
- [ ] Auto-connect to connectors and save config (env file or db?)
- [ ] Bitcoin payment channel support
- [ ] Ethereum payment channel support (ideally including ERC 20 tokens)
- [ ] Configurable congestion avoidance algorithm for chunked payments
- [ ] Separate chunked payments from PSK
- [ ] User data on chunked payments
- [ ] Error handler that produces machine-readable error objects
- [ ] Compatibility API (that mimicks the `ilp` module for ILPv1)
- [ ] Bundle recommended set of middleware for senders, receivers, connectors
- [ ] Store balances in DB
- [ ] Data collection
