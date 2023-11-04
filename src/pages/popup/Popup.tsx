import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GetProfile,
  GetProfileResponse,
  Identifier,
  Profile,
} from '@/pages/background';
import { TrustDocImporter } from './trustDocImporter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfilePage from './profilePage';
import { DidIcon } from '@/components/didIcon';

export default function Popup() {
  const [domainProfile, setDomainProfile] = useState<Profile | null>(null);
  // const [currentDomainIdentifier, setCurrentDomainIdentifier] = useState<{
  //   type: 'origin';
  //   origin: string;
  // } | null>(null);

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const updateProfile = useCallback((identifier: Identifier) => {
    chrome.runtime
      .sendMessage({
        type: 'getProfile',
        payload: { identifier: identifier },
      } satisfies GetProfile)
      .then((response: GetProfileResponse) => {
        if (response.payload && domainProfile === null)
          setCurrentProfile({
            origin: response.payload.origin,
            didProfile: response.payload.didProfile,
          });
      });
  }, []);

  useEffect(() => {
    chrome.tabs.query({ active: true }).then(([activeTab]) => {
      if (!activeTab.id || !activeTab.url) return;

      const { origin } = new URL(activeTab.url);
      const originIdentifier = { type: 'origin', origin } as const;

      chrome.runtime
        .sendMessage({
          type: 'getProfile',
          payload: { identifier: originIdentifier },
        } satisfies GetProfile)
        .then((response: GetProfileResponse) => {
          if (response.payload) {
            setDomainProfile(response.payload);
            setCurrentProfile(response.payload);
          }
        });
    });
  }, []);

  const profileIsDomain =
    currentProfile?.didProfile?.did === domainProfile?.didProfile?.did;

  const profilesStack = useRef<Profile[]>([]);

  return (
    <div className="absolute top-0 left-0 right-0 bottom-0 h-full">
      <Tabs defaultValue="domain" className="">
        <TabsList className="grid w-full grid-cols-2 h-10">
          <TabsTrigger value="domain">
            {!profileIsDomain && domainProfile?.didProfile && (
              <DidIcon
                className={'w-6 h-6 mr-1 animate-in fade-in'}
                did={domainProfile.didProfile.did}
                onClicked={() => {
                  profilesStack.current = [];
                  setCurrentProfile(domainProfile);
                }}
              />
            )}
            Domain
          </TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>
        <TabsContent value="domain" className={'px-3 pb-3'}>
          {currentProfile ? (
            <ProfilePage
              profile={currentProfile}
              key={currentProfile.didProfile?.did ?? currentProfile.origin}
              prevProfile={
                profilesStack.current[profilesStack.current.length - 1] && {
                  //stupid
                  origin:
                    profilesStack.current[profilesStack.current.length - 1]
                      .origin,
                  did: profilesStack.current[profilesStack.current.length - 1]
                    .didProfile?.did,
                }
              }
              onOtherProfileSelected={(did) => {
                profilesStack.current.push(currentProfile);
                updateProfile({ type: 'did', did });
              }}
              onPrev={() => {
                const prev = profilesStack.current.pop();
                if (prev) setCurrentProfile(prev);
              }}
            />
          ) : (
            <p>not a domain</p>
          )}
        </TabsContent>
        <TabsContent value="import" className={'mt-0'}>
          <TrustDocImporter origin={origin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
