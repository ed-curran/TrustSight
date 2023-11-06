import React, { useEffect, useState } from 'react';
import {
  fetchDoc,
  JsonSchema,
  parseDoc,
  summariseDoc,
  toTopics,
  TrustDocSummary,
  TrustEstablishmentDoc,
} from '@/lib/trustestablishment/trustEstablishment';
import { TrashIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  BackgroundMessage,
  ClearState,
  FindDocsResponse,
  ImportDoc,
  ImportDocResponse,
  ResolveSchemas,
  ResolveSchemasResponse,
} from '@/pages/background';
import { DidIcon } from '@/components/didIcon';
import { Textarea } from '@/components/ui/textarea';
import { cx } from 'class-variance-authority';

export type TrustDocImporterProps = {
  origin: string;
};

type ImportStatus = {
  imported: boolean;
  error: string | undefined;
};

type TrustDocImport = TrustDocSummary & ImportStatus;

export const TrustDocImporter = (props: TrustDocImporterProps) => {
  const [trustDocs, setTrustDocs] = useState<TrustDocImport[] | null>(null);
  const [trustDocsManual, setTrustDocsManual] = useState<TrustDocImport[]>([]);
  const [topicSchemas, setTopicSchemas] = useState<Map<
    string,
    JsonSchema
  > | null>(null);

  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: 'findDocs' } satisfies BackgroundMessage)
      .then((response: FindDocsResponse) => {
        const topicSchemas = new Map(
          response.payload.schemas.map((schema) => [schema.$id, schema]),
        );
        const docs = response.payload.docs.map((doc) => ({
          imported: false,
          error: undefined,
          ...summariseDoc(doc, topicSchemas),
        }));
        setTrustDocs(docs);
        setTopicSchemas(topicSchemas);
      });
  }, []);

  const importDoc = async (doc: TrustEstablishmentDoc, index: number) => {
    const response: ImportDocResponse = await chrome.runtime.sendMessage({
      type: 'importDoc',
      payload: { doc },
    } satisfies ImportDoc);

    setTrustDocs((docs) => {
      if (!docs) return null;
      const current = docs[index];
      if (response.payload.err) {
        docs[index] = {
          ...current,
          error: response.payload.err,
        };
        return Array.from(docs);
      }
      docs[index] = {
        ...current,
        imported: true,
      };
      return Array.from(docs);
    });
  };

  const importDocManual = async (doc: TrustEstablishmentDoc, index: number) => {
    const response: ImportDocResponse = await chrome.runtime.sendMessage({
      type: 'importDoc',
      payload: { doc },
    } satisfies ImportDoc);

    setTrustDocsManual((docs) => {
      const current = docs[index];
      if (response.payload.err) {
        docs[index] = {
          ...current,
          error: response.payload.err,
        };
        return Array.from(docs);
      }
      docs[index] = {
        ...current,
        imported: true,
      };
      return Array.from(docs);
    });
  };

  const [mode, setMode] = useState<'domain' | 'manual'>('domain');
  return (
    <>
      <div
        className={
          'bg-accent px-3 h-10 flex flex-row items-center font-medium justify-between'
        }
      >
        <div className={'flex flex-row items-center font-medium'}>
          <p className={''}>
            {mode === 'domain' ? 'Found on domain' : 'Added manually'}
          </p>
          <Button
            onClick={() => {
              if (mode === 'domain') setMode('manual');
              else setMode('domain');
            }}
            size={'sm'}
            variant={'link'}
            className={'ml-2 px-0 py-0 h-4 text-muted-foreground'}
          >
            {mode === 'domain' ? '(switch to manual)' : '(switch to automatic)'}
          </Button>
        </div>
        {mode === 'manual' && (
          <Button
            className={'h-6 w-6'}
            size={'icon'}
            variant={'destructive'}
            onClick={() => {
              chrome.runtime.sendMessage({ type: 'clearState' } as ClearState).then(() => chrome.permissions.remove({
                permissions: ['tabs']
              }))
            }}
          >
            <TrashIcon />
          </Button>
        )}
      </div>
      {mode === 'domain' ? (
        trustDocs ? (
          <TrustDocList trustDocs={trustDocs} onImport={importDoc} />
        ) : (
          <p className={'ml-2 mt-2'}>searching current page...</p>
        )
      ) : (
        <>
          <div className={'p-3'}>
            <AddTrustDocForm
              className={'mb-3'}
              onAdded={(docSummary) => {
                setTrustDocsManual((docs) => {
                  return docs.concat({
                    imported: false,
                    error: undefined,
                    ...docSummary,
                  });
                });
              }}
            />
            <Separator className={''} />
          </div>
          <TrustDocList
            trustDocs={trustDocsManual}
            onImport={importDocManual}
            className={'mb-3'}
          />
        </>
      )}
      {/* eslint-disable-next-line react/jsx-no-undef */}
    </>
  );
};

function TrustDocList({
  trustDocs,
  onImport,
  ...props
}: {
  trustDocs: TrustDocImport[];
  onImport: (trustDoc: TrustEstablishmentDoc, index: number) => void;
  className?: string;
}) {
  if (trustDocs.length === 0) {
    return <p className={cx('ml-3 mt-2', props.className)}>none found</p>;
  }
  return (
    <ul className={cx('gap-y-2', props.className)}>
      {trustDocs.map(
        (
          {
            doc,
            imported,
            error,
            topics,
            uniqueSubjectsCount,
            assertionsCount,
          },
          index,
        ) => (
          <li key={doc.id} className={'p-3'}>
            <div className={'grid grid-cols-8 mb-2'}>
              <div
                className={'col-span-2 space-y-2 flex flex-col items-center'}
              >
                <DidIcon did={doc.author} className={'w-12 h-12 -ml-1'} />
                <p>{doc.version}</p>
                {imported ? (
                  <p>imported</p>
                ) : error ? (
                  <p>{error}</p>
                ) : (
                  <Button
                    onClick={() => onImport(doc, index)}
                    size={'sm'}
                    variant={'secondary'}
                  >
                    Import
                  </Button>
                )}
              </div>
              <div className={'col-span-6 pl-2'}>
                <p className="font-medium text-muted-foreground mb-1">id</p>
                <p className={'font-bold leading-none tracking-tight mb-2'}>
                  {doc.id}
                </p>
                <p className="font-medium text-muted-foreground mb-1">
                  subjects
                </p>
                <p className={'font-bold leading-none tracking-tight mb-2'}>
                  {uniqueSubjectsCount}
                </p>
                <p className="font-medium text-muted-foreground mb-1">topics</p>
                <ul className={'mb-2'}>
                  {topics.map(({ id, title }) => (
                    <li key={id}>
                      <p className={'font-bold leading-none tracking-tight'}>
                        {title}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Separator />
          </li>
        ),
      )}
    </ul>
  );
}

type AddTrustDocProps = {
  onAdded: (trustDocSummary: TrustDocSummary) => void;
  className?: string;
};
function AddTrustDocForm({ onAdded, ...props }: AddTrustDocProps) {
  const [error, setError] = useState<string | null>(null);
  const add = async (docJsonOrLink: string) => {
    const result = docJsonOrLink.startsWith('http')
      ? await fetchDoc(docJsonOrLink, undefined)
      : parseDoc(docJsonOrLink);

    if (result.status === 'failure') {
      //gross
      setError((result.error as any).toString());
      return;
    }
    const doc = result.doc;
    const topics = toTopics(doc);
    chrome.runtime
      .sendMessage({
        type: 'resolveSchemas',
        payload: { topics },
      } satisfies ResolveSchemas)
      .then((response: ResolveSchemasResponse) => {
        if (response.payload.status === 'failure') {
          setError(response.payload.error);
          return;
        }
        const schemas = new Map(
          response.payload.schemas.map((schema) => [schema.$id, schema]),
        );
        const summary = summariseDoc(doc, schemas);
        onAdded(summary);
        setError(null);
      });
  };
  return (
    <form
      className={cx('space-y-2', props.className)}
      onSubmit={(e) => {
        // Prevent the browser from reloading the page
        e.preventDefault();

        // Read the form data
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const docOrLink = formData.get('doc');
        if (docOrLink) {
          add(docOrLink as string).then(() => form.reset());
        }
      }}
    >
      <Textarea
        className={'text-xs'}
        name={'doc'}
        placeholder={'link or trust establishment document'}
      ></Textarea>
      <Button type={'submit'} size={'sm'}>
        View
      </Button>
      {error && <label className={'ml-3'}>{error}</label>}
    </form>
  );
}

// <p className={'ml-2 mt-2'}>searching current page...</p>
