# Deploy Checklist

Use this before every production deploy.

## One command

Run this command from the project root:

npm run deploy:ready

For Cloudflare Wrangler deploys (recommended):

npm run cf:deploy

What it does:
- Runs backend tests.
- Rebuilds Tailwind CSS.
- Rebuilds the static deployment bundle in dist.

`npm run cf:deploy` does this and then deploys to Cloudflare Pages via Wrangler.

## Cloudflare Pages (GitHub) settings

In Cloudflare dashboard:
- Workers & Pages > your project > Settings > Builds & deployments

Production branch:
- main (or the branch you actually deploy from)

Build configuration:
- Build command: npm run build:static
- Build output directory: dist
- Root directory: leave blank unless this repo is in a monorepo subfolder

If you deploy with Wrangler command (`npm run cf:deploy`) from local/CI, Cloudflare dashboard build command is not used for that deployment path.

Important:
- If Build output directory is set to html, css, js, or anything else, your assets can 404 and the site will look unstyled/non-responsive.
- After changing these settings, trigger a new deployment from the latest commit.

## Publish target

Preferred:
- dist

Alternative (if your host is currently configured to publish only html):
- html

Note:
- `npm run build` now syncs website assets into `html/css` and `html/js` automatically.

## Required deploy content

Confirm these exist in the dist output after running the command:
- dist/html/index.html
- dist/css/tailwind.generated.css
- dist/css/style.css
- dist/js/main.js
- dist/js/vendor/lucide.min.js

If publishing `html`, confirm these exist:
- html/css/tailwind.generated.css
- html/css/style.css
- html/js/main.js
- html/js/vendor/lucide.min.js

## Post-deploy smoke checks

Open these URLs and verify there are no missing CSS/JS errors:
- https://jennibee.art/
- https://jennibee.art/html/shop.html
- https://jennibee.art/html/blog.html
- https://jennibee.art/html/checkout.html

In browser DevTools Network tab, confirm these return 200:
- /css/tailwind.generated.css
- /css/style.css
- /js/main.js
- /js/vendor/lucide.min.js

## Quick rollback path

If styling/scripts fail in production:
1. Re-run npm run deploy:ready locally.
2. Re-deploy dist as the publish directory.
3. Hard refresh browser cache and retest.
