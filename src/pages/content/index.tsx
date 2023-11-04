import './style.css';

//find all links on this page
function jsonLinks() {
  const linkElements = document.querySelectorAll('a');
  return Array.from(linkElements.values())
    .filter((element) => element.href && element.href.endsWith('.json'))
    .map((element) => element.href);
}

export type ContentMessage = GetLinks | GetLinksResponse | SetIcon;
export type GetLinks = {
  type: 'getLinks';
};

export type GetLinksResponse = {
  type: 'getLinksResponse';
  payload: {
    links: string[];
  };
};

//we need a canvas element to render the icon
export type SetIcon = {
  type: 'setIcon';
  payload: {
    tabId: number;
    did: string;
  };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const typedMessage = message as ContentMessage;
  switch (typedMessage.type) {
    case 'getLinks': {
      const response: GetLinksResponse = {
        type: 'getLinksResponse',
        payload: {
          links: jsonLinks(),
        },
      };
      sendResponse(response);
      return true;
    }
  }
});
