# Privacy Policy

_Last updated: October 2026_

A11y X-Ray does not collect, store, sell or send any personal data.

## What the extension does

- It runs **only on the tab you are looking at, and only when you click its icon** (the `activeTab` permission). It cannot read other tabs or run in the background.
- Simulations and audits happen entirely inside your browser. Nothing on the page is sent anywhere.
- It has no server, no analytics, no ads and no third-party code.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Access the current tab after you click the icon |
| `scripting` | Inject the simulation and audit scripts into that tab |
| `storage` | Remember your last-used tab and the latest audit for that page |

## Stored data

- The last audit result for a tab is kept in `chrome.storage.session`, which Chrome clears when you close the browser.
- Your last-opened popup tab (Simulate or Audit) is kept in `chrome.storage.local`.

Neither leaves your device. Removing the extension deletes both.

## Screen reader voice

"Read aloud" uses your browser's built-in speech engine (`speechSynthesis`). Depending on your system and the voice selected, your operating system or browser may process that speech; A11y X-Ray itself never sends text anywhere.

## Contact

Questions? Open an issue at https://github.com/mudit2308/a11y-xray/issues.
