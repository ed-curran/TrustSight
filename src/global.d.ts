declare module '*.svg' {
  import React = require('react');
  export const ReactComponent: React.SFC<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

declare module '*.json' {
  const content: string;
  export default content;
}

declare module 'level' {
  export default function level(
    name: string,
    options?: { valueEncoding: string },
  ): any;
}

//we gotta type this ourselves yay
declare module 'levelgraph' {
  export type Triple<
    T extends Record<string, unknown> = Record<string, unknown>,
  > = {
    subject: string;
    object: string;
    predicate: string;
  } & T;

  export interface LevelGraph {
    put<T extends Triple>(
      triple: T | T[],
      callback: (err: Error) => void,
    ): void;
    get<T extends Triple>(
      triple: Partial<Triple>,
      callback: (err: Error, result: T[]) => void,
    ): void;
  }

  export default function levelgraph(db: any): LevelGraph;
}
