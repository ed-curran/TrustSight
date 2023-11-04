import { newVerifier } from '@/lib/domainverifier/verifier';
import {
  IDidConfigurationResource,
  ValidationStatusEnum,
} from '@sphereon/wellknown-dids-client';
import { IDomainLinkageCredential } from '@sphereon/wellknown-dids-client/dist/types';
import { verifyResourceStructure } from '@sphereon/wellknown-dids-client/dist/utils';
import level from 'level';
//levelgraph needs level 7.0.0, 8.0 breaks which is a shame because 8.0 actually has types
import levelgraph from 'levelgraph';
import { promisifyLevelGraph } from '@/lib/levelgraph';
import diaatfExample from './diaatfExample.json';
import {
  AssertionSetTriple,
  JsonSchema,
  toTopics,
  toTriples,
  toUniqueTopics,
  TrustEstablishmentDoc,
} from '@/lib/trustestablishment/trustEstablishment';
import { ContentMessage, GetLinksResponse } from '@/pages/content';
import { tabs } from 'webextension-polyfill';
import { drawIcon as jdenticonDrawIcon } from 'jdenticon';

const db = level('example5');
const graph = promisifyLevelGraph(levelgraph(db));
graph.put(toTriples(diaatfExample)).then(() => console.log('put diaatf'));

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
  console.log(didConfiguration);

  const parsed = await verifyResourceStructure(didConfiguration);
  console.log(parsed);
  //i find it annoying that this doesn't extract useful information like the dids and origin for us
  //it also doesn't provide a way to verify that the origin in the linkedDids credentials matches the origin we expect.
  //Which is weird. So we have to do that ourselves.
  const result = await newVerifier().verifyResource({
    configuration: didConfiguration,
  });

  console.log(result);
  if (
    !result.credentials ||
    result.credentials.length === 0 ||
    result.credentials[0].status === ValidationStatusEnum.INVALID
  )
    return {
      status: 'failure',
      error: 'No valid domain linked credential found',
    };

  const validatedConfiguration = didConfiguration as IDidConfigurationResource;

  //todo can be multiple dids, and need to be able to parse vc-jwt
  const did = (
    validatedConfiguration.linked_dids[0] as IDomainLinkageCredential
  ).credentialSubject.id;
  const foundOrigin = (
    validatedConfiguration.linked_dids[0] as IDomainLinkageCredential
  ).credentialSubject.origin;
  if (foundOrigin !== origin)
    return {
      status: 'failure',
      error: 'No valid domain linked credential found',
    };

  return {
    status: 'success',
    did: did,
  };
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

  return {
    did: did,
    assertions: triples,
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

async function getOriginDetails(url: string): Promise<Profile> {
  const { origin } = new URL(url);

  const state = await chrome.storage.local.get(origin);
  const originState: LinkedIdentifier = state[origin];

  console.log(originState.did);
  //todo: set icon
  if (!originState.did) {
    console.log('send');
    return {
      origin: originState.origin,
      didProfile: undefined,
    };
  }
  console.log(state);
  const triples = await graph.get<AssertionSetTriple>({
    subject: originState.did,
  });
  //this has dupes in it.. i think its fine
  const topics = triples.flatMap((triple) => triple.predicate);
  //because this should dedupe for us
  //ugly cast here
  const schemas: Record<string, JsonSchema> =
    await chrome.storage.local.get(topics);
  console.log(triples);
  console.log(originState.origin);
  return {
    origin: originState.origin,
    didProfile: {
      did: originState.did,
      assertions: triples,
      schemas,
    },
  };
}
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      apiSuggestions: ['tabs', 'storage', 'scripting'],
    });
  }
});
chrome.tabs.onActivated.addListener(function (tab) {
  // chrome.runtime.sendMessage({
  //   type: 'originActivated',
  //   payload: {
  //     url: 'test',
  //     domainDid: undefined,
  //   },
  // } satisfies OriginActivated);
  // tabs.get(tab.tabId).then(async (activeTab) => {
  //   if (!activeTab.url) return;
  //
  //   const details = await getOriginDetails(activeTab.url);
  //
  //   chrome.runtime.sendMessage({
  //     type: 'originActivated',
  //     payload: details,
  //   } satisfies OriginActivated);
  // });
});

chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  console.log('ok');
  console.log(changeInfo.url);

  //todo: reference count origins and delete unused ones
  //basically we're having to deal with how to do cache invalidation for origins
  //my plan is just to reuse cached origins untill no tabs are using that origin and then unload it
  if (changeInfo.status == 'complete' && tab.active && tab.url) {
    console.log('complete yay');
    //   chrome.action.setBadgeText(
    //     {
    //       text: "cool"
    //     }
    // )

    //relative to what?
    const { hostname, origin, host } = new URL(tab.url);
    console.log({ hostname, origin, host });
    //todo: check for cached origin
    const domainDidResult = await getVerifiedDomainDid(origin);
    console.log(domainDidResult);
    //put in local storage
    if (domainDidResult.status === 'failure') {
      console.log('failure');
      console.log(domainDidResult.error);
      chrome.storage.local.set({
        [origin]: {
          origin: origin,
          did: undefined,
        } satisfies LinkedIdentifier,
      });
      return;
    }
    console.log('putting origin');
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

    console.log('drawing early 2');
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      //its fiiine
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      jdenticonDrawIcon(ctx, domainDidResult.did, 32, {
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

    //padlock has 3 states:
    //unknown - either there's not a wellknown did, there is a did but it doesn't validate, or there is a did but we don't have any assertions for it
    //known - has a did with some associated assertions (not necessarily possible in theory)
    //trusted - the user has marked this did as "trusted" either directly or by proxy through trust estabilishment
    //if don't find it display
  }

  //this should send an originActivated event when the currently active tab loads a new origin
  if (tab.active && tab.status === 'complete' && tab.url) {
    console.log('switched tabs');

    const { hostname, origin, host } = new URL(tab.url);

    chrome.storage.local.get(origin).then(async (state) => {
      const originState: LinkedIdentifier = state[origin];
      //todo: set icon
      if (!originState.did) {
        await chrome.runtime.sendMessage({
          type: 'originActivated',
          payload: {
            origin: originState.origin,
            didProfile: undefined,
          },
        } satisfies OriginActivated);
        return;
      }
      console.log(state);
      const triples = await graph.get<AssertionSetTriple>({
        subject: originState.did,
      });
      //this has dupes in it.. i think its fine
      const topics = triples.flatMap((triple) => triple.predicate);
      //because this should dedupe for us
      //ugly cast here
      const schemas: Record<string, JsonSchema> =
        await chrome.storage.local.get(topics);
      console.log(triples);
      console.log(originState.origin);
      await chrome.runtime.sendMessage({
        type: 'originActivated',
        payload: {
          origin: originState.origin,
          didProfile: {
            did: originState.did,
            assertions: triples,
            schemas,
          },
        },
      } satisfies OriginActivated);
    });
  }
});

export type DidProfile = {
  did: string;
  assertions: AssertionSetTriple[];
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
    docs: TrustEstablishmentDoc[];
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

export type BackgroundMessage =
  | GetProfile
  | GetProfileResponse
  | ImportDoc
  | ImportDocResponse
  | FindDocs
  | OriginActivated
  | ResolveSchemas
  | ClearState;

// Send tip to content script via messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const typedMessage = message as BackgroundMessage;
  switch (typedMessage.type) {
    case 'getProfile': {
      switch (typedMessage.payload.identifier.type) {
        //these could be collapsed together more but I'm kinda anticipating they'll diverge some more
        case 'origin': {
          getLinkedIdentifierByOrigin(
            typedMessage.payload.identifier.origin,
          ).then(async (linkedIdentifier) => {
            if (!linkedIdentifier) {
              sendResponse({
                type: 'profile',
                payload: undefined,
              } satisfies GetProfileResponse);
              return;
            }
            if (!linkedIdentifier.did) {
              sendResponse({
                type: 'profile',
                payload: {
                  origin: linkedIdentifier.origin,
                  didProfile: undefined,
                },
              } satisfies GetProfileResponse);
              return;
            }
            const didProfile = await getDidProfile(linkedIdentifier.did);
            sendResponse({
              type: 'profile',
              payload: {
                origin: linkedIdentifier.origin,
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
      const topics = toTopics(typedMessage.payload.doc);
      //based on the order that the ui does things we've already resolved all the schemas
      //but i'm gunno leave this just in case
      chrome.storage.local.get(topics).then(async (existingSchemas) => {
        Promise.all(
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
                schemas.flatMap((schema) =>
                  schema ? [[schema.$id, schema]] : [],
                ),
              ),
            );
            //put the doc in our graph
            graph.put(toTriples(typedMessage.payload.doc)).then(() => {
              sendResponse({
                type: 'importDocResponse',
                payload: { err: undefined },
              } satisfies ImportDocResponse);
            });
          },
          (err) => {
            console.log(err);
            //if we can't find a schema then just cancel the whole import
            //todo: could partially import and just skipping the missing topic
            sendResponse({
              type: 'importDocResponse',
              payload: { err: err.toString() },
            } satisfies ImportDocResponse);
          },
        );
      });

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

        const response: GetLinksResponse = await chrome.tabs.sendMessage(
          activeTab.id,
          { type: 'getLinks' } satisfies ContentMessage,
        );

        //todo should if check current page is a trust doc .e.g .json file
        //fetch all the .json links on the page
        const ofOrigin = response.payload.links.flatMap((link) => {
          const pageUrl = new URL(activeTabUrl);
          const linkUrl = new URL(link);

          if (linkUrl.origin !== pageUrl.origin) return [];
          return [linkUrl];
        });

        //want to ignore docs that failed to fetch
        //so we return everything in the happy path so we can use Promise.all() and filter later
        const fetchDocs: Promise<
          | { status: 'success'; doc: TrustEstablishmentDoc }
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
              doc: json as TrustEstablishmentDoc,
            } as const;
          } catch (e) {
            return {
              status: 'failure',
              error: e,
            } as const;
          }
        });

        //main i really wish typescript had a proper either type
        const docs = (await Promise.all(fetchDocs)).flatMap((maybeDoc) => {
          if (maybeDoc.status === 'success') return [maybeDoc.doc];
          console.log(maybeDoc.error);
          return [];
        });

        const schemas = await resolveTopicSchemas(toUniqueTopics(docs));

        sendResponse({
          type: 'findDocsResponse',
          payload: {
            docs: docs,
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
  }

  if (message.greeting === 'tip') {
    chrome.storage.local.get('tip').then(sendResponse);
    return true;
  }
});

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
