const fs = require('fs');
const html = fs.readFileSync('leak-calculator.html', 'utf8');
const src = html.split('// ---- MODEL START ----')[1].split('// ---- MODEL END ----')[0];
const { computeLeak, TARGET, BEST_CASE } = (new Function(src + '\nreturn {computeLeak, TARGET, BEST_CASE};'))();

let fail = 0;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function ok(name, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   ' + extra));
  if (!cond) fail++;
}

const base = {
  enquiries: 300, actualPatients: null, treatmentValue: 1800, marketingSpend: 25000,
  answerRate: 0.65, bookRate: 0.17, showRate: 0.80, returnMultiplier: 2.4
};

// 1. stages sum exactly to the headline
let r = computeLeak(base);
let sum = r.stages.reduce((t, s) => t + s.annual, 0);
ok('stages sum to the annual headline', close(sum, r.annual, 1e-6), `${sum} vs ${r.annual}`);
ok('stage patients sum to leakPatients', close(r.stages.reduce((t,s)=>t+s.patients,0), r.leakPatients));

// 2. defaults land in a believable range
ok('best case is exactly 20% of enquiries', close(BEST_CASE, 0.20));
ok('the three stage targets multiply to exactly 20%',
   close(TARGET.answer * TARGET.book * TARGET.show, BEST_CASE, 1e-12),
   `${TARGET.answer * TARGET.book * TARGET.show}`);
ok('ceiling is 20% of enquiries, no qualification step',
   close(r.patientsAchievable, 300 * 0.20));
ok('default annual leak is 600k-900k AED', r.annual > 0.6e6 && r.annual < 0.9e6, `AED ${Math.round(r.annual).toLocaleString()}`);
ok('default implies a realistic enquiry->patient rate (6-13%)',
   r.patientsToday / 300 > 0.06 && r.patientsToday / 300 < 0.13,
   `${(r.patientsToday/300*100).toFixed(1)}%`);
ok('a clinic today can never be shown above the 20% ceiling',
   computeLeak({ ...base, actualPatients: 999 }).patientsToday <= 300 * 0.20);
ok('no stage rate option exceeds its own benchmark',
   [['answer',0.90],['book',TARGET.book],['show',0.90]].every(([k,t]) => t <= 1));

// 3. their own books override the estimate, and stages still reconcile
r = computeLeak({ ...base, actualPatients: 30 });
ok('real patient count overrides the estimate', close(r.patientsToday, 30));
ok('leak = achievable - their real number', close(r.leakPatients, 300 * 0.20 - 30));
ok('stages still sum after rescaling', close(r.stages.reduce((t,s)=>t+s.patients,0), r.leakPatients));

// 4. a clinic already at benchmark shows no leak, never a negative one
r = computeLeak({ ...base, answerRate: TARGET.answer, bookRate: TARGET.book, showRate: TARGET.show });
ok('best-in-class ops leak nothing', r.annual === 0, `AED ${r.annual}`);
ok('no negative stages', r.stages.every(s => s.patients >= 0));

// 5. reporting more patients than the benchmark allows cannot go negative
r = computeLeak({ ...base, actualPatients: 500 });
ok('over-performing clinic clamps to zero leak', r.leakPatients === 0 && r.annual === 0);

// 6. ops at benchmark but books short -> gap attributed, not lost
r = computeLeak({ ...base, answerRate: TARGET.answer, bookRate: TARGET.book, showRate: TARGET.show, actualPatients: 40 });
ok('unexplained shortfall is still attributed', close(r.stages.reduce((t,s)=>t+s.patients,0), r.leakPatients) && r.leakPatients > 0);

// 7. monotonic: answering faster must never increase the leak
const slow = computeLeak({ ...base, bookRate: 0.11 }).annual;
const fast = computeLeak({ ...base, bookRate: TARGET.book }).annual;
ok('replying faster lowers the leak', fast < slow, `${fast} !< ${slow}`);

// 8. degenerate inputs don't produce NaN
r = computeLeak({ enquiries: 0, actualPatients: null, treatmentValue: 0, marketingSpend: 0,
                  answerRate: 0.65, bookRate: 0.17, showRate: 0.80, returnMultiplier: 2.4 });
ok('zero inputs stay finite', [r.annual, r.monthly, r.wastedSpendMonthly, r.annualWithRepeatVisits].every(Number.isFinite));

// 9. wasted spend tracks the unanswered share
r = computeLeak(base);
ok('wasted ad spend = spend x unanswered share', close(r.wastedSpendMonthly, 25000 * 0.35));

console.log('\n' + (fail ? fail + ' FAILING' : 'all checks pass'));
console.log('\ndefaults ->  leak AED ' + Math.round(computeLeak(base).annual).toLocaleString('en-AE') + '/yr'
  + '   |  ' + computeLeak(base).patientsToday.toFixed(0) + ' patients today vs '
  + computeLeak(base).patientsAchievable.toFixed(0) + ' achievable'
  + '   |  ' + (computeLeak(base).patientsToday / 300 * 100).toFixed(1) + '% of enquiries convert today');
process.exit(fail ? 1 : 0);
