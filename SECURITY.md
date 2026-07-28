# Security Policy

This policy governs the reporting and handling of security vulnerabilities in
`@togenar/embed`, the official Togenar embed component.

**Effective date:** 29 July 2026 · **Applies to:** `@togenar/embed` (all published releases)

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Actively supported |
| < 1.0 | No longer supported |

Only the latest published minor line receives security fixes. Upgrade before reporting an
issue against an older release.

## Reporting a vulnerability

Security reports must not be filed as public issues, pull requests, or discussions.

1. **Preferred:** [Report a vulnerability privately](https://github.com/Togenar/togenar-embed/security/advisories/new)
   through GitHub Security Advisories. The report stays private until a fix is published.
2. **Alternative:** email `support@togenar.com` with the subject line `SECURITY: @togenar/embed`.

Please include the affected version, a description of the impact, and the minimal steps or
proof of concept required to reproduce the issue.

## Response commitment

| Stage | Target |
| --- | --- |
| Acknowledgement of report | 2 business days |
| Initial assessment and severity | 5 business days |
| Fix released for a confirmed critical issue | 14 days |

Reporters are credited in the published advisory unless they request otherwise.

## Scope

In scope:

- The published package `@togenar/embed` and the `<togenar-embed>` custom element
- The embed's origin handling, message passing, and attribute parsing
- The distributed runtime at `model.togenar.com/embed/togenar-embed.js`

Out of scope:

- Findings that require a modified or self-hosted build of the package
- Vulnerabilities in the integrating storefront rather than in the embed
- Automated scanner output submitted without a demonstrated impact
- Denial of service through volumetric traffic

## Supply chain

Every release is published from the public repository
[`Togenar/togenar-embed`](https://github.com/Togenar/togenar-embed) via GitHub Actions using
npm Trusted Publishing (OIDC). No long-lived publish token exists. Each tarball carries an
npm provenance attestation binding it to the exact commit and workflow that produced it:

```bash
npm audit signatures
```

The package ships with zero runtime dependencies and no install scripts.

## Coordinated disclosure

Togenar requests that reporters withhold public disclosure for 90 days, or until a fix is
released, whichever occurs first. Reporters are kept informed throughout the process.
Togenar will not pursue legal action against researchers who act in good faith under this
policy.
