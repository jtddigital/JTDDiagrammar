import type { AiAssets } from '../../registry/diagram-type.ts';
import { REWORK, RULES, type Rule, type Sap, type SapDocument, type SapReleaseStrategy, type SapStep, type SapUserStatus, type SapWorkflow } from './model.ts';

const str = { type: 'string' } as const;
const strs = { type: 'array', items: str } as const;
const bool = { type: 'boolean' } as const;
const int = { type: 'integer' } as const;
const quote = { type: 'string', description: 'Short verbatim excerpt from the material supporting this item; empty if none.' } as const;
const desc = (description: string) => ({ type: 'string', description }) as const;
/** Every property required; "", [], 0, false or "none" mean "not set" (URS-AI-004). */
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const;

/** Flat for generation: transaction control and steps are lists naming their status and workflow. */
const schema = obj({
  title: str,
  object: desc('Object, e.g. "Maintenance order (PM01)"; empty if not stated.'),
  profile: desc('Status profile, e.g. ZPMORD; empty if not stated.'),
  systemStatuses: { type: 'array', description: 'System statuses in order.', items: obj({ code: str, label: str, quote }) },
  userStatuses: {
    type: 'array',
    items: obj({
      code: str,
      label: str,
      number: { ...int, description: 'Status number; 0 for a status without one (a flag).' },
      low: { ...int, description: 'Lowest next status number; 0 if not stated.' },
      high: { ...int, description: 'Highest next status number; 0 if not stated.' },
      initial: bool,
      system: desc('System status code it is used in; empty if not stated.'),
      auth: desc('Authorization key; empty if none.'),
      quote,
    }),
  },
  transactions: { type: 'array', items: obj({ id: str, label: str, tcodes: { ...strs, description: 'Transaction codes or apps that run it, e.g. IW32; empty if not stated.' }, sets: { ...strs, description: 'System status codes it sets.' }, quote }) },
  control: {
    type: 'array',
    description: 'Transaction control: one entry per user status and business transaction the material mentions.',
    items: obj({ status: str, transaction: str, rule: { type: 'string', enum: [...RULES, 'none'] }, action: { type: 'string', enum: ['set', 'delete', 'none'], description: 'Whether the transaction sets or deletes the status.' } }),
  },
  workflows: {
    type: 'array',
    items: obj({
      id: str,
      label: str,
      triggerStatus: desc('Status code whose setting starts it; empty if not stated.'),
      event: desc('Event that starts it; empty for "<status> set".'),
      conditions: { ...strs, description: 'Start conditions.' },
      released: desc('Status code set on release; empty if none.'),
      rejected: desc('Status code set on rejection; empty if none.'),
      quote,
    }),
  },
  steps: {
    type: 'array',
    items: obj({
      workflow: str,
      id: str,
      label: desc('Empty for "Approve".'),
      recipients: str,
      conditions: { ...strs, description: 'Step conditions; the step is skipped when they do not hold.' },
      deadline: desc('E.g. "2d"; empty if not stated.'),
      tcodes: { ...strs, description: 'Transaction codes or apps the approver works in, e.g. My Inbox; empty if not stated.' },
      optional: bool,
      rework: { type: 'string', enum: [...REWORK, 'none'], description: 'After rework by the requester: repeat the step, continue, or restart; "none" if rework is not offered.' },
      quote,
    }),
  },
  documents: {
    type: 'array',
    description: 'Document flow: documents created as the object moves on.',
    items: obj({ id: str, label: str, kind: desc('Document type; empty if not stated.'), status: desc('Status code it is created in; empty if not stated.'), from: { ...strs, description: 'Preceding document ids.' }, quote }),
  },
  releaseStrategies: {
    type: 'array',
    description: 'Classic release strategies (e.g. for purchase requisitions).',
    items: obj({ id: str, label: str, document: desc('Document id it releases; empty if none.'), conditions: { ...strs, description: 'Release conditions (classification).' }, quote }),
  },
  releaseCodes: {
    type: 'array',
    description: 'Release codes of the strategies, at most eight per strategy.',
    items: obj({ strategy: str, code: desc('Two-character release code.'), label: desc('Who releases.'), prerequisites: { ...strs, description: 'Codes that must release first.' }, indicator: desc('Release indicator once released; empty if not stated.'), reject: { type: 'boolean', description: 'The holder can reject it back to the requester.' }, quote }),
  },
});

interface G {
  title: string;
  object: string;
  profile: string;
  systemStatuses: { code: string; label: string; quote: string }[];
  userStatuses: { code: string; label: string; number: number; low: number; high: number; initial: boolean; system: string; auth: string; quote: string }[];
  transactions: { id: string; label: string; tcodes: string[]; sets: string[]; quote: string }[];
  control: { status: string; transaction: string; rule: Rule | 'none'; action: 'set' | 'delete' | 'none' }[];
  workflows: { id: string; label: string; triggerStatus: string; event: string; conditions: string[]; released: string; rejected: string; quote: string }[];
  steps: { workflow: string; id: string; label: string; recipients: string; conditions: string[]; deadline: string; tcodes: string[]; optional: boolean; rework: SapStep['rework'] | 'none'; quote: string }[];
  documents: { id: string; label: string; kind: string; status: string; from: string[]; quote: string }[];
  releaseStrategies: { id: string; label: string; document: string; conditions: string[]; quote: string }[];
  releaseCodes: { strategy: string; code: string; label: string; prerequisites: string[]; indicator: string; reject: boolean; quote: string }[];
}

const text = <K extends string>(k: K, v: string | undefined) => (v ? ({ [k]: v } as Record<K, string>) : {});
const list = <K extends string, T>(k: K, v: T[] | undefined) => (v?.length ? ({ [k]: v } as Record<K, T[]>) : {});
const num = <K extends string>(k: K, v: number) => (v > 0 ? ({ [k]: v } as Record<K, number>) : {});

const guide = `Diagram type: sap (SAP status management and flexible workflow for one object, e.g. a maintenance order).
- "systemStatuses" are the system statuses in the order the object passes them (e.g. CRTD Created, REL Released, TECO Technically completed, CLSD Closed).
- "userStatuses" are the status profile's user statuses. A numbered status ("number" > 0) is one of the sequence: "low" and "high" bound the numbers of the statuses that may follow it. A status without a number ("number": 0) is a flag that can be active alongside others. Exactly one numbered status is "initial". "system" is the system status it is used in.
- "transactions" are business transactions (e.g. Release, Complete technically); "sets" lists the system statuses each sets; "tcodes" the transaction codes or apps that run it (e.g. IW32), not the transaction itself.
- "control" is transaction control: for a user status and a business transaction, whether it is "allowed", "warning" (allowed with a warning) or "forbidden" while the status is active, and whether the transaction sets or deletes the status.
- "workflows" are flexible workflows: what starts them ("triggerStatus", "event"), their start conditions, and the statuses set on release or rejection. "steps" are their approval steps in order, with recipients, step conditions, deadline, and what follows rework.
- "documents" are the document flow: documents the object creates (e.g. a purchase requisition on release), the status each is created in, and the documents each follows ("from").
- "releaseStrategies" are classic release strategies: the document each releases and its release conditions; "releaseCodes" are their release codes, each with the codes that must release first ("prerequisites") and the release indicator once released; "reject" when its holder can reject, sending the document back to the requester to change and resubmit. An object without a status profile (e.g. a purchase requisition) has no statuses: chart its documents and release strategies.
- Where the material supports an item directly, set "quote" to a short verbatim excerpt (at most 20 words). Use "", [], 0, false or "none" for anything not stated.`;

const examples = [
  {
    input:
      'Our PM orders use status profile ZPMORD. A new order starts in user status INIT (10), which can move to APPR (20); release is forbidden in INIT and allowed in APPR. Releasing sets REL. Orders over 10,000 EUR need approval by the planning manager within 2 days; approval sets APPR.',
    output: {
      title: 'Maintenance order status',
      object: 'Maintenance order',
      profile: 'ZPMORD',
      systemStatuses: [
        { code: 'CRTD', label: 'Created', quote: '' },
        { code: 'REL', label: 'Released', quote: 'Releasing sets REL' },
      ],
      userStatuses: [
        { code: 'INIT', label: 'Initial', number: 10, low: 10, high: 20, initial: true, system: 'CRTD', auth: '', quote: 'starts in user status INIT (10)' },
        { code: 'APPR', label: 'Approved', number: 20, low: 20, high: 20, initial: false, system: 'CRTD', auth: '', quote: '' },
      ],
      transactions: [{ id: 'release', label: 'Release', tcodes: ['IW32'], sets: ['REL'], quote: '' }],
      control: [
        { status: 'INIT', transaction: 'release', rule: 'forbidden', action: 'none' },
        { status: 'APPR', transaction: 'release', rule: 'allowed', action: 'none' },
      ],
      workflows: [{ id: 'approval', label: 'Order approval', triggerStatus: 'INIT', event: 'Order created', conditions: ['Estimated costs > 10,000 EUR'], released: 'APPR', rejected: '', quote: '' }],
      steps: [{ workflow: 'approval', id: 'manager', label: '', recipients: 'Planning manager', conditions: [], deadline: '2d', tcodes: [], optional: false, rework: 'none', quote: 'approval by the planning manager within 2 days' }],
      documents: [],
      releaseStrategies: [],
      releaseCodes: [],
    },
  },
];

export const sapAi: AiAssets<Sap> = {
  schema,
  guide,
  examples,
  // Control entries and steps naming unknown statuses or workflows are dropped.
  fromGenerated: (generated) => {
    const g = generated as G;
    const userStatuses: SapUserStatus[] = g.userStatuses.map((u) => {
      const mine = g.control.filter((c) => c.status === u.code);
      const control = Object.fromEntries(mine.filter((c) => c.rule !== 'none').map((c) => [c.transaction, c.rule as Rule]));
      const by = (a: 'set' | 'delete') => mine.filter((c) => c.action === a).map((c) => c.transaction);
      return {
        code: u.code,
        ...text('label', u.label),
        ...num('number', u.number),
        ...(u.number > 0 && { ...num('low', u.low), ...num('high', u.high) }),
        ...(u.initial && { initial: true }),
        ...text('system', u.system),
        ...text('auth', u.auth),
        ...(Object.keys(control).length && { control }),
        ...list('setBy', by('set')),
        ...list('deletedBy', by('delete')),
        ...text('quote', u.quote),
      };
    });
    const workflows: SapWorkflow[] = g.workflows.map((w) => ({
      id: w.id,
      label: w.label,
      ...(w.triggerStatus && { trigger: { status: w.triggerStatus, ...text('event', w.event) } }),
      ...list('conditions', w.conditions),
      steps: g.steps
        .filter((s) => s.workflow === w.id)
        .map((s) => ({
          id: s.id,
          ...text('label', s.label),
          ...text('recipients', s.recipients),
          ...list('conditions', s.conditions),
          ...text('deadline', s.deadline),
          ...list('tcodes', s.tcodes),
          ...(s.optional && { optional: true }),
          ...(s.rework && s.rework !== 'none' && { rework: s.rework }),
          ...text('quote', s.quote),
        })),
      ...text('released', w.released),
      ...text('rejected', w.rejected),
      ...text('quote', w.quote),
    }));
    const documents: SapDocument[] = (g.documents ?? []).map((d) => ({ id: d.id, label: d.label, ...text('kind', d.kind), ...text('status', d.status), ...list('from', d.from), ...text('quote', d.quote) }));
    // A strategy without release codes is dropped.
    const strategies: SapReleaseStrategy[] = (g.releaseStrategies ?? []).flatMap((r) => {
      const codes = (g.releaseCodes ?? [])
        .filter((c) => c.strategy === r.id)
        .map((c) => ({ code: c.code, ...text('label', c.label), ...list('prerequisites', c.prerequisites), ...text('indicator', c.indicator), ...(c.reject && { reject: true }), ...text('quote', c.quote) }));
      return codes.length ? [{ id: r.id, label: r.label, ...text('document', r.document), ...list('conditions', r.conditions), codes, ...text('quote', r.quote) }] : [];
    });
    return {
      version: '1',
      type: 'sap',
      title: g.title,
      ...text('object', g.object),
      ...text('profile', g.profile),
      ...(g.systemStatuses.length && { systemStatuses: g.systemStatuses.map((s) => ({ code: s.code, ...text('label', s.label), ...text('quote', s.quote) })) }),
      ...(userStatuses.length && { userStatuses }),
      ...(g.transactions.length && { transactions: g.transactions.map((t) => ({ id: t.id, ...text('label', t.label), ...list('tcodes', t.tcodes), ...list('sets', t.sets), ...text('quote', t.quote) })) }),
      ...(documents.length && { documents }),
      ...(strategies.length && { releaseStrategies: strategies }),
      // A workflow without steps is not a workflow.
      ...(workflows.some((w) => w.steps.length) && { workflows: workflows.filter((w) => w.steps.length) }),
    };
  },
};
