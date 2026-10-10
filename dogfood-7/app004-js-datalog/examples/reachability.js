import { parse, evaluate, query, magicRewrite, explain, formatExplanation } from '../src/index.js';

const program = parse(`
edge(alice,bob). edge(bob,carol). edge(dave,erin).
blocked(erin).
path(X,Y) :- edge(X,Y).
path(X,Z) :- edge(X,Y), path(Y,Z).
reachable(X,Y) :- path(X,Y), not blocked(Y).
`);
const target = parse('?- reachable(alice,Y).').queries[0];
const optimized = magicRewrite(program, target);
const result = evaluate(optimized.program);
console.log('Answers:', query(result, optimized.query));
console.log('Work:', result.stats);
console.log(formatExplanation(explain(result, optimized.query.predicate, ['alice', 'carol'])));
