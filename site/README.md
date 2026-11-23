# Site

Static files for [cribsheet.pro](https://cribsheet.pro). They are served by the `cribsheet` Worker defined in [`../wrangler.jsonc`](../wrangler.jsonc), which also serves the public record under `/data/`. Deploy from the repository root:

```
npx wrangler deploy
```

The Worker attaches the custom domains `cribsheet.pro` and `www.cribsheet.pro`. The hero uses three.js 0.160 from jsDelivr; if WebGL or the CDN fails, a 2D canvas fallback draws the same four shards.
