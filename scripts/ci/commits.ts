/**
 * URS-NF-004: every commit in the pushed range carries an impact assessment (URS §5).
 * Usage: tsx scripts/ci/commits.ts <base> <head>. Merge commits are exempt. With no base (a new
 * branch), the whole history of head is checked.
 */
import { execFileSync } from 'node:child_process';

const [base, head] = process.argv.slice(2);
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const ok = (...a: string[]) => {
  try {
    execFileSync('git', a, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
// A force-push (e.g. a branch restarted from main after a merge) leaves `base` unknown or off the
// new history: then check what the branch adds to main.
const follows = base && !/^0+$/.test(base) && ok('merge-base', '--is-ancestor', base, head!);
const range = follows ? `${base}..${head}` : base && !/^0+$/.test(base) ? `origin/main..${head}` : head!;
const shas = git('rev-list', '--no-merges', range).split('\n').filter(Boolean);
const missing = shas.filter((sha) => !/^URS impacted:/m.test(git('log', '-1', '--format=%B', sha)));
for (const sha of missing) console.error(`${sha.slice(0, 8)} ${git('log', '-1', '--format=%s', sha)}: no "URS impacted:" section`);
console.log(`${shas.length - missing.length}/${shas.length} commits carry an impact assessment`);
process.exit(missing.length ? 1 : 0);
