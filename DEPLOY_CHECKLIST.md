# Deploy Checklist

Use this before every production deploy.

## One command

Run this command from the project root:

npm run deploy:ready

What it does:
- Runs backend tests.
- Rebuilds Tailwind CSS.
- Rebuilds the static deployment bundle in dist.

## Publish target

Set your hosting platform publish directory to:

dist

## Required deploy content

Confirm these exist in the dist output after running the command:
- dist/html/index.html
- dist/css/tailwind.generated.css
- dist/css/style.css
- dist/js/main.js
- dist/js/vendor/lucide.min.js

## Post-deploy smoke checks

Open these URLs and verify there are no missing CSS/JS errors:
- https://jennibee.art/
- https://jennibee.art/html/shop.html
- https://jennibee.art/html/blog.html
- https://jennibee.art/html/checkout.html

## Quick rollback path

If styling/scripts fail in production:
1. Re-run npm run deploy:ready locally.
2. Re-deploy dist as the publish directory.
3. Hard refresh browser cache and retest.
