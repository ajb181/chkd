# Payback App Research

## Concept

**Payback** - A P2P payment app for New Zealand using Open Banking standards. Pay anyone instantly using just their phone number.

---

## Market Context

### NZ Open Banking Status (as of Jan 2025)

- **Regulations effective**: 1 December 2025
- **Big 4 banks** (ANZ, ASB, BNZ, Westpac): Must support v2.3 Payment Initiation by 30 May 2025
- **Kiwibank**: v2.3 support by May 2026
- **Current adoption**: 100,000+ unique customers, 180,000+ payments (Oct 2024)
- **Ecosystem**: 7 API Providers, 27 Third Parties, 500+ Community Contributors

### Standards

- Based on UK OBIE (Open Banking Implementation Entity) standards
- RESTful API design
- v2.3.3 current version:
  - Account Information API
  - Payment Initiation API
  - API Security

### Key Constraints

- NZ currency only
- Bulk electronic clearing system
- Single customer authorisation
- Banks can set payment limits (min = online banking limit)
- **Pricing concern**: Commerce Commission notes high, non-transparent bank pricing limiting adoption

---

## Reference: Australia's PayID/Osko

Australia solved this problem in 2018 with NPP (New Payments Platform):

| Feature | Australia (PayID/Osko) | NZ Open Banking |
|---------|------------------------|-----------------|
| Speed | Real-time, 24/7 | Near real-time |
| Identifier | Phone, email, ABN | TBD (phone possible?) |
| Cost to user | Free | TBD |
| Message length | 280 chars + emoji | TBD |
| Launched | 2018 | 2025 |

**Key learnings from PayID:**
- Phone number as primary identifier is compelling UX
- Name confirmation before payment prevents errors
- One phone = one account mapping keeps it simple
- Free for consumers drove adoption

---

## Payback App Vision

### Core Value Proposition

> "Pay anyone in NZ with just their phone number. Instant. Free."

### User Flow (Happy Path)

```
1. Open Payback
2. Enter phone number (or select from contacts)
3. See recipient name (confirmation)
4. Enter amount + optional message
5. Authenticate (FaceID/fingerprint)
6. Done - instant transfer
```

### Key Features (MVP)

1. **Phone-to-phone payments** - Core feature
2. **Contact integration** - Pay from your phone book
3. **Request money** - Send payment requests via SMS/notification
4. **Transaction history** - Recent payments, search
5. **Bank account linking** - Connect via Open Banking

### Technical Architecture (Loose Thinking)

```
┌─────────────────────────────────────────────────────────┐
│                    Payback App                          │
│                  (React Native)                         │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                  Payback Backend                        │
│  - User registry (phone → account mapping)              │
│  - Payment orchestration                                │
│  - Push notifications                                   │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│            Open Banking Gateway                         │
│  - Bank connections (ANZ, ASB, BNZ, Westpac)           │
│  - Payment initiation                                   │
│  - Account verification                                 │
└─────────────────────────────────────────────────────────┘
```

### Open Questions

1. **Phone number registry**: How to map phone → bank account?
   - User registers in-app?
   - Central registry like PayID?
   - Partnership with banks needed?

2. **Identity verification**: KYC requirements for payment app?
   - AML/CFT compliance
   - RealMe integration?

3. **Revenue model**: If free for users, how to monetise?
   - Business payments?
   - Premium features?
   - Transaction volume deals with banks?

4. **Multi-bank support**: User has accounts at multiple banks?
   - Default account selection
   - Account switching

5. **Security**:
   - Device binding
   - Transaction limits
   - Fraud detection

6. **Offline/failed payments**:
   - Retry logic
   - Notification on completion

---

## Competitive Landscape (NZ)

| App | Status | Notes |
|-----|--------|-------|
| Bank apps | Live | No cross-bank phone payments |
| POLi | Live | Redirect to bank, not real-time |
| Wise | Live | International focus |
| Apple Pay | Live | Card payments, not bank-to-bank |

**Gap**: No NZ-native, phone-number-based instant payment app exists yet.

---

## Regulatory Considerations

- **RBNZ**: Payment system oversight
- **FMA**: If holding funds, may need licensing
- **Commerce Commission**: Consumer protection
- **Privacy Act**: Phone number + financial data handling

---

## MVP Scope Suggestion

**Phase 1: Proof of Concept**
- Single bank integration (pick one)
- Phone number registration
- Basic send/receive
- Manual KYC

**Phase 2: Multi-bank**
- Add remaining big 4
- Automated verification
- Transaction history

**Phase 3: Growth**
- Request money
- Groups/splitting
- Business accounts

---

## Next Steps

1. [ ] Validate Open Banking API access (developer sandbox?)
2. [ ] Research KYC/AML requirements for payment apps
3. [ ] Sketch app wireframes
4. [ ] Define data model (users, accounts, transactions)
5. [ ] Create epic with detailed stories

---

## Sources

- [API Centre - Payments NZ](https://www.apicentre.paymentsnz.co.nz/)
- [NZ Open Banking Implementation Plan](https://www.apicentre.paymentsnz.co.nz/standards/implementation/)
- [MBIE Open Banking Policy](https://www.mbie.govt.nz/business-and-employment/business/consumer-data-right/consumer-data-right-policy-design/open-banking)
- [Commerce Commission Open Banking Update (Dec 2024)](https://www.comcom.govt.nz/__data/assets/pdf_file/0025/363652/Retail-Payment-System-Update-on-open-banking-progress-10-December-2024.pdf)
- [CommBank PayID](https://www.commbank.com.au/digital-banking/pay-id.html)
- [Osko by AusPayPlus](https://www.auspayplus.com.au/solutions/osko)
