import type { Example } from '../../registry/diagram-type.ts';

export const examples: [Example, ...Example[]] = [
  {
    name: 'basic',
    title: 'Gantt chart',
    description: 'Phases with tasks inside (summaries roll up), finish-to-start links, an approval gate and a launch milestone. Weekends are shaded and skipped.',
    source: {
      version: '1',
      type: 'gantt',
      title: 'Website relaunch',
      start: '2027-01-04',
      tasks: [
        { id: 'discovery', name: 'Discovery', tasks: [
          { id: 'research', name: 'User research', duration: 5, owner: 'UX' },
          { id: 'reqs', name: 'Requirements', duration: 3, owner: 'Product', after: ['research'] },
        ] },
        { id: 'design', name: 'Design', tasks: [
          { id: 'wire', name: 'Wireframes', duration: 5, owner: 'UX', after: ['reqs'] },
          { id: 'visual', name: 'Visual design', duration: 8, owner: 'UX', after: ['wire'] },
          { id: 'signoff', name: 'Design sign-off', type: 'gate', after: ['visual'] },
        ] },
        { id: 'build', name: 'Build', tasks: [
          { id: 'front', name: 'Front end', duration: 10, owner: 'Dev', after: ['signoff'] },
          { id: 'back', name: 'Back end', duration: 12, owner: 'Dev', after: ['reqs'] },
          { id: 'test', name: 'Integration test', duration: 4, owner: 'QA', after: ['front', 'back'] },
        ] },
        { id: 'launch', name: 'Launch', type: 'milestone', after: ['test'] },
      ],
    },
  },
  {
    name: 'links',
    title: 'Gantt chart, link types',
    description: 'All four links: finish-to-start (with a buffer), start-to-start with a lag, finish-to-finish, and start-to-finish; a deliverable at the end.',
    source: {
      version: '1',
      type: 'gantt',
      title: 'Small build: link types',
      start: '2027-04-05',
      tasks: [
        { id: 'pour', name: 'Pour foundation', duration: 4 },
        { id: 'cure', name: 'Cure', type: 'buffer', duration: 5, after: ['pour'] },
        { id: 'frame', name: 'Frame', duration: 6, after: ['cure'] },
        { id: 'materials', name: 'Deliver materials (SF)', duration: 3, after: ['frame SF'] },
        { id: 'inspect', name: 'Inspect framing (SS+3)', duration: 2, after: ['frame SS+3'] },
        { id: 'wiring', name: 'Wiring (FF+2)', duration: 4, after: ['frame FF+2'] },
        { id: 'drawings', name: 'As-built drawings', type: 'deliverable', after: ['wiring', 'inspect'] },
      ],
    },
  },
  {
    name: 'styled',
    title: 'Gantt chart, styled',
    description: 'Styles by owner and type, a tag, three levels of items, external work (dashed), a buffer, a gate and a deliverable; a holiday and a deadline. The legend lists what is used.',
    source: {
      version: '1',
      type: 'gantt',
      title: 'Clinical study start-up',
      start: '2027-03-01',
      deadline: '2027-06-30',
      calendar: { holidays: ['2027-05-31'] },
      styleBy: {
        type: { gate: { stroke: '#7c3aed' }, milestone: { stroke: '#0f172a' } },
        owner: { Clinical: { fill: '#dbeafe', stroke: '#2563eb' }, Regulatory: { fill: '#ede9fe', stroke: '#7c3aed' }, Vendor: { fill: '#fef3c7', stroke: '#d97706' } },
      },
      tags: { critical: { stroke: '#dc2626', lineWidth: 2.5 } },
      tasks: [
        { id: 'protocol', name: 'Protocol', tasks: [
          { id: 'draft', name: 'Draft protocol', duration: 10, owner: 'Clinical', tags: ['critical'] },
          { id: 'review', name: 'Medical review', duration: 5, owner: 'Clinical', after: ['draft'] },
          { id: 'final', name: 'Final protocol', type: 'deliverable', after: ['review'] },
        ] },
        { id: 'reg', name: 'Regulatory', tasks: [
          { id: 'prep', name: 'Submission prep', duration: 8, owner: 'Regulatory', after: ['final'], tags: ['critical'] },
          { id: 'irb', name: 'Ethics review', tasks: [
            { id: 'irbreview', name: 'IRB review', type: 'external', duration: 15, owner: 'Vendor', after: ['prep'] },
            { id: 'approval', name: 'IRB approval', type: 'gate', after: ['irbreview'] },
          ] },
        ] },
        { id: 'sites', name: 'Site start-up', tasks: [
          { id: 'select', name: 'Site selection', duration: 10, owner: 'Clinical', after: ['draft SS+5'] },
          { id: 'contracts', name: 'Site contracts', type: 'external', duration: 12, owner: 'Vendor', after: ['select'] },
          { id: 'reserve', name: 'Contract reserve', type: 'buffer', duration: 5, after: ['contracts'] },
          { id: 'siv', name: 'First site initiated', type: 'milestone', after: ['approval', 'reserve'] },
        ] },
      ],
    },
  },
];
