# Contributing

Thanks for helping keep `ai-crawler-bots` accurate. The whole value of this repo is that every entry is sourced and current — please don't add a bot you can't link to official documentation for.

## Adding a new bot

1. Open `bots.json` and add a new object at the end, keeping the existing field order:

   ```json
   {
     "id": "your-bot-id",
     "name": "YourBot",
     "ua": "exact User-Agent string as documented by the operator",
     "owner": "Operator Name",
     "purpose": "training | search | user-agent",
     "docsUrl": "https://operator.example.com/docs/bot",
     "robotsDirective": "Allow | Disallow",
     "notes": "One or two sentences on what this bot does and why a site owner might allow or disallow it."
   }
   ```

2. **Source it.** The `docsUrl` must point to a page operated by the bot's owner (not a third-party tracker, not a blog, not this repo). If the operator only documents the bot in a help center article, link directly to that article.

3. **Don't fabricate UAs.** If you can't find the exact User-Agent string in the operator's own documentation, leave the bot out. We would rather miss a bot than ship a wrong UA.

4. **Run the tests.**

   ```bash
   npm test
   ```

   The smoke test enforces required fields, valid `purpose`/`robotsDirective` values, unique ids, unique UAs, and well-formed `docsUrl`s.

5. **Update the README table** if the bot is notable enough to surface in the top-level summary.

6. **Update `CHANGELOG.md`** under the next unreleased version with a one-line entry: `- Added <BotName> (<owner>).`

## Updating an existing bot

Operators do change UA strings (GPTBot went 1.0 → 1.1, DuckAssistBot 1.1 → 1.2). When you update an entry:

- Confirm the new value on the operator's docs page.
- Include the docs URL in your PR description so reviewers can verify quickly.
- If the change is breaking for downstream users (id rename, UA structure change), bump to a new minor version in `package.json` and note it in `CHANGELOG.md`.

## Removing a bot

Remove a bot only if the operator has formally deprecated it AND the UA has been gone from server logs for several months. If it's just deprecated, leave it in with a `notes` entry that says so — robots.txt files in the wild still reference it for years.

## Code style

- ES modules, Node 20+, no transpilers.
- No runtime dependencies. Dev dependencies only if absolutely necessary (the test runner is `node:test`).
- Keep the CLI surface small and predictable.
