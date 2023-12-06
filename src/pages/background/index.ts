// @ts-ignore
import { promisify } from 'es6-promisify';
import { newVerifier } from '@/lib/domainverifier/verifier';
import {
  IDidConfigurationResource,
  IJsonWebTokenProofPayload,
  ValidationStatusEnum,
} from '@sphereon/wellknown-dids-client';
import { IDomainLinkageCredential } from '@sphereon/wellknown-dids-client/dist/types';
import {
  decodeToken,
  verifyResourceStructure,
} from '@sphereon/wellknown-dids-client/dist/utils';
import level from 'level';
//levelgraph needs level 7.0.0, 8.0 breaks which is a shame because 8.0 actually has types
import levelgraph from 'levelgraph';
import { promisifyLevelGraph } from '@/lib/levelgraph';
import {
  AssertionSetTriple,
  fetchDoc,
  JsonSchema,
  toTopics,
  toTriples,
  TrustEstablishmentDoc,
} from '@/lib/trustestablishment/trustEstablishment';
import { drawIcon as jdenticonDrawIcon } from 'jdenticon';
import { Web5 } from '@web5/api';

const db = level('trustgraph');
const graph = promisifyLevelGraph(levelgraph(db));

const ALARM_NAME = 'refresh-alarm';

//refresh docs every couple minutes
async function startAlarm() {
  const alarm = await chrome.alarms.get(ALARM_NAME);

  if (!alarm) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
  }
}

//call refresh once on init
refresh();
//schedule refresh on alarm
startAlarm();
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refresh();
  }
});

async function refresh() {
  const { web5, did } = await Web5.connect();
  const docContainers = await getDocs();

  for (const [index, container] of docContainers.entries()) {
    const doc = container.doc;

    //todo: validation and error handling
    const refreshedDoc =
      (await fetchLatestFromDwn(doc, web5)) ??
      (container.source && (await fetchLatestFromSource(container.source)));
    if (refreshedDoc) {
      //this will replace the stale doc
      //maybe we should keep the old doc around so we can track changes
      //this import does another get for docs which is wasteful
      const importResult = await importDoc(
        { doc: refreshedDoc, source: container.source },
        { doc, index },
      );
      if (importResult.err) console.log(importResult.err);
      else console.log(`refreshed doc: ${doc.id}`);
    }
  }
}

//this will try to fetch the doc from a DWN or fallback to using the source
async function fetchLatestFromSource(source: string) {
  const result = await fetchDoc(source, undefined);
  if (result.status !== 'success') return undefined;
  return result.doc;
}
async function fetchLatestFromDwn(
  doc: TrustEstablishmentDoc,
  web5: Web5,
): Promise<TrustEstablishmentDoc | undefined> {
  const result = await web5.dwn.records
    .query({
      from: doc.publisherDid ?? doc.author,
      message: {
        filter: {
          recordId: doc.id,
        },
      },
    })
    .catch(() => undefined);

  //todo: validation and error handling
  return result?.records?.[0]?.data.json();
}

export type LinkedIdentifier = {
  origin: string; //should be origin?
  did: string | undefined;
};

async function getVerifiedDomainDid(
  origin: string,
): Promise<
  { status: 'success'; did: string } | { status: 'failure'; error: string }
> {
  const didConfigurationResponse = await fetch(
    `${origin}/.well-known/did-configuration.json`,
  );
  if (!didConfigurationResponse.ok) {
    return { status: 'failure', error: 'could not find did configuration' };
  }
  //todo error handling when we get a weird did configuration
  const didConfiguration = await didConfigurationResponse.json();

  //i find it annoying that this doesn't extract useful information like the dids and origin for us
  //it also doesn't provide a way to verify that the origin in the linkedDids credentials matches the origin we expect.
  //Which is weird. So we have to do that ourselves.
  const verifier = await newVerifier();
  const result = await verifier.verifyResource({
    configuration: didConfiguration,
  });

  console.log(result.credentials);
  //we use the first valid linkage credential that we find
  const validCredentialIndex = result.credentials?.findIndex(
    (credential) => credential.status === ValidationStatusEnum.VALID,
  );
  if (validCredentialIndex === undefined || validCredentialIndex === -1) {
    return {
      status: 'failure',
      error: 'No valid domain linked credential found',
    };
  }

  //this well-known did client does not make it easy to get any useful information out after a verification
  const validatedConfiguration = didConfiguration as IDidConfigurationResource;
  const validJwtOrLdCredential =
    validatedConfiguration.linked_dids[validCredentialIndex];
  const validCredential = (
    typeof validJwtOrLdCredential === 'string'
      ? (
          decodeToken(
            validJwtOrLdCredential,
            false,
          ) as IJsonWebTokenProofPayload
        ).vc
      : validJwtOrLdCredential
  ) as IDomainLinkageCredential;

  const did = validCredential.credentialSubject.id;
  const foundOrigin = validCredential.credentialSubject.origin;
  if (foundOrigin !== origin)
    return {
      status: 'failure',
      error: `Domain linked credential did not match current origin: ${foundOrigin} vs ${origin}`,
    };

  return {
    status: 'success',
    did: did,
  };
}

export type TrustEstablishmentDocContainer = {
  source: string | undefined;
  doc: TrustEstablishmentDoc;
};

function getDocs(): Promise<TrustEstablishmentDocContainer[]> {
  return chrome.storage.local
    .get('docs')
    .then((result) => result['docs'] ?? []);
}

async function getDidProfile(did: string): Promise<DidProfile> {
  const triples = await graph.get<AssertionSetTriple>({
    subject: did,
  });
  //this has dupes in it.. i think its fine
  const topics = triples.flatMap((triple) => triple.predicate);
  //because this should dedupe for us
  //ugly cast here
  const schemas: Record<string, JsonSchema> =
    await chrome.storage.local.get(topics);

  const triplesWithOrigin = await Promise.all(
    triples.map(async (triple) => {
      //i assume theres in memory caching happening here riiight
      const identifier = await getLinkedIdentifierByDid(triple.object);
      return {
        ...triple,
        origin: identifier?.origin,
      };
    }),
  );

  return {
    did: did,
    assertions: triplesWithOrigin,
    schemas,
  };
}

//these are actually the same cus of our dumb persistence
async function getLinkedIdentifier(
  identifier: Identifier,
): Promise<LinkedIdentifier | undefined> {
  switch (identifier.type) {
    case 'origin': {
      const state = await chrome.storage.local.get(identifier.origin);
      return state[identifier.origin];
    }
    case 'did': {
      const state = await chrome.storage.local.get(identifier.did);
      return state[identifier.did];
    }
  }
}

async function getLinkedIdentifierByOrigin(
  origin: string,
): Promise<LinkedIdentifier | undefined> {
  const state = await chrome.storage.local.get(origin);
  return state[origin];
}

async function getLinkedIdentifierByDid(
  did: string,
): Promise<{ origin: string; did: string } | undefined> {
  const state = await chrome.storage.local.get(did);
  return state[did];
}

async function saveOrigin(
  tabId: number,
  url: string,
): Promise<LinkedIdentifier> {
  const { origin } = new URL(url);
  //todo: check for cached origin
  const domainDidResult = await getVerifiedDomainDid(origin);
  //put in local storage
  if (domainDidResult.status === 'failure') {
    console.log(domainDidResult);
    const previousIdentifier = await getLinkedIdentifierByOrigin(origin);
    const newIdentifier: LinkedIdentifier = {
      origin: origin,
      did: undefined,
    };
    if (previousIdentifier) {
      await chrome.storage.local.set({
        [origin]: newIdentifier,
      });
    }
    if (previousIdentifier?.did) {
      await chrome.storage.local.set({
        [previousIdentifier.did]: newIdentifier,
      });
    }
    await chrome.action.setIcon({
      tabId: tabId,
      path: 'question-mark-circled-32.png',
    });
    return newIdentifier;
  }
  //we store keyed on both origin and did
  //cus sometimes we only have one or the other
  //should probably use a better storage solution with indexes or something
  const identifier: LinkedIdentifier = {
    origin: origin,
    did: domainDidResult.did,
  };
  await chrome.storage.local.set({
    [origin]: identifier,
  });
  await chrome.storage.local.set({
    [domainDidResult.did]: identifier,
  });

  setDidIcon(tabId, domainDidResult.did);

  return identifier;
}

function setDidIcon(tabId: number, did: string) {
  const canvas = new OffscreenCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    //its fiiine
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    jdenticonDrawIcon(ctx, did, 32, {
      // backColor: '#fff',
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const imageData = ctx.getImageData(4, 4, 24, 24);
    chrome.action.setIcon({
      tabId: tabId,
      imageData: imageData,
    });
  }
}

chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  //todo: reference count origins and delete unused ones
  //basically we're having to deal with how to do cache invalidation for origins
  //my plan is just to reuse cached origins untill no tabs are using that origin and then unload it
  if (changeInfo.status == 'complete' && tab.active) {
    if (tab.url && tab.url.startsWith('http')) {
      await saveOrigin(tabId, tab.url);
    } else {
      chrome.action.setIcon({
        tabId: tabId,
        path: 'icon-32.png',
      });
    }
  }
});

export type DidProfile = {
  did: string;
  assertions: (AssertionSetTriple & { origin: string | undefined })[];
  schemas: Record<string, JsonSchema>;
};

export type Profile = {
  origin: string | undefined;
  didProfile: DidProfile | undefined;
};

export type Identifier =
  | {
      type: 'did';
      did: string;
    }
  | {
      type: 'origin';
      origin: string;
    };

export type GetProfile = {
  type: 'getProfile';
  payload: {
    identifier: Identifier;
    tabId: number | undefined;
  };
};

export type GetProfileResponse = {
  type: 'profile';
  payload: Profile | undefined;
};

export type FindDocs = {
  type: 'findDocs';
};

export type FindDocsResponse = {
  type: 'findDocsResponse';
  payload: {
    docs: TrustEstablishmentDocContainer[];
    schemas: JsonSchema[];
  };
};

export type ResolveSchemas = {
  type: 'resolveSchemas';
  payload: {
    topics: string[];
  };
};

export type ResolveSchemasResponse = {
  type: 'resolveSchemasResponse';
  payload:
    | {
        status: 'success';
        schemas: JsonSchema[];
      }
    | {
        status: 'failure';
        error: string;
      };
};

export type ImportDoc = {
  type: 'importDoc';
  payload: {
    source: string | undefined;
    doc: TrustEstablishmentDoc;
  };
};

export type ImportDocResponse = {
  type: 'importDocResponse';
  payload: {
    err: string | undefined;
  };
};

export type OriginActivated = {
  type: 'originActivated';
  //todo only send the actual origin and keep origins state in popup
  payload: Profile;
};

export type ClearState = {
  type: 'clearState';
};

export type RefreshDOcs = {
  type: 'refreshDocs';
};

export type BackgroundMessage =
  | GetProfile
  | GetProfileResponse
  | ImportDoc
  | ImportDocResponse
  | FindDocs
  | OriginActivated
  | ResolveSchemas
  | ClearState
  | RefreshDOcs;

function jsonLinks() {
  const linkElements = document.querySelectorAll('a');
  return Array.from(linkElements.values())
    .filter((element) => element.href && element.href.endsWith('.json'))
    .map((element) => element.href);
}

// Send tip to content script via messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const typedMessage = message as BackgroundMessage;
  switch (typedMessage.type) {
    case 'getProfile': {
      switch (typedMessage.payload.identifier.type) {
        //these could be collapsed together more but I'm kinda anticipating they'll diverge some more
        case 'origin': {
          const origin = typedMessage.payload.identifier.origin;
          const tabId = typedMessage.payload.tabId;
          if (!origin.startsWith('http')) {
            sendResponse({
              type: 'profile',
              payload: undefined,
            } satisfies GetProfileResponse);
          }
          getLinkedIdentifierByOrigin(
            typedMessage.payload.identifier.origin,
          ).then(async (linkedIdentifier) => {
            if (linkedIdentifier?.did && tabId) {
              setDidIcon(tabId, linkedIdentifier.did);
            }
            const identifier =
              linkedIdentifier ??
              (tabId ? await saveOrigin(tabId, origin) : undefined);

            if (!identifier) {
              sendResponse({
                type: 'profile',
                payload: undefined,
              } satisfies GetProfileResponse);
              return;
            }
            if (!identifier.did) {
              sendResponse({
                type: 'profile',
                payload: {
                  origin: identifier.origin,
                  didProfile: undefined,
                },
              } satisfies GetProfileResponse);
              return;
            }
            const didProfile = await getDidProfile(identifier.did);
            sendResponse({
              type: 'profile',
              payload: {
                origin: identifier.origin,
                didProfile,
              },
            } satisfies GetProfileResponse);
          });
          break;
        }
        case 'did': {
          const did = typedMessage.payload.identifier.did;
          getLinkedIdentifierByDid(did).then(async (linkedIdentifier) => {
            const didProfile = await getDidProfile(did);
            sendResponse({
              type: 'profile',
              payload: {
                origin: linkedIdentifier?.origin,
                didProfile,
              },
            } satisfies GetProfileResponse);
          });
          break;
        }
      }
      return true;
    }
    case 'importDoc': {
      importDoc(typedMessage.payload).then((result) =>
        sendResponse({
          type: 'importDocResponse',
          payload: result,
        } satisfies ImportDocResponse),
      );
      return true;
    }
    case 'findDocs': {
      //find trust docs available from the active tab
      //this involves searching the page for links to json files
      //fetching them and seeing if they're valid trust docs
      //there's probably a better way to do this...
      //we also try to resolve any topic schemas that the doc references
      chrome.tabs.query({ active: true }).then(async ([activeTab]) => {
        const activeTabUrl = activeTab.url;
        if (!activeTab.id || !activeTabUrl) return;

        const result = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: jsonLinks,
        });

        const links = result[0].result;

        //todo should if check current page is a trust doc .e.g .json file
        //fetch all the .json links on the page
        const ofOrigin = links.flatMap((link) => {
          const pageUrl = new URL(activeTabUrl);
          const linkUrl = new URL(link);

          if (linkUrl.origin !== pageUrl.origin) return [];
          return [linkUrl];
        });

        //want to ignore docs that failed to fetch
        //so we return everything in the happy path so we can use Promise.all() and filter later
        const fetchDocs: Promise<
          | { status: 'success'; doc: TrustEstablishmentDoc; source: string }
          | { status: 'failure'; error: unknown }
        >[] = ofOrigin.map(async (url) => {
          const result = await fetch(url);
          if (!result.ok)
            return {
              status: 'failure',
              error: result.statusText,
            } as const;

          //todo: validate its a trust doc
          try {
            const json = await result.json();
            return {
              status: 'success',
              source: url.toString(),
              doc: json as TrustEstablishmentDoc,
            } as const;
          } catch (e) {
            return {
              status: 'failure',
              error: e,
            } as const;
          }
        });

        //main i really wish typescript had a proper either or result type
        const docContainers = (await Promise.all(fetchDocs)).flatMap(
          (maybeDoc) => {
            if (maybeDoc.status === 'success')
              return [
                {
                  source: maybeDoc.source,
                  doc: maybeDoc.doc,
                },
              ];
            console.log(maybeDoc.error);
            return [];
          },
        );

        const uniqueTopics = docContainers.reduce(
          (agg, current) => {
            toTopics(current.doc).forEach((topic) => {
              if (!agg.seen.has(topic)) {
                agg.topics.push(topic);
                agg.seen.add(topic);
              }
            });

            return agg;
          },
          { topics: new Array<string>(), seen: new Set() },
        ).topics;

        const schemas = await resolveTopicSchemas(uniqueTopics);

        sendResponse({
          type: 'findDocsResponse',
          payload: {
            docs: docContainers,
            schemas: schemas,
          },
        } satisfies FindDocsResponse);
      });
      return true;
    }
    case 'resolveSchemas': {
      resolveTopicSchemas(typedMessage.payload.topics).then(
        (schemas) => {
          sendResponse({
            type: 'resolveSchemasResponse',
            payload: { status: 'success', schemas },
          } satisfies ResolveSchemasResponse);
        },
        (e) => {
          sendResponse({
            type: 'resolveSchemasResponse',
            payload: { status: 'failure', error: e.toString() },
          } satisfies ResolveSchemasResponse);
        },
      );
      return true;
    }
    case 'clearState': {
      db.clear().then(() => {
        chrome.storage.local.clear().then(() => {
          return;
        });
      });
      return false;
    }
    case 'refreshDocs': {
      refresh().then(() => {
        sendResponse({});
      });
      return true;
    }
  }

  if (message.greeting === 'tip') {
    chrome.storage.local.get('tip').then(sendResponse);
    return true;
  }
});

function compareVersion(left: string, right: string) {
  if (left === right) return 'same';
  const leftInt = parseInt(left);
  const rightInt = parseInt(right);
  if (!isNaN(leftInt) && !isNaN(rightInt)) {
    if (rightInt > leftInt) return 'higher';
    return 'lower';
  }
  //we know its different but can't figure out an order
  return 'different';
}

function isNextVersion(
  current: TrustEstablishmentDoc,
  maybeNext: TrustEstablishmentDoc,
) {}

//should be decomposed into a couple functions and not need the replace param
//replacing should probably be the default behaviour and docs should be retrievable by id
async function importDoc(
  { doc, source }: TrustEstablishmentDocContainer,
  current?: { doc: TrustEstablishmentDoc; index: number },
): Promise<{
  err: string | undefined;
}> {
  //this shouldn't be in here, should be two functions that compose
  if (current) {
    if (current.doc.id !== doc.id) {
      console.log('warn: replacing doc with different id');
    } else {
      const comparison = compareVersion(current.doc.version, doc.version);
      if (comparison === 'same')
        return {
          err: `skipping import of doc with same version: ${doc.version} = ${current.doc.version}`,
        };
      if (comparison === 'lower')
        return {
          err: `skipping import of doc with lower version: ${doc.version} < ${current.doc.version} < `,
        };
    }

    //if its different or higher then we let the overwrite happen
  }

  const topics = toTopics(doc);
  //based on the order that the ui does things we've already resolved all the schemas
  //but i'm gunno leave this just in case
  const existingSchemas = await chrome.storage.local.get(topics);

  return Promise.all(
    topics.map(async (topic) => {
      const existing: JsonSchema | undefined = existingSchemas[topic];
      if (existing) return undefined;

      const result = await fetch(topic);
      if (!result.ok) throw Error(result.statusText);

      //todo validate this is a json schema
      return result.json() as Promise<JsonSchema>;
    }),
  ).then(
    async (schemas) => {
      //save any topic schemas we haven't saved already
      //weird, should probably not use chrome storage for this
      await chrome.storage.local.set(
        Object.fromEntries(
          schemas.flatMap((schema) => (schema ? [[schema.$id, schema]] : [])),
        ),
      );
      //add doc to collection
      // todo: this should probably be deduped
      //e.g. shouldn't have two docs with same id and version
      const docs = await getDocs();
      const container = {
        source,
        doc,
      };

      if (current) {
        //delete triples for stale trust doc
        const staleTriples = toTriples(current.doc);
        await graph.del(staleTriples);
        docs[current.index] = container;
      } else {
        docs.push(container);
      }
      await chrome.storage.local.set({ docs });
      //put the doc in our graph
      await graph.put(toTriples(doc));
      return { err: undefined };
    },
    (err) => {
      console.log(err);
      //if we can't find a schema then just cancel the whole import
      //todo: could partially import and just skipping the missing topic
      return { err: err.toString() };
    },
  );
}

//lots of side effects all mixed up here :/
async function resolveTopicSchemas(topics: string[]) {
  //man i really wish typescript had a proper either type

  //i wish this was a map
  const existingSchemas = await chrome.storage.local.get(topics);
  const schemas = await Promise.all(
    topics.map(async (topic) => {
      const existing: JsonSchema | undefined = existingSchemas[topic];
      if (existing) return existing;

      const result = await fetch(topic);
      if (!result.ok) throw Error(result.statusText);

      //todo validate this is a json schema
      return result.json() as Promise<JsonSchema>;
    }),
  );

  return schemas;
}
