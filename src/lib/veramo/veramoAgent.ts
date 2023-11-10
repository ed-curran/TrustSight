// Core identity manager plugin
import { DIDManager } from '@veramo/did-manager'

// Core key manager plugin
import { KeyManager } from '@veramo/key-manager'

// Custom key management system for RN
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'

// W3C Verifiable Credential plugin

import { Resolver } from 'did-resolver'


//we need these types to type the agent correctly, but can't import from esm
//however since we just want the types, this is fiiine
//https://github.com/microsoft/TypeScript/issues/52529

import {
  IDIDManager,
  IDataStore,
  IDataStoreORM,
  IKeyManager,
  TAgent,
  ICredentialPlugin,
  createAgent

} from '@veramo/core';

import { DIDResolverPlugin } from '@veramo/did-resolver'
import { getResolver as webDidResolver } from 'web-did-resolver'
import { getResolver as keyDidResolver } from 'key-did-resolver';

import { CredentialPlugin } from '@veramo/credential-w3c';
import { CredentialIssuerLD } from '@veramo/credential-ld';

// Storage plugin using TypeOrm
import { Entities, KeyStore, DIDStore, PrivateKeyStore, migrations } from '@veramo/data-store'

// TypeORM is installed with `@veramo/data-store`
import {DataSource, DataSourceOptions} from 'typeorm'
import {KeyDIDProvider} from '@veramo/did-provider-key'
import {WebDIDProvider} from '@veramo/did-provider-web'

// This will be the name for the local sqlite database for demo purposes
const DATABASE_FILE = 'database.sqlite';

function databaseFileName(environmentName?: string) {
  if (!environmentName) return DATABASE_FILE;
  return `${environmentName}-${DATABASE_FILE}`;
}

// This will be the secret key for the KMS
const KMS_SECRET_KEY =
  '8aae5757159d01c51c42e4db893b0d7c32862b8cdeb3dd045a60b68819313473';

//veramo is esm only, which is actually probably a good idea
//but i don't want to commit to converting this whole codebase to esm yet
//and its fairly easy to isolate veramo and deal with the dynamic imports here
//so gunno do that for now

//nice
export type VeramoAgent = TAgent<
  IDataStore & IDataStoreORM & ICredentialPlugin
>;
export const veramoAgent = async (environmentName?: string) => {

  //
  // const dbConnection = new DataSource({
  //   type: 'sqlite',
  //   database: databaseFileName(environmentName),
  //   synchronize: false,
  //   migrations: migrations,
  //   migrationsRun: true,
  //   logging: ['error', 'info', 'warn'],
  //   entities: Entities,
  //   options: {},
  //   //don't you just love it when libraries have broken types
  //   //veramos migrations aren't typed properly so have to do this
  // } as DataSourceOptions).initialize();

  return createAgent<
    IDataStore & IDataStoreORM & ICredentialPlugin
  >({
    plugins: [
      new DIDResolverPlugin({ resolver: new Resolver({...webDidResolver(), ...keyDidResolver()})}),
      new CredentialPlugin(),
      // new CredentialIssuerLD({
      //   contextMaps: [
      //     {
      //       'https://identity.foundation/.well-known/did-configuration/v1': {
      //         '@context': [
      //           {
      //             '@version': 1.1,
      //             '@protected': true,
      //             LinkedDomains:
      //               'https://identity.foundation/.well-known/resources/did-configuration/#LinkedDomains',
      //             DomainLinkageCredential:
      //               'https://identity.foundation/.well-known/resources/did-configuration/#DomainLinkageCredential',
      //             origin:
      //               'https://identity.foundation/.well-known/resources/did-configuration/#origin',
      //             linked_dids:
      //               'https://identity.foundation/.well-known/resources/did-configuration/#linked_dids',
      //           },
      //         ],
      //       },
      //     },
      //   ],
      //   suites: [],
      // }),
    ],
  });
};
