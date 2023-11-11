<p align="center">
  <img width="460" height="300" src="./trust-sight-128.png">
</p>

# TrustSight - The trust overlay for your browser.
Browse the web with confidence - guided by the voices of those that you trust.

## What is it

TrustSight is a chrome extension that empowers users to evaluate the trustworthiness of the sites they visit. 
It lets users harness their existing trust relationships to browse the web in a more safe and informed manner.
Users can import trust documents published by those that they trust, and for each website they visit, 
view any trust assertions that have been made about the site.

## How does it work
TrustSight is built on a collection of open standards designed to provide a flexible trust layer for the internet.


When you visit a site with TrustSight, 
it will look for a [DID](https://www.w3.org/TR/did-core/) associated with that site by searching for a [Well Known Did Configuration](https://identity.foundation/.well-known/resources/did-configuration/).

When you click on the TrustSight icon, it will display any trust assertions that have been made about this did from 
any [Trust Establishment Documents](https://identity.foundation/trust-establishment/) that you have imported.

It's easy to import a trust establishment document. Simply open up TrustSight, 
and in the import tab you will see any trust documents that have been published by the current site you are viewing.
Use it when a site you trust has indicated that it has trust documents available.

Additionally, it's possible to import trust establishment documents manually, by providing either a link to a document or a raw document as json. 
Probably only do this if you know what you are doing.

## Development
For development and bundling we're using https://crxjs.dev/vite-plugin

Dev

```bash
npm run dev
```

Build

```bash
npm run build
```

