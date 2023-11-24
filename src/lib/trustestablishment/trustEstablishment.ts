import { Triple } from 'levelgraph';

export type TrustEstablishmentDoc<
  T extends Record<string, SchemaEntry<Record<string, unknown>>> = Record<
    string,
    SchemaEntry<Record<string, unknown>>
  >,
> = {
  id: string;
  title: string;
  author: string;
  //timestamp
  created: string;
  //timestamp
  validFrom: string;
  version: string;
  entries: T;
  publisherDid?: string
};



type SchemaEntry<T extends Record<string, unknown>> = Record<
  string,
  EntityEntry<T>
>;
type EntityEntry<T extends Record<string, unknown>> = T;

//we use this to keep track of all trust assertions made about a single entity
type TrustEstablishmentEntity = {
  id: string;
  //this holds all the assertions we've seen made about this subject across a variety of trust establishment docs
  //we flatten the data such that each entry is identified by a docId + schemaId, so that its easier to access the assertions
  //generally i prefer arrays over objects for this kind of dynamic data structure
  entries: {
    //if you want more information about the doc then look it up
    docId: string;
    schemaId: string; //this defines the type of the assertions record
    assertions: Record<string, unknown>;
  }[];
  //we could track the assertions that this entity has made here too
  //but i dunno if i want to keep this type scoped to entities as a subject or not yet
};

export type AssertionSetTripleWithOrigin = Triple<{
  readonly docId: string;
  readonly assertions: Record<string, unknown>;
  readonly origin: string | undefined
}>;

export type AssertionSetTriple = Triple<{
  readonly docId: string;
  readonly assertions: Record<string, unknown>;
}>;
type AssertionSetKey = {
  readonly authorId: string;
  readonly topicId: string; //this defines the type of the assertions record
  readonly subjectId: string;
};

export function tripleToString(triple: AssertionSetTriple) {
  //i dunno whats safe to use as a seperator tbh
  return keyToString({
    authorId: triple.object,
    topicId: triple.predicate,
    subjectId: triple.subject,
  });
}

function keyToString(triple: AssertionSetKey) {
  //i dunno whats safe to use as a seperator tbh
  return `${triple.authorId}::${triple.topicId}::${triple.subjectId}`;
}
type AssertionSet = {
  readonly docId: string;
  readonly schemaId: string; //this defines the type of the assertions record
  readonly subjectId: string;
  readonly assertions: Record<string, unknown>;
};

//todo better handling of different json schema versions
export type JsonSchema = {
  $id: string;
  $schema: string;
  title: string;
  type: string;
  properties: Record<string, unknown>;
};

//our triples might not be what you expect
//the obvious lossless representation would be
// {
//   subject: subjectDid
//   predicate: schemaId
//   object: docId
// }
//however this doesn't give us a graph we can crawl
//the obvious crawl friendly representation would be
// {
//   subject: subjectDid
//   predicate: assertionProperty
//   object: authorDid
//   metadata: {
//     assertionValue
//   }
// }
//however this would be very lossy because the same property name can be used across schemas and trust docs by the same author
//so we see that we need the subject to be the subjectDid and the object to be the authorDid (aka the entity the assertion)
//but we can be smart about the predicate, either we:
// 1. use the schemaId as the predicate - simple, but means we can't track how an authors opinion about a subject changes over time in the graph, when they're reusing the same schema
// 2. use a composite of the schemaId and the docId as the predicate - harder to query but solves the problem above.
// 3. equivalent to 1 or 2 but use a composite of (assertionProperty, schemaId, maybe docId) this means you get more granularity in the graph but
// in practice I think it makes it more awkward to query so don't like this option
//i'm gunno go for 1 for now, because I think our graph only needs to represent a snapshot of trust assertions at the current point in time
//we can store the source trust establishment docs separately, and in theory if we have a total order (e.g. ordering by version or timestamps) for the docs
//we can deterministically recreate a snapshot of the graph
//so our triple looks like this
// {
//   subject: subjectDid
//   object: authorDid
//   predicate: schemaId
//   metadata: {
//     docId
//     assertions
//   }
// }
//there's probably some concepts from quads or namedgraphs that would be useful here
export function toTriples(doc: TrustEstablishmentDoc) {
  return Object.entries(doc.entries).flatMap(([schemaId, schemaEntry]) =>
    Object.entries(schemaEntry).flatMap(([subjectId, subjectEntry]) => ({
      subject: subjectId,
      object: doc.author,
      predicate: schemaId,
      //level graph keeps metadata inline in the triple object
      docId: doc.id,
      assertions: subjectEntry,
    })),
  );
}

export function toTopics(doc: TrustEstablishmentDoc) {
  return Object.entries(doc.entries).map(([topicId]) => topicId);
}

export function toUniqueTopics(docs: TrustEstablishmentDoc[]) {
  return docs.reduce(
    (agg, current) => {
      toTopics(current).forEach((topic) => {
        if (!agg.seen.has(topic)) {
          agg.topics.push(topic);
          agg.seen.add(topic);
        }
      });

      return agg;
    },
    { topics: new Array<string>(), seen: new Set() },
  ).topics;
}

export type TrustDocSummary = {
  doc: TrustEstablishmentDoc;
  source: string | undefined
  topics: {
    id: string;
    title: string;
  }[];
  assertionsCount: number;
  uniqueSubjectsCount: number;
};

export function summariseDoc(
  doc: TrustEstablishmentDoc,
  topicSchemas: Map<string, JsonSchema>,
) {
  const metrics = Object.entries(doc.entries).reduce(
    (agg, [topicId, topic]) => {
      Object.entries(topic).forEach(([subjectId, assertionSet]) => {
        agg.assertionsCount++;
        if (!agg.seenSubjects.has(subjectId)) {
          agg.uniqueSubjectsCount++;
          agg.seenSubjects.add(subjectId);
        }
      });
      return agg;
    },
    {
      assertionsCount: 0,
      uniqueSubjectsCount: 0,
      seenSubjects: new Set<string>(),
    },
  );
  return {
    doc,
    uniqueSubjectsCount: metrics.uniqueSubjectsCount,
    assertionsCount: metrics.assertionsCount,
    topics: Object.entries(doc.entries).map(([topicId, topic]) => ({
      id: topicId,
      title: topicSchemas.get(topicId)?.title ?? topicId,
    })),
  };
}

//if current origin is set, the fetch will fail if the url to fetch is not using that origin
export async function fetchDoc(
  url: string,
  currentOrigin: string | undefined,
): Promise<
  | { status: 'success'; doc: TrustEstablishmentDoc }
  | { status: 'failure'; error: unknown }
> {
  const linkUrl = new URL(url);

  if (currentOrigin) {
    const originUrl = new URL(currentOrigin);
    if (linkUrl.origin !== originUrl.origin)
      return {
        status: 'failure',
        error: 'doc location does not match current origin',
      } as const;
  }

  //want to ignore docs that failed to fetch
  //so we return everything in the happy path so we can use Promise.all() and filter later
  const result = await fetch(url);
  if (!result.ok)
    return {
      status: 'failure',
      error: result.statusText !== '' ? result.statusText : "couldn't fetch",
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
}

export function parseDoc(
  docAsJsonString: string,
):
  | { status: 'success'; doc: TrustEstablishmentDoc }
  | { status: 'failure'; error: unknown } {
  return {
    status: 'success',
    doc: JSON.parse(docAsJsonString) as TrustEstablishmentDoc,
  } as const;
}
