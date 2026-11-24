# CLAY hackathon submission kit

## Checklist (from hackathon.lofitheyeti.com)

- [ ] Project title: **Susu Circle**
- [ ] Description (below)
- [ ] Logo, square JPG or PNG
- [x] Public GitHub repository: https://github.com/MikaelsonInitiativeOrg/susu-circle
- [ ] Demo video, 3–5 minutes, YouTube link
- [ ] Website (optional, recommended): deployed `web/`
- [x] Package ID: 0x4fecfb6741352b8b10159b2a6f0c7d5bbf714d976faa0a7d1a60809ad25614c5
- [ ] Docs (optional): link the README

Before you submit, confirm this round's deadline with the organizers (Telegram: t.me/lofitheyeti).

## Description

Susu Circle brings the susu, West Africa's rotating savings circle, to Sui. Members pay the
same amount each round and take turns collecting the whole pot. A Move contract holds the
money, uses Sui's on-chain randomness to set a fair payout order, and takes a deposit from
each member that covers anyone who misses a payment, so the person collecting is always
paid. Anyone can release the pot when the round is done, and deposits come back at the end.

## Demo video script (about 4 minutes)

**0:00–0:40 The problem.** Explain what a susu is: market traders saving together, one
person collecting each week. Then where it breaks: someone collects early and stops paying,
or the collector runs off with the money.

**0:40–1:10 The idea.** Show the home page. Same circle, but a contract holds the money,
randomness sets the order, and a deposit covers anyone who misses a round.

**1:10–2:00 Open and join.** Wallet A opens "Makola traders" with 3 seats, 0.1 SUI a round
and 5-minute rounds. Copy the invite link. Wallets B and C open it and join. Point at the
ring filling up.

**2:00–2:40 Start.** Wallet A starts the circle. Point out that the payout order was just
shuffled on-chain, so nobody picked who goes first.

**2:40–3:20 A round.** All three pay; the seats turn green. Release the pot and show the
recipient's balance go up. The ring moves to the next member.

**3:20–3:50 A missed payment.** In round 2, C doesn't pay. After the deadline, release the
pot: the recipient still gets the full amount, C's deposit drops, and C shows 1 missed round.

**3:50–4:10 Wrap up.** Show the contract on Suiscan with the package ID. Mention that the
circle works with any coin, including USDC, and what's next (Walrus, zkLogin).
