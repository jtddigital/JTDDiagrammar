import type { Example } from '../../registry/diagram-type.ts';

export const examples: [Example, ...Example[]] = [
  {
    name: 'basic',
    title: 'State diagram',
    description: 'States, pseudostates and transitions (each state lists its outgoing ones in `to`), labelled `event [guard] / action`.',
    source: {
      version: '1',
      type: 'state',
      title: 'Support ticket',
      states: [
        { id: 'start', kind: 'initial', to: [{ state: 'open' }] },
        { id: 'open', label: 'Open', to: [{ state: 'progress', event: 'assign' }] },
        {
          id: 'progress',
          label: 'In progress',
          to: [
            { state: 'waiting', event: 'ask', action: 'notify customer' },
            { state: 'closed', event: 'resolve', guard: 'fix verified' },
          ],
        },
        { id: 'waiting', label: 'Waiting on customer', to: [{ state: 'progress', event: 'reply' }] },
        { id: 'closed', label: 'Closed', to: [{ state: 'end' }] },
        { id: 'end', kind: 'final' },
      ],
    },
  },
  {
    name: 'composite',
    title: 'Composite state diagram',
    description: 'Nested states, a transition out of an inner state, and a self-transition.',
    source: {
      version: '1',
      type: 'state',
      title: 'Media player',
      states: [
        { id: 'init', kind: 'initial', to: [{ state: 'stopped' }] },
        { id: 'stopped', label: 'Stopped', to: [{ state: 'active', event: 'play' }] },
        {
          id: 'active',
          label: 'Active',
          states: [
            { id: 'a0', kind: 'initial', to: [{ state: 'playing' }] },
            {
              id: 'playing',
              label: 'Playing',
              to: [
                { state: 'paused', event: 'pause' },
                { state: 'playing', event: 'tick', action: 'advance' },
                { state: 'error', event: 'decode failure' },
              ],
            },
            { id: 'paused', label: 'Paused', to: [{ state: 'playing', event: 'resume' }] },
          ],
          to: [{ state: 'stopped', event: 'stop' }],
        },
        { id: 'error', label: 'Error' },
      ],
    },
  },
];
