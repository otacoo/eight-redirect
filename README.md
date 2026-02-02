# <img width="48" height="48" alt="48" src="https://github.com/user-attachments/assets/31977e95-8b13-4fe2-bfdc-961d0fc7f9cf" /> Eight Redirect

A small Chrome and Firefox extension that redirects to a backup domain when the original doesn't respond within a set time.\
Has options to backup localStorage when a redirect happens and to restore from backup manually.

## Features

- **Grace Period**: If a domain doesn't respond within X seconds, the extension checks it; if there's no response, redirects to the paired domain.
- **Domain Pairs**: Add pairs of domains (e.g. `example.org` ↔ `example.com`). Path is preserved. No redirect loop.
- **LocalStorage Backup**: When a redirect happens (e.g. site.com down → site.org), the extension can save a backup of the target page’s localStorage. 
- **Restore from Backup**: applies the backup on the next visit to either domain (manual button).

#### Options
![Screenshot](https://github.com/user-attachments/assets/b56806fe-2fe6-4c6f-b20d-287379ada581)

#### Toolbar Icon
![icon](https://github.com/user-attachments/assets/a669e192-f225-4362-88ae-cf6307deb36b)



## Installation

### Chrome

1. Download `eight-redirect.crx` from [Releases](https://github.com/otacoo/eight-redirect/releases/latest)
2. Drag & drop the zip into the Extensions page to install

Alternatively,

2. Download `eight-redirect-chrome.zip`, unzip and press `Load unpacked` then browse to the unzipped folder

### Firefox

1. Download the signed `eight-redirect.xpi` from [Releases](https://github.com/otacoo/eight-redirect/releases/latest)
2. Go into Firefox's Addons page
3. Drag & drop the `.xpi` file to install

## Privacy Concerns

The extension does not send ANY data to any third party or to the developer. Please check each file individually.

Here's what each part does:

- **Background script** (`background.js`): The background service worker. Listens only to main-frame navigations (top-level page loads). It compares the URL host you're navigating to your saved domains to see if it matches. If there's a match, it starts a short grace timer of X seconds; after that, it may open the extension's check page. No URLs or settings are sent anywhere.

- **Check page** (`check.js`, `check.html`): A simple HTML page that says "Checking availability...". Runs inside the extension. It receives the original and backup URLs from the background script (via the page's query string). It makes a single **HEAD** request from your browser to the **original** URL (the site you're trying to reach) to see if it responds. No request is made to any other server. Then it redirects you to the original or backup URL depending on availability.

- **Content script** (`content.js`): Handles the localStorage functionality. Runs only on pages whose host matches one of your domain pairs. It can read and write that page's **localStorage** and read/write the extension's **local storage** (for backup/restore). All of that stays on your device in `browser.storage.local`; nothing is sent over the network. It also removes the `_eight_redirect` query parameter from the address bar after a redirect (this is to avoid redirect loops).

- **Options / popup**: (`options.js`, `popup.html`, `popup.js`) The javascript and HTML to create the options menu, icon menu and associated functionality. Only reads and writes your settings (domain pairs, backup preferences) in local storage. No analytics or telemetry.

- **Scripts folder**: These are the npm files used to build the extension.

**Summary:** Your domains and any localStorage you backup **are stored only in your browser**. The only network request the extension makes is the HEAD check to the site you're visiting, to decide whether to redirect. You can verify this by reviewing the source in the repo.

## Packaging

Requires `npm`.

```bash
npm install # install node packages
npm run pack # build extension
```

- **`npm run pack:firefox`** – only Firefox (dist/firefox, dist/signed-xpi folder, firefox zip)
- **`npm run pack:chrome`** – only Chrome (dist/chrome, chrome zip, .crx)
