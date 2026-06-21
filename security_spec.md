# Security Specification: MoonSurfers Network Firestore Security

This specification outlines the data invariants, adversarial payloads, and validation requirements for the MoonSurfers Network backend.

## 1. Data Invariants

1. **User Ownership**: A skater user profile can only be modified (created, updated, or deleted) by the authentic owner of that profile (`request.auth.uid == userId`).
2. **District Sector Readability**: Skate districts can be read by any authenticated or guest skater, but custom districts can only be created or modernized by signed-in skaters.
3. **Direct Messges Isolation**: DM communications are highly confidential. Messages can only be read/queried by the specific sender or receiver. DMs are immutable (no updates or deletions allowed).
4. **Social Clip Integrity**: Skaters can only publish clips where the `userUid` matches their authenticated UID. Comments and likes are managed atomically.
5. **No Identity Spoofing**: Users cannot spoof their verified reputation points or increase their level without verified challenges.

---

## 2. The "Dirty Dozen" Payloads (Exploit Scenarios)

The following payload attempts must be strictly blocked with `PERMISSION_DENIED` by the security rules:

1. **Self-Elevating Reputation**: Attempt to update another user's reputation points.
2. **Shadow Field Injection**: Injecting unsolicited administrative properties (e.g., `isAdmin: true` or `role: 'moderator'`) into a profile.
3. **Ghost Identity Spoofing**: Creating a profile draft using someone else's authenticated uid as the document ID.
4. **Eavesdropping on DMs**: Querying the `direct_messages` collection of other skaters.
5. **DM Spoofing**: Sending an outlaw direct message pretending to have a different `senderUid`.
6. **Vandalizing Other Skaters' Clips**: Editing or deleting a trick upload created by another user.
7. **Manipulating Likes Array Directly**: Modifying another skater's liker registration manually via a non-transaction block.
8. **Spamming Non-Existent Districts**: Injecting large junk character strings as a custom district.
9. **District Wipeout**: Attempting to delete critical global districts.
10. **Unauthenticated Writing to System Challenges**: Forging a system challenge with a custom high-XP reward.
11. **Injecting Malicious HTML/Script into Mottos**: Bypassing type/size constraints by writing excessively oversized strings into skate mottos.
12. **Bypassing Read Controls via Global List scraping**: Attempting to query the entire DM collection globally without specifying the participant ID as part of the query clauses.

---

## 3. Recommended Tests Specs

Every payload above is mapped to rejection constraints in the `firestore.rules` specification.
