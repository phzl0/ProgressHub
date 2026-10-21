# Local community demonstration

After updating and rebuilding the Docker services, create five clearly identified demonstration profiles:

```bash
sudo docker compose --env-file .env.test exec server node scripts/demo-community.js seed
```

The explicit command uses the existing MongoDB connection. It creates five synthetic profiles with local SVG avatars, season/career XP, community contributions, projects in different languages, project likes/favorites, feed posts/comments, help requests and general-chat messages. They participate in the normal rankings, as requested. Records are tagged `progress-hub-demo-v1`; running the setup again does not duplicate existing records or reset interactions. They have no OAuth credentials and do not automatically reply or accept invitations.

Remove the demonstration when finished:

```bash
sudo docker compose --env-file .env.test exec server node scripts/demo-community.js remove
```

Cleanup deletes the tagged data, demo-account records and interactions tied to demo projects/posts/accounts. Real users and their unrelated content remain intact. No database or Docker volume is dropped. The setup does not run automatically at startup or during deployment.

## Display rules

- Home shows an actual ticking clock in `America/Sao_Paulo`, independent of browser timezone. Displayed instants use Brasília time. GitHub records with only day precision keep the original contribution day; scoring windows continue to use UTC.
- The project gallery returns at most ten projects ordered by likes, favorites and a stable identifier. Language is set by the owner; searching and language filtering work on the server. A viewer has one like and one private favorite per project. Only favorite totals are public. These actions grant no XP.
- Cosmetic unlocks are preserved, but the inventory offers one basic item per category and renders the basic appearance. Collection expansion is postponed.
- Interests and onboarding are absent from the visible navigation/home. Following users and projects remains available.

## Verification

The full frontend suite passes (312 tests); the backend suite passes against isolated MongoDB 7 (112 tests, no skips). Tests cover seed retry, rankings, private reaction state, literal search, filtering, blocking and selective demo cleanup. Browser checks with a different timezone validate the Brasília clock, gallery likes/filtering, compact chat sending, one cosmetic per category and responsive home/feed/profile. No real GitHub login or real user's local database is used in these checks.
