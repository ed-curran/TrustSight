import fetch from 'cross-fetch';

// @ts-ignore
import { extendContextLoader } from 'jsonld-signatures';
// @ts-ignore
import * as vc from '@digitalbazaar/vc';

export class DocumentLoader {
  getLoader() {
    return extendContextLoader(async (url: string) => {
      const response = await fetch(url);
      if (response.status === 200) {
        const document = await response.json();
        return {
          contextUrl: null,
          documentUrl: url,
          document,
        };
      }

      const { defaultDocumentLoader } = vc;
      return defaultDocumentLoader(url);
    });
  }
}
