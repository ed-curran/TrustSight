//promisify the levelgraph api because i'm not ready to go back to the callback life man
import { LevelGraph } from 'levelgraph';
import { promisify } from 'es6-promisify';

export function promisifyLevelGraph(graph: LevelGraph) {
  return {
    ...graph,
    get: promisify(graph.get),
    put: promisify(graph.put),
    del: promisify(graph.del)
  };
}
