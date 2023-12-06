import React, { useState } from 'react';
import {
  AssertionSetTriple,
  AssertionSetTripleWithOrigin,
  JsonSchema,
  tripleToString,
} from '@/lib/trustestablishment/trustEstablishment';
import { Profile } from '@/pages/background';
import { DidIcon } from '@/components/didIcon';
import {
  ChevronLeftIcon,
  DrawingPinIcon,
  QuestionMarkCircledIcon,
  SewingPinIcon,
} from '@radix-ui/react-icons';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type ProfileProps = {
  onOtherProfileSelected: (did: string) => void;
  profile?: Profile;
  prevProfile?: {
    origin: string | undefined; //should be origin?
    did: string | undefined;
  };
  hasTabsPermission: boolean;
  onPermissionsGranted: () => void;
  onPrev: () => void;
};

export default function ProfilePage({
  onOtherProfileSelected,
  profile,
  prevProfile,
  ...props
}: ProfileProps) {
  //we change the layout a lot based on weather one of these is selected
  //todo: should probably have two components and switch between them
  //rather than spreading a bunch of conditionals all over the place
  const [selectedAssertionSet, setSelectedAssertionSet] = useState<
    string | null
  >(null);

  if (!profile) {
    return <p>loading...</p>;
  }
  if (!profile.didProfile) {
    return (
      <>
        <div className={'flex flex-col items-center text-center space-y-4'}>
          <div className={'flex flex-1 flex-row space-x-2 items-center'}>
            {profile.origin ? (
              <p className={'text-sm font-medium leading-none text-center'}>
                {new URL(profile.origin).hostname}
              </p>
            ) : (
              <p
                className={
                  'text-sm font-medium leading-none text-center text-muted-foreground'
                }
              >
                unknown
              </p>
            )}
          </div>
          <QuestionMarkCircledIcon className={'w-32 h-32'} strokeWidth={1} />
          <p className={'text-xs text-muted-foreground'}>
            This domain has no trust presence
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      <Button
        onClick={props.onPrev}
        variant={'ghost'}
        size={'icon'}
        className={`relative z-50 self-start w-6 h-6 p-0 ${
          !prevProfile && 'invisible'
        } `}
      >
        <ChevronLeftIcon />
      </Button>
      <div className={'z-10 flex flex-col items-center mb-5 -mt-4'}>
        <div
          className={
            'flex flex-none items-center justify-center justify-items-center h-8 mb-2'
          }
        >
          {/*too many divs this is stupid*/}
          {selectedAssertionSet && (
            <DidIcon
              className={'w-8 h-8 mr-1 animate-in fade-in'}
              did={profile.didProfile.did}
              onClicked={onOtherProfileSelected}
            />
          )}
          {profile.origin ? (
            <p className={'text-sm font-medium'}>
              {new URL(profile.origin).hostname}
            </p>
          ) : (
            <p
              className={
                'text-sm font-medium leading-none text-center text-muted-foreground'
              }
            >
              unknown
            </p>
          )}
          {!props.hasTabsPermission && prevProfile === undefined && (
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger className={''} asChild>
                  <Button
                    onClick={() => {
                      chrome.permissions.request(
                        {
                          permissions: ['tabs'],
                        },
                        (granted) => {
                          // The callback argument will be true if the user granted the permissions.
                          if (granted) {
                            props.onPermissionsGranted();
                          } else {
                          }
                        },
                      );
                    }}
                    size={'icon'}
                    variant={'ghost'}
                    className={'z-50 w-6 h-6 ml-1 -mr-7'}
                  >
                    <DrawingPinIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={'DidTooltipContent'}>
                  <p className={'max-h-[80px] max-w-[230px] text-xs'}>
                    Show preview in extension icon - this requires extra
                    permissions
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {!selectedAssertionSet && (
          <DidIcon
            className={'w-32 h-32 animate-in fade-in mb-2'}
            did={profile.didProfile.did}
          />
        )}
      </div>
      {profile.didProfile.assertions.length === 0 ? (
        <p className={'text-xs text-muted-foreground text-center'}>
          This domain has no trust presence
        </p>
      ) : (
        <ul
          //from: https://stackoverflow.com/questions/56153797/horizontal-scrolling-on-react-component-using-vertical-mouse-wheel
          onWheel={(e) => {
            const scaledDeltaY = e.deltaY * 0.3;
            const strength = Math.abs(scaledDeltaY);
            if (e.deltaY === 0) return;

            const el = e.currentTarget;
            if (
              !(el.scrollLeft === 0 && e.deltaY < 0) &&
              !(
                el.scrollWidth - el.clientWidth - Math.round(el.scrollLeft) ===
                  0 && e.deltaY > 0
              )
            ) {
              // e.preventDefault();
            }
            el.scrollTo({
              left: el.scrollLeft + scaledDeltaY,
              // large scrolls with smooth animation behavior will lag, so switch to auto
              behavior: strength > 15 ? 'auto' : 'smooth',
            });
          }}
          className={`flex space-x-3 ${
            profile.didProfile?.assertions.length > 1 && 'overflow-x-scroll'
          } w-200 scrollbar-h-[5px] scrollbar scrollbar-thumb-primary/80 scrollbar-track-accent/50 scrollbar-thumb-rounded-full mt-2`}
        >
          {profile.didProfile.assertions.map((triple) => (
            <li
              className={`flex-none ${
                profile.didProfile?.assertions.length === 1 && 'px-2'
              } mb-3`}
              key={tripleToString(triple)}
            >
              <AssertionCard
                triple={triple}
                selectedKey={selectedAssertionSet}
                onToggled={setSelectedAssertionSet}
                schemas={profile?.didProfile?.schemas ?? {}}
                onProfileClicked={onOtherProfileSelected}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

//this is a weird component
//i wanted to only convert the triple to its key once
//and that somehow resulted in this weird setup
function AssertionCard({
  triple,
  selectedKey,
  onToggled,
  schemas,
  onProfileClicked,
}: {
  triple: AssertionSetTripleWithOrigin;
  selectedKey: string | null;
  onToggled: (key: string | null) => void;
  schemas: Record<string, JsonSchema>;
  onProfileClicked: (did: string) => void;
}) {
  const key = tripleToString(triple);
  const selected = selectedKey !== null && key === selectedKey;
  return (
    <Card
      key={triple.predicate}
      className={
        `py-3 hover:border-foreground/30 cursor-pointer w-64 min-h-[128px] ${
          selected ? 'h-[264px]' : ''
        }` + (selected ? ' border-foreground/30' : '')
      }
      onClick={() => {
        if (selected) onToggled(null);
        else onToggled(key);
      }}
    >
      <CardHeader className={'py-0 mb-2 px-3'}>
        <div className={'flex flex-row space-x-1 items-center'}>
          <DidIcon
            className={'w-8 h-8 z-50'}
            did={triple.object}
            origin={triple.origin}
            onClicked={onProfileClicked}
          />
          <h3 className={'text-muted-foreground text-xs'}>says. . .</h3>
        </div>
      </CardHeader>
      <CardContent className={'py-0 px-6'}>
        <p className={'text-xs font-semibold'}>
          {schemas[triple.predicate]?.title ?? triple.predicate}
        </p>
        {selected && (
          <div className={'mt-3 flex flex-wrap gap-x-3 gap-y-3'}>
            {Object.entries(triple.assertions).map(([property, value]) => (
              <div key={property}>
                <p className={'mb-1 text-xs font-light leading-none'}>
                  {property}
                </p>
                <p className={'text-xs font-light text-muted-foreground'}>
                  {displayAssertion(value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// function topicInfo({ set }: { set: AssertionSetTriple }) {
//   return (
//     <Card key={set.predicate} className={'p-2'}>
//       <CardHeader className={'p-3'}>
//         <CardTitle>
//           {' '}
//           <DidIcon did={set.object} size={'10%'} /> {set.predicate}
//         </CardTitle>
//       </CardHeader>
//       <CardContent className={'grid grid-cols-2 p-3'}>
//         {Object.entries(set.assertions).map(([property, value]) => (
//           <div key={property}>
//             <p className={'text-sm font-medium leading-none'}>{property}</p>
//             <p className={'text-sm text-muted-foreground'}>
//               {JSON.stringify(value)}
//             </p>
//           </div>
//         ))}
//       </CardContent>
//     </Card>
//   );
// }

function displayAssertion(assertion: unknown) {
  if (typeof assertion === 'object') {
    //lazy, todo figure out how to display nested assertions better
    return JSON.stringify(assertion);
  }
  return (assertion as any).toString();
}
