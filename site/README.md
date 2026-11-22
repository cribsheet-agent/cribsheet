# Site

Static files for [cribsheet.pro](https://cribsheet.pro), served by a Cloudflare Worker with static assets (no server code yet).

```
npx wrangler deploy
```

`wrangler.jsonc` attaches the custom domains `cribsheet.pro` and `www.cribsheet.pro`. The hero uses three.js 0.160 from jsDelivr; if WebGL or the CDN fails, a 2D canvas fallback draws the same four shards.
