import {newVerifier} from '@/lib/domainverifier/verifier';
import {IDidConfigurationResource, ValidationStatusEnum,} from '@sphereon/wellknown-dids-client';
import {IDomainLinkageCredential} from '@sphereon/wellknown-dids-client/dist/types';
import {verifyResourceStructure} from '@sphereon/wellknown-dids-client/dist/utils';
import level from 'level';
//levelgraph needs level 7.0.0, 8.0 breaks which is a shame because 8.0 actually has types
import levelgraph from 'levelgraph';
import {promisifyLevelGraph} from '@/lib/levelgraph';
import {
  AssertionSetTriple,
  JsonSchema,
  toTopics,
  toTriples,
  toUniqueTopics,
  TrustEstablishmentDoc,
} from '@/lib/trustestablishment/trustEstablishment';
import {drawIcon as jdenticonDrawIcon} from 'jdenticon';

const db = level('trustgraph');
const graph = promisifyLevelGraph(levelgraph(db));

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
  const verifier = await newVerifier()
  const result = await verifier.verifyResource({
    configuration: didConfiguration,
  });

  console.log(result.credentials)
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

  //todo: set icon
  if (!originState.did) {
    return {
      origin: originState.origin,
      didProfile: undefined,
    };
  }

  const triples = await graph.get<AssertionSetTriple>({
    subject: originState.did,
  });
  //this has dupes in it.. i think its fine
  const topics = triples.flatMap((triple) => triple.predicate);
  //because this should dedupe for us
  //ugly cast here
  const schemas: Record<string, JsonSchema> =
    await chrome.storage.local.get(topics);

  return {
    origin: originState.origin,
    didProfile: {
      did: originState.did,
      assertions: triples,
      schemas,
    },
  };
}
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

async function saveOrigin(tabId: number, url: string): Promise<LinkedIdentifier> {
  const { origin } = new URL(url);
  //todo: check for cached origin
  const domainDidResult = await getVerifiedDomainDid(origin);
  console.log(domainDidResult)
  //put in local storage
  if (domainDidResult.status === 'failure') {
    const previousIdentifier = await getLinkedIdentifierByOrigin(origin)
    const newIdentifier: LinkedIdentifier = {
        origin: origin,
        did: undefined,
      }
    if(previousIdentifier) {
      await chrome.storage.local.set({
        [origin]: newIdentifier,
      });
    }
    if(previousIdentifier?.did) {
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

  const canvas = new OffscreenCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    console.log('set icon')
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

  return identifier
}

chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  //todo: reference count origins and delete unused ones
  //basically we're having to deal with how to do cache invalidation for origins
  //my plan is just to reuse cached origins untill no tabs are using that origin and then unload it
  if (changeInfo.status == 'complete' && tab.active) {
    if(!tab.url || tab.url.startsWith('chrome://')) {
      chrome.action.setIcon({
        tabId: tabId,
        path: 'icon-32.png',
      });
      return
    }

    console.log(tab.url)
    await saveOrigin(tabId, tab.url)
  }

  //this should send an originActivated event when the currently active tab loads a new origin
  // if (tab.active && tab.status === 'complete' && tab.url) {
  //   const { origin } = new URL(tab.url);
  //
  //   chrome.storage.local.get(origin).then(async (state) => {
  //     const originState: LinkedIdentifier = state[origin];
  //     //todo: set icon
  //     if (!originState.did) {
  //       await chrome.runtime.sendMessage({
  //         type: 'originActivated',
  //         payload: {
  //           origin: originState.origin,
  //           didProfile: undefined,
  //         },
  //       } satisfies OriginActivated);
  //       return;
  //     }
  //
  //     const triples = await graph.get<AssertionSetTriple>({
  //       subject: originState.did,
  //     });
  //     //this has dupes in it.. i think its fine
  //     const topics = triples.flatMap((triple) => triple.predicate);
  //     //because this should dedupe for us
  //     //ugly cast here
  //     const schemas: Record<string, JsonSchema> =
  //       await chrome.storage.local.get(topics);
  //
  //     await chrome.runtime.sendMessage({
  //       type: 'originActivated',
  //       payload: {
  //         origin: originState.origin,
  //         didProfile: {
  //           did: originState.did,
  //           assertions: triples,
  //           schemas,
  //         },
  //       },
  //     } satisfies OriginActivated);
  //   });
  // }
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
          const origin = typedMessage.payload.identifier.origin
          const tabId = typedMessage.payload.tabId
          getLinkedIdentifierByOrigin(
            typedMessage.payload.identifier.origin,
          ).then(async (linkedIdentifier) => {
            const identifier = linkedIdentifier ?? (tabId ? await saveOrigin(tabId, origin) : undefined)

            if (!identifier ) {
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

        const result = await chrome.scripting.executeScript({
          target : {tabId : activeTab.id},
          func : jsonLinks,
        });

        const links = result[0].result

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
