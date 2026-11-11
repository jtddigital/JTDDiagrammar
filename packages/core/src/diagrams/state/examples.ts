import type { Example } from '../../registry/diagram-type.ts';

export const examples: [Example, ...Example[]] = [
  {
    name: 'basic',
    title: 'State diagram',
    description: 'States, pseudostates and transitions labelled `event [guard] / action`.',
    source: {
      version: '1',
      type: 'state',
      title: 'Support ticket',
      states: [
        { id: 'start', kind: 'initial' },
        { id: 'open', label: 'Open' },
        { id: 'progress', label: 'In progress' },
        { id: 'waiting', label: 'Waiting on customer' },
        { id: 'closed', label: 'Closed' },
        { id: 'end', kind: 'final' },
      ],
      transitions: [
        { from: 'start', to: 'open' },
        { from: 'open', to: 'progress', event: 'assign' },
        { from: 'progress', to: 'waiting', event: 'ask', action: 'notify customer' },
        { from: 'waiting', to: 'progress', event: 'reply' },
        { from: 'progress', to: 'closed', event: 'resolve', guard: 'fix verified' },
        { from: 'closed', to: 'end' },
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
        { id: 'init', kind: 'initial' },
        { id: 'stopped', label: 'Stopped' },
        {
          id: 'active',
          label: 'Active',
          states: [
            { id: 'a0', kind: 'initial' },
            { id: 'playing', label: 'Playing' },
            { id: 'paused', label: 'Paused' },
          ],
        },
        { id: 'error', label: 'Error' },
      ],
      transitions: [
        { from: 'init', to: 'stopped' },
        { from: 'stopped', to: 'active', event: 'play' },
        { from: 'a0', to: 'playing' },
        { from: 'playing', to: 'paused', event: 'pause' },
        { from: 'paused', to: 'playing', event: 'resume' },
        { from: 'playing', to: 'playing', event: 'tick', action: 'advance' },
        { from: 'active', to: 'stopped', event: 'stop' },
        { from: 'playing', to: 'error', event: 'decode failure' },
      ],
    },
  },
];
