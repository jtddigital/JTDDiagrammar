import type { Expected } from './metrics.ts';

/** Evaluation corpus (URS-AI-018): material plus the minimum a correct diagram must contain. */
export const CORPUS: { name: string; type: string; text: string; expected: Expected }[] = [
  {
    name: 'expense claims (cross-functional)',
    type: 'flowchart',
    text: 'Expense claims. The employee submits a claim with receipts. The manager checks it against policy; if it complies the manager approves it, otherwise it goes back to the employee to revise. Finance reimburses approved claims and notifies the employee.',
    expected: {
      nodes: ['Submit claim', 'Check policy', 'Approve', 'Revise', 'Reimburse'],
      edges: [['Submit claim', 'Check policy'], ['Reimburse', 'Notify']],
      lanes: { 'Submit claim': 'Employee', Approve: 'Manager', Reimburse: 'Finance' },
    },
  },
  {
    name: 'password reset (plain)',
    type: 'flowchart',
    text: 'To reset a password the user requests a link. If the email is registered the system sends a link and the user sets a new password; otherwise nothing is sent.',
    expected: { nodes: ['Request link', 'Email registered?', 'Send link', 'Set new password'], edges: [['Send link', 'Set new password']] },
  },
  {
    name: 'incident response (cross-functional, auto)',
    type: 'auto',
    text: 'When monitoring raises an alert, the on-call engineer acknowledges it within 5 minutes and assesses severity. Sev-1 incidents are escalated to the incident commander, who opens a bridge and informs support. Support updates the status page. After resolution the engineer writes a postmortem.',
    expected: {
      nodes: ['Acknowledge alert', 'Assess severity', 'Escalate', 'Open bridge', 'Update status page', 'Write postmortem'],
      edges: [['Acknowledge alert', 'Assess severity']],
      lanes: { 'Acknowledge alert': 'On-call engineer', 'Open bridge': 'Incident commander', 'Update status page': 'Support' },
    },
  },
  {
    name: 'order lifecycle (state)',
    type: 'state',
    text: 'An order starts as pending. Payment moves it to paid; three failed payments cancel it. A paid order is shipped and then delivered, which ends its life. A shipped order can be returned, which refunds it.',
    expected: { nodes: ['Pending', 'Paid', 'Cancelled', 'Shipped', 'Delivered', 'Returned'], edges: [['Pending', 'Paid'], ['Paid', 'Shipped'], ['Shipped', 'Returned']] },
  },
  {
    name: 'media player (composite state)',
    type: 'state',
    text: 'The player is stopped until play is pressed. While active it is either playing or paused; pause and resume switch between them. Stop returns to stopped from either. A decoding error while playing moves the player to an error state.',
    expected: { nodes: ['Stopped', 'Active', 'Playing', 'Paused', 'Error'], edges: [['Playing', 'Paused'], ['Paused', 'Playing'], ['Playing', 'Error']] },
  },
  {
    name: 'clinic team (org chart)',
    type: 'orgchart',
    text: 'Dr Rao runs the clinic. Two nurses, Eli Grant and Fay Moss, and the office manager, Gus Hale, report to Dr Rao. A receptionist, Ida Wu, reports to Gus Hale.',
    expected: { nodes: ['Rao', 'Eli Grant', 'Fay Moss', 'Gus Hale', 'Ida Wu'], edges: [['Rao', 'Eli Grant'], ['Gus Hale', 'Ida Wu']] },
  },
];
