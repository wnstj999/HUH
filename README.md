# LoL Inhouse Match Manager — Product Website

A minimal static website for the LoL Inhouse Match Manager project and its Riot Games
Production application. It is ready to publish with GitHub Pages and does not require a
build step.

## Files

- `index.html` — project purpose, features, workflow, and non-commercial disclosures
- `privacy.html` — Privacy Policy
- `terms.html` — Terms of Service
- `style.css` — shared responsive styling
- `riot.txt` — placeholder for Riot's domain-verification token

## Publish with GitHub Pages

1. Add these files to the root of the repository and push them to the `main` branch.
2. Open the repository on GitHub.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder, then save.
6. Wait for GitHub to show the published site URL.

For a repository named `lol-inhouse-manager`, the URL normally looks like:

```text
https://YOUR_GITHUB_USERNAME.github.io/lol-inhouse-manager/
```

Use the published homepage URL as the Riot Developer Portal **Product URL**.

## Riot verification (`riot.txt`)

The committed `riot.txt` contains a placeholder and will not pass verification yet.
When Riot provides the verification token:

1. Replace the entire contents of `riot.txt` with the exact token supplied by Riot.
2. Commit and push the change.
3. Confirm that this address displays the exact token as plain text:

```text
https://YOUR_GITHUB_USERNAME.github.io/lol-inhouse-manager/riot.txt
```

4. Complete verification in the Riot Developer Portal only after the updated file is live.

Do not add HTML, explanations, extra spaces, or quotation marks around the real token.

## Before applying

- Check every page on desktop and mobile.
- Confirm that the Privacy Policy and Terms links work in both directions.
- Replace the placeholder in `riot.txt` only when Riot supplies the token.
- Update policy dates or wording if the project's actual data practices change.

This project is not endorsed by Riot Games and does not represent an official Riot Games
product.
