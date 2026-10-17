# Known issues

Things found during the upgrade and deliberately left alone. None blocks the deploy.

## Behaviour

1. **Date fields use UTC.** The search forms serialise the picked date with
   `toISOString().substring(0, 10)`, which is the UTC date: a search at 00:30 Berlin time
   sends the previous day. Fix by formatting the local date parts.
2. **Spotify token refresh never stores the new expiry** (`spotify/search/+page.server.ts`):
   the refreshed expiry is computed but the `spotifyTokenExpiry` cookie is not updated, so
   every request refreshes again.
3. **`/clubs` and `/promoter-home` return 500 when opened without the expected cookies**
   (no city / not logged in). They should redirect to `/` and `/login/bars`.
4. **`/bars` without the Spotify flow has no `barId`**, so creating a bar event posts to
   `/api/bars//events` (404). The dashboard assumes Spotify has been connected.
5. **Rate limiter is per process memory** and trusts `X-Forwarded-For` as sent; all
   clients without the header share the `unknown` bucket.
6. **Password reset e-mails hard-code `https://www.clubfindr.com`** instead of `ORIGIN`.

## Code health

7. **Colour classes outside the palette** (`text-gray-700`, `bg-blue-500`, … 174 uses).
   They generate no Tailwind CSS; `app.css` themes through attribute selectors on the class
   names (`[class*='bg-gray-']`, `[class*='text-']`). Replacing that with real palette
   tokens is a design refactor; until then the names must stay.
8. **`.feature-icon` colour on the home page** was never applied (the old variable held an
   RGB triplet). Left as it renders; `color: rgb(var(--rgb-secondary))` would colour it.
9. **Legacy-syntax dependencies**: `date-picker-svelte` and `lucide-svelte` are Svelte 4
   style components (excluded from forced runes mode). Fine, but they will not move to
   Svelte 6 without updates.
10. **`jsonwebtoken` on Node 26** crashes (`buffer-equal-constant-time` needs the removed
    `SlowBuffer`); Node 24 is LTS until April 2028, so this only matters for the next Node
    bump (swap to `jose` or patch the dependency).
11. **`src/routes/api/spotify/artists/+page.svelte`** is a stub page living next to an API
    endpoint; `src/stores/genres.svelte.ts` is only read by it and never written.
12. **`hooks.server.ts` logs every non-asset request** and the login endpoint logs request
    shapes; noisy in `pm2 logs`.
13. **SvelteKit 3** is still prerelease (`3.0.0-next.*`); revisit when it ships.
14. **`svelte/no-navigation-without-resolve` and `svelte/prefer-svelte-reactivity`** are
    off in `eslint.config.js` (moot with an empty base path / false positives on local
    temporaries). Re-evaluate if either assumption changes.
