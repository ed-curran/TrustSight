import fetch from 'cross-fetch';

import { extendContextLoader } from 'jsonld-signatures';
import * as vc from '@digitalbazaar/vc';

export class DocumentLoader {
  getLoader() {
    return extendContextLoader(async (url: string) => {
      console.log('hmmm');
      console.log(url);
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
