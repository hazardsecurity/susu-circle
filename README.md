# Susu Circle

Rotating savings circles on Sui.

A **susu** (also called esusu, tontine or a savings club) is how millions of people across
West Africa and beyond save money without a bank. A group agrees to pay the same amount
every week or month. Each round, one member takes the whole pot. By the end, everyone has
collected once.

It works because people trust each other. It breaks when someone collects early and then
stops paying, or when the person holding the money disappears.

Susu Circle puts the circle in a Move smart contract:

- **No one holds the money.** Contributions and the pot live in the contract.
- **Fair payout order.** When the circle starts, Sui's on-chain randomness (`sui::random`)
  shuffles who collects first. The creator can't give themselves the first payout.
- **A deposit covers missed payments.** Every member locks a deposit to join. If someone
  doesn't pay by the round deadline, their deposit tops up the pot and they get a strike.
  The member collecting that round still gets paid.
- **Anyone can release the pot** once everyone has paid or the round has ended. Nobody can
  hold it up.
- **Deposits come back at the end**, minus anything used to cover missed rounds.

Built for the CLAY (Code Like a Yeti) hackathon, run by Lofi the Yeti.

## How a circle runs

1. **Open:** the creator sets a name, contribution per round, round length and number of
   seats, and locks their deposit.
2. **Join:** members lock the same deposit to take a seat. Before it starts, members can
   leave and the creator can cancel; deposits are refunded either way.
3. **Start:** the creator starts the circle once at least 2 members have joined. The payout
   order is shuffled on-chain.
4. **Pay each round:** every member pays the contribution. When all have paid, or the
   deadline passes, anyone calls `payout` and the pot goes to that round's member.
5. **Finish:** after the last round, members withdraw what's left of their deposit.

## Repository

```
move/   Move package (susu::circle) and unit tests
web/    Next.js app using @mysten/dapp-kit-react and @mysten/sui v3
```

### Contract: `move/sources/circle.move`

| Function | Who | What it does |
| --- | --- | --- |
| `create<T>` | anyone | Opens a circle and locks the creator's deposit. Shared object. |
| `join<T>` | anyone | Takes a seat by locking exactly the circle's deposit. |
| `leave<T>` | member | Leaves before the start and gets the deposit back. |
| `cancel<T>` | creator | Cancels before the start and refunds every deposit. |
| `start<T>` | creator | Shuffles the payout order with `Random` and starts round 1. |
| `contribute<T>` | member | Pays this round's contribution. |
| `payout<T>` | anyone | Settles the round: slashes non-payers, pays the recipient, moves to the next round. |
| `withdraw_deposit<T>` | member | Withdraws the remaining deposit after the last round. |

The circle is generic over the coin type, so it works with SUI, USDC or any other `Coin<T>`.
The app uses SUI on testnet so anyone can try it with faucet coins.

Every state change emits an event (`CircleCreated`, `MemberJoined`, `CircleStarted`,
`Contributed`, `Defaulted`, `PaidOut`, `CircleCompleted`, ...). The app lists circles from
`CircleCreated` events.

## Run it

You need the [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)
and Node.js 22 or later.

### 1. Test and publish the contract

```bash
cd move
sui move test
sui client switch --env testnet
sui client faucet          # if you need testnet SUI
sui client publish
```

Copy the `PackageID` from the publish output.

### 2. Run the app

```bash
cd web
cp .env.local.example .env.local   # then paste your package ID
npm install
npm run dev
```

Open http://localhost:3000. Connect a Sui wallet set to testnet (for example Slush).
`/?circle=demo` shows a sample circle without a wallet.

### 3. Deploy

Deploy `web/` to Vercel (or any host) with `NEXT_PUBLIC_SUSU_PACKAGE_ID` set.

## Testing

`sui move test` runs 17 tests covering:

- a full cycle where everyone pays, every member collects exactly once, and deposits are
  returned in full
- a missed payment slashed from the deposit, a strike recorded, and the recipient still
  paid in full; a second miss uses up the rest of the deposit
- leaving and cancelling before the start, with refunds
- every guard: wrong deposit, joining twice or when full or after the start, only the
  creator can start, paying twice, outsiders paying, early payouts and early withdrawals

## Ideas for later

- Store each circle's agreement and member notes on **Walrus**
- Let a circle choose USDC in the app (the contract already supports it)
- Reputation across circles, built from on-chain strike history
- zkLogin so members can join with a Google account, no wallet setup needed
- Reminders before each round deadline

## License

MIT
