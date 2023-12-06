// W3C Verifiable Credential plugin
import { Resolver } from 'did-resolver'

import {
  IDataStore,
  IDataStoreORM,
  TAgent,
  ICredentialPlugin,
  createAgent
} from '@veramo/core';

import { DIDResolverPlugin } from '@veramo/did-resolver'
import { getResolver as webDidResolver } from 'web-did-resolver'
import { getResolver as keyDidResolver } from 'key-did-resolver';

import { CredentialPlugin } from '@veramo/credential-w3c';

//this is from https://github.com/decentralized-identity/ion-tools/blob/main/src/utils.js
//hmm yes very decentralised
export async function resolve(didUri: string) {
  const nodeEndpoint = 'https://beta.discover.did.microsoft.com/1.0/identifiers'

  const response = await fetch(`${nodeEndpoint}/${didUri}`);

  if (response.status >= 400) {
    throw new Error(response.statusText);
  }

  return response.json();
}

//veramo is esm only, which is actually probably a good idea
//but i don't want to commit to converting this whole codebase to esm yet
//and its fairly easy to isolate veramo and deal with the dynamic imports here
//so gunno do that for now

//nice
export type VeramoAgent = TAgent<
  IDataStore & IDataStoreORM & ICredentialPlugin
>;
export const veramoAgent = async (environmentName?: string) => {
  return createAgent<
    IDataStore & IDataStoreORM & ICredentialPlugin
  >({
    plugins: [
      new DIDResolverPlugin({ resolver: new Resolver({...webDidResolver(), ...keyDidResolver(), 'ion': resolve})}),
      new CredentialPlugin(),
      //todo get CredentialIssuerLD plugin working to verify JSON-LD VCs
    ],
  });
};
