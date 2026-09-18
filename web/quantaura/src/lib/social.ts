/**
 * The ecosystem's public accounts, in one place.
 *
 * Every QuantAura surface (this site, the YouTube channel, the Telegram
 * channel and bot, the X account) links to every other one, so a visitor who
 * arrives on any of them can reach the rest. The other three repos carry the
 * same list in their own config — they cannot import from here, since they are
 * separate deployments — so when a handle changes it has to change in four
 * places:
 *
 *   web/quantaura/src/lib/social.ts   (this file)
 *   quantaura-youtube/config.yaml     links:
 *   quantaura-telegram-bot/bot/config.js  links
 *   quantaura-x/config.yaml           links:
 *
 * These are public handles, not secrets — hardcoding them is deliberate. They
 * are needed at build time for JSON-LD and the footer, and an env var that is
 * unset on one deployment would silently drop the links from that surface.
 */

export const SOCIAL = {
  site: 'https://quantaura.tech',
  youtube: 'https://www.youtube.com/@quantaura_ml',
  // The account the X pipeline actually posts as, per its own credential check
  // (`python pipeline.py --check` prints the authenticated handle). It is the
  // owner's default X username, not a brand one — renaming it on X to
  // @quantaura_ml would keep the followers and post history and make it match
  // the rest of the ecosystem. If that rename happens, change it in all four
  // places listed above.
  x: 'https://x.com/abdulla05775100',
  telegramChannel: 'https://t.me/quantaura_signals',
  telegramBot: 'https://t.me/QuantAuraBot',
} as const;

/** The X handle without the URL, for twitter:site / twitter:creator meta tags. */
export const X_HANDLE = '@abdulla05775100';

/**
 * schema.org `sameAs`: the machine-readable version of "these accounts are all
 * the same brand". This is what lets Google associate the channel and the X
 * account with the site in a knowledge panel, and it is the reason the links
 * are worth having in structured data as well as in the footer.
 */
export const SAME_AS: string[] = [
  SOCIAL.youtube,
  SOCIAL.x,
  SOCIAL.telegramChannel,
];

/** Footer/nav rendering order — site first is implied, so it is not listed. */
export const SOCIAL_LINKS: { label: string; href: string; external: true }[] = [
  { label: 'YouTube', href: SOCIAL.youtube, external: true },
  { label: 'X (Twitter)', href: SOCIAL.x, external: true },
  { label: 'Telegram', href: SOCIAL.telegramChannel, external: true },
];
