# Security policy

## Supported versions

Only the latest release of Petty receives security fixes.

| Version        | Supported |
| -------------- | --------- |
| Latest release | Yes       |
| Older releases | No        |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report them privately through GitHub instead:

1. Go to the [Security tab](https://github.com/shanto462/Petty/security) of this repository.
2. Click **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what an attacker could do with it.

You can expect a first reply within 7 days. Once the problem is confirmed, a fix is usually released within 30 days, and you will be credited in the release notes unless you prefer otherwise.

## Scope

Petty runs a content script on every website, so these are especially interesting:

- A web page that can read, change or break Petty's state, or run code in Petty's context
- Messages to the background service worker that are not validated correctly
- Anything that makes Petty send data off the device (it should never do that)
- Supply-chain issues in the build or release process

Out of scope: problems that need a malicious extension already installed, or that only affect very old browser versions.
